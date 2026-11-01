import hashlib
import json
import math
import time
from .budget import parallel_map, seconds_left

import httpx
from django.conf import settings
from django.core.cache import cache

from .geometry import distance, parse_osrm_route, sample


class ProviderError(Exception):
    def __init__(self, message, status=503, code='provider_unavailable'):
        super().__init__(message)
        self.status, self.code = status, code


def provider_failure(data, status):
    code = str(data.get('code', data.get('error_code', ''))) if isinstance(data, dict) else ''
    if code in ('154', 'DistanceExceeded', 'TooBig'):
        raise ProviderError('This truck router cannot cover this trip distance. Enable the optional car-profile comparison, or use a truck router with a higher distance limit.', 422, 'route_too_long')
    if code in ('170', '171', '172', 'NoRoute', 'NoSegment', 'NoSuchRoute'):
        raise ProviderError('No drivable route connects these places. Choose locations on a connected road network.', 422, 'no_route')
    if status == 429 or status >= 500:
        raise ProviderError('A routing or weather service is temporarily unavailable or rate-limited. Try again shortly.')
    if status >= 400:
        raise ProviderError('The provider cannot plan this trip. Check the locations, distance and departure time.', 422, 'unsupported_trip')


def get_json(url, params, ttl=600):
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        return cached
    for attempt in range(2):
        remaining = seconds_left()
        if remaining < .1:
            raise ProviderError('The comparison reached its time limit. Try again; completed provider requests are cached.', code='provider_timeout')
        try:
            response = httpx.get(url, params=params, timeout=min(8, remaining), headers={
                'User-Agent': 'SpotterAssessment/1.0 (weather-route-planner)',
                'X-Client-Id': settings.ROUTING_CLIENT_ID,
            })
            if response.status_code in (429, 502, 503, 504) and attempt == 0:
                try: delay = max(.25, float(response.headers.get('Retry-After', '.25')))
                except ValueError: delay = .25
                if delay <= 2 and seconds_left() > delay+1:
                    time.sleep(delay)
                    continue
            try:
                value = response.json()
            except ValueError as exc:
                raise ProviderError('A provider returned an unreadable response. Try again shortly.') from exc
            provider_failure(value, response.status_code)
            if isinstance(value, dict) and value.get('error'):
                raise ProviderError('The weather service cannot cover this request. Choose an earlier departure or shorter trip.', 422, 'forecast_unavailable')
        except httpx.TimeoutException as exc:
            if attempt == 0 and seconds_left() > 2:
                continue
            raise ProviderError('A provider timed out. Try again shortly.', code='provider_timeout') from exc
        except httpx.HTTPError as exc:
            raise ProviderError('A routing or weather service is unavailable. Try again shortly.') from exc
        cache.set(key, value, ttl)
        return value


def geocode(query):
    data = get_json(settings.GEOCODING_BASE_URL + "/v1/search", {"name": query, "count": 6, "language": "en", "format": "json", "countryCode": settings.GEOCODING_COUNTRY}, ttl=86400)
    try:
        return [{"id": str(p["id"]), "label": ", ".join(filter(None, [p["name"], p.get("admin1"), p.get("country_code")])),
                 "lat": p["latitude"], "lon": p["longitude"], "timezone": p.get("timezone", "UTC")}
                for p in data.get("results", [])]
    except (AttributeError, TypeError, KeyError) as exc:
        raise ProviderError("City search returned incomplete data. Try again shortly.") from exc


def route_payload(data):
    provider_failure(data, 200)
    if not isinstance(data, dict) or data.get("code") != "Ok":
        raise ProviderError("No drivable route connects these places.", 422, "no_route")
    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        raise ProviderError("The routing service returned no routes. Try different locations.")
    return routes


def _osrm(coords, alternatives=2):
    coordinate_string = ";".join(f"{lon:.6f},{lat:.6f}" for lon, lat in coords)
    data = get_json(settings.OSRM_BASE_URL + "/route/v1/driving/" + coordinate_string, {
        "alternatives": alternatives, "steps": "true", "geometries": "geojson", "overview": "full",
        "radiuses": ";".join("10000" for _ in coords),
    }, ttl=3600)
    return route_payload(data)


def routing_request(coords, alternatives, load_lb):
    if settings.ROUTING_PROVIDER == "osrm":
        return _osrm(coords, alternatives)
    locations = [{"lon": lon, "lat": lat} for lon, lat in coords]
    for location in locations[1:-1]:
        # Generated corridor waypoints are not delivery stops. Avoid a U-turn
        # or snapping a synthetic waypoint to a local access/track road.
        location.update(type="through", search_cutoff=50000,
                        search_filter={"min_road_class": "secondary"})
    query = {
        "locations": locations,
        "costing": "truck", "alternates": alternatives,
        "costing_options": {"truck": {
            "weight": (load_lb + 30000) * 0.00045359237,
            "height": 4.11, "width": 2.6, "length": 21.64,
            "exclude_unpaved": True,
        }},
        "format": "osrm", "shape_format": "geojson",
    }
    # Compact JSON also avoids '+'-encoded whitespace rejected by some servers.
    data = get_json(settings.VALHALLA_BASE_URL + "/route", {
        "json": json.dumps(query, separators=(",", ":")),
    }, ttl=3600)
    return route_payload(data)


def parsed_route(raw, index):
    try:
        return parse_osrm_route(raw, index)
    except (ValueError, TypeError, KeyError, IndexError, AttributeError, OverflowError) as exc:
        raise ProviderError("The routing service returned invalid road geometry or travel times. Try again shortly.") from exc


def fetch_routes(origin, destination, load_lb, allow_road_fallback=False):
    start, end = (origin["lon"], origin["lat"]), (destination["lon"], destination["lat"])
    road_profile = settings.ROUTING_PROVIDER == 'osrm'
    def request(coords, alternatives):
        return _osrm(coords, alternatives) if road_profile else routing_request(coords, alternatives, load_lb)
    try:
        raw = request([start, end], 2)
    except ProviderError as exc:
        if not allow_road_fallback or exc.code != 'route_too_long':
            raise
        road_profile = True
        raw = request([start, end], 2)
    if not isinstance(raw, list) or not raw:
        raise ProviderError("The routing service returned no routes.")
    routes, fingerprints = [], []
    def add_route(candidate, detour=False):
        parsed = parsed_route(candidate, len(routes))
        parsed["routing_profile"] = "car" if road_profile else "truck"
        if routes and (parsed["distance_m"] > routes[0]["distance_m"] * 1.65
                       or parsed["duration_s"] > routes[0]["duration_s"] * 1.8):
            return
        fp = {(round(v[0], 2), round(v[1], 2)) for v in sample(parsed, 2)}
        if any(len(fp & other) / max(1, len(fp | other)) > .90 for other in fingerprints):
            return
        if detour:
            parsed["via"] = "Via alternate corridor · " + parsed["via"]
        routes.append(parsed)
        fingerprints.append(fp)
    for candidate in raw[:3]:
        add_route(candidate)
    # The alternative-route API may return fewer than three. Request bounded,
    # road-routed detours instead of duplicating or fabricating route geometry.
    if len(routes) < 3 and not road_profile:
        midpoint = ((start[0]+end[0])/2, (start[1]+end[1])/2)
        dx = (end[0]-start[0]) * math.cos(math.radians(midpoint[1]))
        dy = end[1]-start[1]
        norm = math.hypot(dx, dy) or 1
        offset = min(25, max(8, distance(start, end)/1609.344 * .07)) / 69
        def detour(signed_offset):
            via = (midpoint[0] - dy/norm*signed_offset/max(.1, math.cos(math.radians(midpoint[1]))), midpoint[1] + dx/norm*signed_offset)
            try:
                return request([start, via, end], 0)[0]
            except ProviderError:
                return None
        # Try a second, wider corridor only if nearby waypoints snap back onto
        # the same highway. At most four detour requests per comparison.
        for width in (offset, offset*2.4):
            if len(routes) == 3:
                break
            if seconds_left() < 3:
                break
            candidates = parallel_map(detour, [-width, width], workers=2)
            for candidate in candidates:
                if candidate is None or len(routes) == 3:
                    continue
                try:
                    add_route(candidate, detour=True)
                except ProviderError:
                    # A failed optional detour must not discard valid main routes.
                    continue
    label_routes(routes)
    return routes


def label_routes(routes):
    primary = set(routes[0].get("roads", {}))
    base_lat = sum(v[1] for v in routes[0]["vertices"])/len(routes[0]["vertices"])
    used = set()
    for index, route in enumerate(routes):
        unique = sorted(((name, length) for name, length in route.get("roads", {}).items() if name not in primary), key=lambda item: -item[1])
        if index:
            latitude = sum(v[1] for v in route["vertices"])/len(route["vertices"])
            corridor = "Northern" if latitude > base_lat else "Southern"
            route["via"] = " · ".join(name for name, _ in unique[:2]) or f"{corridor} corridor · {route['via'].removeprefix('Via alternate corridor · ')}"
        if route["via"] in used:
            route["via"] += f" · Alternative {index+1}"
        used.add(route["via"])


WEATHER_UNITS = {"time": "unixtime", "wind_speed_10m": "mp/h", "wind_gusts_10m": "mp/h",
                 "rain": "mm", "showers": "mm", "snowfall": "cm", "temperature_2m": "°F"}


def validate_forecast(item, start, end):
    """Validate once at the provider boundary, before sampling any risk."""
    if not isinstance(item, dict) or not isinstance(item.get("hourly"), dict):
        raise ProviderError("Weather provider returned an invalid forecast.")
    units = item.get("hourly_units")
    if not isinstance(units, dict) or any(units.get(k) != v for k, v in WEATHER_UNITS.items()):
        raise ProviderError("Weather provider returned unexpected forecast units.")
    hourly = item["hourly"]
    times = hourly.get("time")
    if not isinstance(times, list) or not times:
        raise ProviderError("Weather provider returned incomplete forecast hours.")
    for name in WEATHER_UNITS:
        values = hourly.get(name)
        if not isinstance(values, list) or len(values) != len(times):
            raise ProviderError("Weather provider returned incomplete forecast hours.")
        if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v)
               or (name != "temperature_2m" and v < 0) for v in values):
            raise ProviderError("Weather provider returned missing or invalid forecast values.")
    if any(b-a != 3600 for a, b in zip(times, times[1:])):
        raise ProviderError("Weather provider returned missing or unordered forecast hours.")
    if times[0] > start.timestamp() or times[-1] < end.timestamp():
        raise ProviderError("Forecast does not cover the full trip and 48-hour timeline. Choose an earlier departure.")
    return hourly


def fetch_weather(points, start, end):
    def batch(chunk):
        data = get_json(settings.WEATHER_BASE_URL + "/v1/forecast", {
            "latitude": ",".join(str(p[1]) for p in chunk),
            "longitude": ",".join(str(p[0]) for p in chunk),
            "hourly": "wind_speed_10m,wind_gusts_10m,rain,showers,snowfall,temperature_2m",
            "wind_speed_unit": "mph", "temperature_unit": "fahrenheit", "precipitation_unit": "mm",
            "timeformat": "unixtime", "timezone": "GMT",
            "start_hour": start.strftime("%Y-%m-%dT%H:00"), "end_hour": end.strftime("%Y-%m-%dT%H:00"),
        })
        data = data if isinstance(data, list) else [data]
        if len(data) != len(chunk):
            raise ProviderError("Weather provider returned incomplete location coverage.")
        result = {}
        for point, item in zip(chunk, data):
            result[point] = validate_forecast(item, start, end)
        return result
    chunks = [points[i:i+100] for i in range(0, len(points), 100)]
    result = {}
    for item in parallel_map(batch, chunks):
        result.update(item)
    return result
