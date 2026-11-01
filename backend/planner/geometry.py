"""Interpolate provider road geometry with step-specific travel times."""
import bisect
import math

MILE_M = 1609.344


def distance(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (*a, *b))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371008.8 * 2 * math.asin(min(1, math.sqrt(h)))


def parse_osrm_route(raw: dict, index: int) -> dict:
    def number(value, positive=False):
        if (isinstance(value, bool) or not isinstance(value, (int, float))
                or not math.isfinite(value) or value < 0 or (positive and value == 0)):
            raise ValueError("Invalid route distance or duration.")
        return value

    total_distance = number(raw["distance"], positive=True)
    total_duration = number(raw["duration"], positive=True)
    vertices = []
    roads = {}
    walked = elapsed = 0.0
    for leg in raw["legs"]:
        for step in leg["steps"]:
            coords = step["geometry"]["coordinates"]
            step_distance, step_duration = number(step["distance"]), number(step["duration"])
            name = (step.get('ref') or step.get('name') or '').strip()
            if name:
                roads[name] = roads.get(name, 0)+step_distance
            if not coords:
                raise ValueError("Routing provider returned missing road geometry.")
            for point in coords:
                if (len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float))
                                          or not math.isfinite(v) for v in point)
                        or not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90):
                    raise ValueError("Routing provider returned invalid coordinates.")
            if vertices and distance(vertices[-1][:2], coords[0]) > 25:
                raise ValueError("Routing provider returned disconnected road geometry.")
            lengths = [distance(a, b) for a, b in zip(coords, coords[1:])]
            total = sum(lengths)
            if not vertices and coords:
                vertices.append([*coords[0], 0.0, 0.0])
            if total == 0:
                if step_distance:
                    raise ValueError("Routing provider returned missing road geometry.")
                # Preserve a stationary maneuver's time here, not across the
                # rest of the trip through the total-duration normalization.
                elapsed += step_duration
                if step_duration:
                    vertices.append([*coords[-1], walked, elapsed])
                continue
            if step_distance == 0 or step_duration == 0:
                raise ValueError("Routing provider returned an untimed road segment.")
            for point, length in zip(coords[1:], lengths):
                fraction = length / total if total else 0
                walked += step_distance * fraction
                elapsed += step_duration * fraction
                vertices.append([*point, walked, elapsed])
    if len(vertices) < 2 or walked <= 0 or elapsed <= 0:
        raise ValueError("Routing provider returned an empty route.")
    for v in vertices:
        v[2] *= total_distance / walked
        v[3] *= total_duration / elapsed
    return {
        "id": f"route-{index + 1}", "name": f"Route {index + 1}",
        "via": " · ".join(leg.get("summary", "") for leg in raw["legs"]) or "Road corridor",
        "distance_m": raw["distance"], "duration_s": raw["duration"], "vertices": vertices, "roads": roads,
    }


def point_at(route, meters):
    vs = route["vertices"]
    if meters <= 0:
        return list(vs[0])
    if meters >= route["distance_m"]:
        return list(vs[-1])
    ds = route.get("_distances")
    if ds is None:
        ds = route["_distances"] = [v[2] for v in vs]
    index = max(1, min(len(vs)-1, bisect.bisect_left(ds, meters)))
    a, b = vs[index-1], vs[index]
    ratio = (meters - a[2]) / (b[2] - a[2]) if b[2] > a[2] else 0
    return [a[j] + ratio * (b[j] - a[j]) for j in range(4)]


def sample(route, interval_miles):
    end = route["distance_m"]
    targets = [i * interval_miles * MILE_M for i in range(math.ceil(end / (interval_miles * MILE_M)))]
    targets.append(end)
    return [point_at(route, meters) for meters in targets]


def weather_key(lon, lat):
    return round(lon, 3), round(lat, 3)


def corridor_grid(routes, interval_miles=40):
    """Three lanes across a +/-20 mile corridor, sampled every 40 miles."""
    points = set()
    for route in routes:
        for v in sample(route, interval_miles):
            ahead = point_at(route, min(route["distance_m"], v[2] + MILE_M))
            behind = point_at(route, max(0, v[2] - MILE_M))
            dx = (ahead[0] - behind[0]) * math.cos(math.radians(v[1]))
            dy = ahead[1] - behind[1]
            length = math.hypot(dx, dy) or 1
            for offset in (-20, 0, 20):
                lat = v[1] + (dx / length) * offset / 69.0
                lon = v[0] - (dy / length) * offset / (69.0 * max(.1, math.cos(math.radians(v[1]))))
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    points.add(weather_key(lon, lat))
    return sorted(points)


def simplify_geometry(vertices, tolerance=60):
    """Douglas–Peucker display geometry in meters; scoring uses full vertices."""
    if len(vertices) < 3:
        return [v[:2] for v in vertices]
    scale = math.cos(math.radians(sum(v[1] for v in vertices)/len(vertices)))
    points = [(v[0]*111195*scale, v[1]*111195) for v in vertices]
    keep = {0, len(points)-1}
    stack = [(0, len(points)-1)]
    while stack:
        first, last = stack.pop()
        ax, ay = points[first]
        bx, by = points[last]
        dx, dy = bx-ax, by-ay
        denominator = dx*dx+dy*dy
        maximum, farthest = tolerance*tolerance, None
        for i in range(first+1, last):
            x, y = points[i]
            ratio = max(0, min(1, ((x-ax)*dx+(y-ay)*dy)/denominator)) if denominator else 0
            squared = (x-ax-ratio*dx)**2+(y-ay-ratio*dy)**2
            if squared > maximum:
                maximum, farthest = squared, i
        if farthest is not None:
            keep.add(farthest)
            stack.extend([(first, farthest), (farthest, last)])
    return [vertices[i][:2] for i in sorted(keep)]
