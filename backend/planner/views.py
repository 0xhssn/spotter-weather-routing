import json
import math
from datetime import datetime, timedelta, timezone
from functools import wraps

from django.core.cache import cache
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
            return JsonResponse({"error": str(exc)}, status=503)
        except (ValueError, TypeError, KeyError, OverflowError) as exc:
            return JsonResponse({"error": str(exc) if isinstance(exc, ValueError) else "Invalid trip input."}, status=400)
    return wrapped


def finite(value, label, low, high):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{label} must be between {low:,} and {high:,}.")
    return value


def place(value):
    if not isinstance(value, dict): raise ValueError("Select an origin and destination from the search results.")
    return {"label": str(value.get("label", "Location"))[:150],
            "lat": finite(value.get("lat"), "Latitude", -85, 85),
            "lon": finite(value.get("lon"), "Longitude", -180, 180)}


def inputs(data):
    if not isinstance(data, dict): raise ValueError("Expected a JSON object.")
    departure = datetime.fromisoformat(str(data.get("departure", "")).replace("Z", "+00:00"))
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


@csrf_exempt
@require_POST
@errors
def plan(request):
    if request.content_type != "application/json": raise ValueError("Send application/json.")
    # Plans do not mutate user data. Bound upstream work for public deployments.
    key = "plans:" + request.META.get("REMOTE_ADDR", "local")
    count = cache.get(key, 0)
    if count >= 12: return JsonResponse({"error": "Please wait a minute before comparing more routes."}, status=429)
    cache.set(key, count+1, 60)
    data = json.loads(request.body)
    departure, load, spacing = inputs(data)
    origin, destination = place(data.get("origin")), place(data.get("destination"))
    if abs(origin["lat"]-destination["lat"]) + abs(origin["lon"]-destination["lon"]) < .01:
        raise ValueError("Choose different origin and destination locations.")
    return JsonResponse(build_plan(origin, destination, departure, load, spacing))


@require_GET
@errors
def example(request):
    departure = (datetime.now(timezone.utc)+timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    load = finite(float(request.GET.get("load_lb", 20000)), "Load weight (lb)", 0, 100000)
    spacing = int(request.GET.get("spacing_miles", 25))
    if spacing not in (10, 25, 50): raise ValueError("Checkpoint spacing must be 10, 25 or 50 miles.")
    return JsonResponse(build_plan({}, {}, departure, load, spacing, example=True))
