import hashlib
import threading
import time
import json
import math
from datetime import datetime, timedelta, timezone
from functools import wraps

from django.conf import settings
from django.core.cache import cache
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from .budget import provider_budget
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .providers import ProviderError, geocode
from .service import build_plan


def errors(view):
    @wraps(view)
    def wrapped(request):
        try:
            return view(request)
        except ProviderError as exc:
            return JsonResponse({"error": str(exc), "code": exc.code}, status=exc.status)
        except (ValueError, TypeError, KeyError, OverflowError) as exc:
            return JsonResponse({"error": str(exc) if isinstance(exc, ValueError) else "Invalid trip input."}, status=400)
    return wrapped


def finite(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} must be between {low:,} and {high:,}.")
    return value


def place(value):
    if not isinstance(value, dict): raise ValueError("Select an origin and destination from the search results.")
    result = {"label": str(value.get("label", "Location"))[:150],
              "lat": finite(value.get("lat"), "Latitude", -85, 85),
              "lon": finite(value.get("lon"), "Longitude", -180, 180)}
    zone = value.get('timezone')
    if zone:
        try: ZoneInfo(zone)
        except (ZoneInfoNotFoundError, TypeError, ValueError): raise ValueError('Select a city with a valid timezone.')
        result['timezone'] = zone
    return result


def inputs(data):
    if not isinstance(data, dict): raise ValueError("Expected a JSON object.")
    try:
        departure = datetime.fromisoformat(str(data.get("departure", "")).replace("Z", "+00:00"))
    except (ValueError, TypeError, OverflowError):
        raise ValueError('Departure must be an ISO 8601 date-time with a timezone.')
    if departure.tzinfo is None: raise ValueError("Departure must include a timezone.")
    departure = departure.astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if departure < now-timedelta(minutes=10) or departure > now+timedelta(days=7):
        raise ValueError("Choose a departure between now and seven days from now.")
    load = finite(data.get("load_lb", 20000), "Load weight (lb)", 0, 100000)
    spacing = data.get("spacing_miles", 25)
    if isinstance(spacing, bool) or spacing not in (10, 25, 50): raise ValueError("Checkpoint spacing must be 10, 25 or 50 miles.")
    return departure, load, spacing


@require_GET
def health(request):
    return JsonResponse({"status": "ok"})


@require_GET
@errors
def places(request):
    query = request.GET.get("q", "").strip()
    if not 2 <= len(query) <= 100: return JsonResponse({"results": []})
    return JsonResponse({"results": geocode(query)})


_rate_lock = threading.Lock()


def reserve_request(ip):
    key = 'plans:'+ip
    with _rate_lock:
        state = cache.get(key)
        now = time.time()
        if state is None or state['reset'] <= now:
            state = {'count': 0, 'reset': now+60}
        wait = max(1, math.ceil(state['reset']-now))
        if state['count'] >= settings.PLAN_RATE_LIMIT:
            return key, state['reset'], wait
        state['count'] += 1
        cache.set(key, state, wait)
        return key, state['reset'], 0


def refund_request(key, reset):
    with _rate_lock:
        state = cache.get(key)
        if state and state['reset'] == reset:
            state['count'] = max(0, state['count']-1)
            cache.set(key, state, max(1, math.ceil(reset-time.time())))


@csrf_exempt
@require_POST
@errors
def plan(request):
    if request.content_type != "application/json": raise ValueError("Send application/json.")
    data = json.loads(request.body)
    departure, load, spacing = inputs(data)
    origin, destination = place(data.get("origin")), place(data.get("destination"))
    if abs(origin["lat"]-destination["lat"]) + abs(origin["lon"]-destination["lon"]) < .01:
        raise ValueError("Choose different origin and destination locations.")
    fallback = data.get('allow_road_fallback', False)
    if not isinstance(fallback, bool): raise ValueError('Car-profile fallback must be true or false.')
    signature = [origin, destination, departure.isoformat(), load, spacing, fallback,
                 settings.ROUTING_PROVIDER, settings.VALHALLA_BASE_URL, settings.OSRM_BASE_URL, settings.WEATHER_BASE_URL]
    key = 'plan:'+hashlib.sha256(json.dumps(signature, sort_keys=True).encode()).hexdigest()
    cached = cache.get(key)
    if cached is not None:
        response = JsonResponse(cached)
        response['X-Plan-Cache'] = 'HIT'
        return response
    rate_key, reset, wait = reserve_request(request.META.get('REMOTE_ADDR', 'local'))
    if wait:
        response = JsonResponse({'error': f'Please wait {wait} seconds before comparing a new trip.', 'code': 'rate_limited', 'retry_after': wait}, status=429)
        response['Retry-After'] = str(wait)
        return response
    try:
        with provider_budget():
            result = build_plan(origin, destination, departure, load, spacing, allow_road_fallback=fallback)
    except Exception:
        refund_request(rate_key, reset)
        raise
    cache.set(key, result, 300)
    response = JsonResponse(result)
    response['X-Plan-Cache'] = 'MISS'
    return response


@require_GET
@errors
def example(request):
    departure = (datetime.now(timezone.utc)+timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    load = finite(float(request.GET.get("load_lb", 20000)), "Load weight (lb)", 0, 100000)
    spacing = int(request.GET.get("spacing_miles", 25))
    if spacing not in (10, 25, 50): raise ValueError("Checkpoint spacing must be 10, 25 or 50 miles.")
    return JsonResponse(build_plan({}, {}, departure, load, spacing, example=True))
