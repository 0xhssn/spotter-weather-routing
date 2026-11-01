import bisect
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from django.conf import settings

from .geometry import MILE_M, corridor_grid, sample, weather_key
from .providers import ProviderError, fetch_routes, fetch_weather
from .risk import classify, recommend, summarize


def read_weather(hourly, at):
    times = hourly["time"]
    stamp = at.timestamp()
    if stamp < times[0] or stamp > times[-1]:
        raise ProviderError("Forecast does not cover the full trip. Choose an earlier departure or a shorter route.")
    i = bisect.bisect_left(times, stamp)
    def number(name, index=i, factor=1):
        value = hourly[name][index]
        if (isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value)
                or (name != "temperature_2m" and value < 0)):
            raise ProviderError("Forecast data is missing at a checkpoint; a safe comparison cannot be made.")
        return value / factor
    def instant(name):
        after = number(name)
        if times[i] == stamp:
            return after
        before = number(name, i-1)
        fraction = (stamp-times[i-1]) / (times[i]-times[i-1])
        return before + fraction*(after-before)
    return {
        "wind_mph": instant("wind_speed_10m"), "gust_mph": number("wind_gusts_10m"),
        "rain_in": (number("rain") + number("showers")) / 25.4,
        "snow_in": number("snowfall", factor=2.54), "temperature_f": instant("temperature_2m"),
        "forecast_at": datetime.fromtimestamp(times[i], timezone.utc).isoformat(),
    }


def build_plan(origin, destination, departure, load, spacing, example=False):
    warnings = []
    if example:
        paths = json.loads((Path(__file__).parent / "fixtures" / "routes.json").read_text())
        origin = {"label": "Los Angeles, California, US", "lat": 34.0522, "lon": -118.2437}
        destination = {"label": "Phoenix, Arizona, US", "lat": 33.4484, "lon": -112.074}
        warnings.append("Example scenario: recorded road routes and simulated weather. Use Compare live routes for current forecasts.")
    else:
        paths = fetch_routes(origin, destination, load)
    if any(p["distance_m"] / MILE_M > 1500 for p in paths):
        raise ValueError("This free-tier demo supports routes up to 1,500 miles. Choose closer locations.")
    sampled = [sample(path, spacing) for path in paths]
    grid = corridor_grid(paths)
    locations = sorted({weather_key(p[0], p[1]) for route in sampled for p in route} | set(grid))
    if len(locations) > 650:
        raise ValueError("Too many forecast locations. Choose 25 or 50 mile checkpoint spacing.")
    latest = max(departure + timedelta(seconds=p["duration_s"]) for p in paths)
    if latest > datetime.now(timezone.utc) + timedelta(days=15) and not example:
        raise ValueError("Arrival falls outside the forecast horizon. Choose an earlier departure.")
    start = departure.replace(minute=0, second=0, microsecond=0)
    end = (max(departure + timedelta(hours=48), latest) + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    forecasts = synthetic_weather(locations, start, end) if example else fetch_weather(locations, start, end)
    routes = []
    for path, samples in zip(paths, sampled):
        checkpoints = []
        for i, (lon, lat, meters, seconds) in enumerate(samples):
            eta = departure + timedelta(seconds=seconds)
            weather = read_weather(forecasts[weather_key(lon, lat)], eta)
            risk = classify(weather["wind_mph"], weather["rain_in"], weather["snow_in"], load)
            checkpoints.append({"id": f"{path['id']}-cp-{i}", "lon": lon, "lat": lat,
                                "mile": meters/MILE_M, "eta": eta.isoformat(), "weather": weather, "risk": risk})
        vertices = path["vertices"]
        # Keep bends on the map while capping payload size. Checkpoint interpolation
        # above always uses the original, full road geometry.
        stride = max(1, len(vertices)//3500)
        coords = [[v[0], v[1]] for v in vertices[::stride]]
        if coords[-1] != vertices[-1][:2]: coords.append(vertices[-1][:2])
        routes.append({"id": path["id"], "name": path["name"], "via": path["via"],
                       "distance_miles": path["distance_m"]/MILE_M, "duration_s": path["duration_s"],
                       "arrival": (departure+timedelta(seconds=path["duration_s"])).isoformat(),
                       "geometry": {"type": "LineString", "coordinates": coords},
                       "checkpoints": checkpoints, "summary": summarize(checkpoints, path["duration_s"])})
    heatmap = []
    for lon, lat in grid:
        hourly = forecasts[(lon, lat)]
        values = []
        for h in range(49):
            weather = read_weather(hourly, departure + timedelta(hours=h))
            risk = classify(weather["wind_mph"], weather["rain_in"], weather["snow_in"], load)
            values.append(risk["score"])
        heatmap.append({"lon": lon, "lat": lat, "scores": values})
    recommended = recommend(routes)
    if recommended is None:
        warnings.append("All routes contain No Travel conditions. No route is recommended; change departure or wait for conditions to improve.")
    if len(routes) < 3:
        warnings.append(f"The routing service found {len(routes)} distinct route(s). No duplicate routes have been added.")
    routing_name = "Valhalla / OpenStreetMap"
    if not example and settings.ROUTING_PROVIDER == "osrm":
        routing_name = "OSRM / OpenStreetMap"
        warnings.append("Road routes use a car profile and do not validate truck height, weight restrictions, closures, or hours of service. ETAs are estimates without traffic or rest stops.")
    else:
        warnings.append("Road routes assume a standard semi: 13 ft 6 in high, 8 ft 6 in wide, 71 ft long, with 30,000 lb empty weight plus cargo. Verify actual vehicle dimensions, restrictions and closures. ETAs exclude traffic and rest stops.")
    return {"mode": "example" if example else "live", "origin": origin, "destination": destination,
            "departure": departure.isoformat(), "load_lb": load, "spacing_miles": spacing,
            "routes": routes, "recommended_id": recommended, "heatmap": heatmap,
            "forecast_hours": 48, "forecast_locations": len(locations),
            "generated_at": datetime.now(timezone.utc).isoformat(), "warnings": warnings,
            "providers": {"routing": routing_name, "weather": "Simulated example" if example else "Open-Meteo", "geocoding": "Open-Meteo / GeoNames"}}


def synthetic_weather(locations, start, end):
    """Explicitly opt-in example data, never used as a live API fallback."""
    count = int((end-start).total_seconds()/3600)+1
    results = {}
    for lon, lat in locations:
        hours = list(range(count))
        wind = [max(8, 18 + 19*math.sin((lon+116)*1.3 + h*.13) + 8*(lat-33.5)) for h in hours]
        rain = [max(0, math.sin((lon+114)*1.7 + h*.2)) * 7 for h in hours]
        results[(lon, lat)] = {"time": [int(start.timestamp())+h*3600 for h in hours],
                               "wind_speed_10m": wind, "wind_gusts_10m": [w+8 for w in wind],
                               "rain": rain, "showers": [0]*count, "snowfall": [0]*count,
                               "temperature_2m": [72+10*math.sin(h*.2) for h in hours]}
    return results
