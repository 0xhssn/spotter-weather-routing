"""Assessment rules. Distances and averages use miles, never checkpoint counts."""
import math

LEVELS = ("Low", "Moderate", "High", "Severe", "No Travel")


def classify(wind_mph: float, rain_in: float, snow_in: float, load_lb: float) -> dict:
    if any(not math.isfinite(v) or v < 0 for v in (wind_mph, rain_in, snow_in, load_lb)):
        raise ValueError("Weather and load must be finite, nonnegative numbers.")
    wind = 4 if wind_mph >= 55 else 3 if wind_mph >= 45 else 2 if wind_mph >= 35 else 1 if wind_mph >= 25 else 0
    # Shared table boundaries take the higher category. The >1 and >3 limits
    # are strictly greater, as specified in the brief.
    rain = 4 if rain_in > 1 else 3 if rain_in >= .5 else 2 if rain_in >= .25 else 1 if rain_in >= .1 else 0
    snow = 4 if snow_in > 3 else 3 if snow_in >= 2 else 2 if snow_in >= 1 else 1 if snow_in >= .5 else 0
    load_risk = 4 if wind_mph >= 45 and load_lb > 30000 else 3 if wind_mph >= 35 and load_lb > 40000 else 0
    score = max(wind, rain, snow, load_risk)
    reasons = []
    if wind: reasons.append(f"Wind {wind_mph:.1f} mph")
    if rain: reasons.append(f"Rain {rain_in:.2f} in/hr")
    if snow: reasons.append(f"Snow {snow_in:.2f} in/hr")
    if load_risk > wind: reasons.append(f"Load rule: {load_lb:,.0f} lb")
    return {"score": score, "level": LEVELS[score], "reasons": reasons or ["Below all risk thresholds"]}


def summarize(checkpoints: list[dict], duration_s: float) -> dict:
    miles = [0.0] * 5
    segments = []
    for a, b in zip(checkpoints, checkpoints[1:]):
        length = b["mile"] - a["mile"]
        score = max(a["risk"]["score"], b["risk"]["score"])
        miles[score] += length
        segments.append({"from": a["id"], "to": b["id"], "score": score, "miles": round(length, 3)})
    total = sum(miles)
    return {
        "risk_miles": dict(zip(LEVELS, miles)),
        "average_risk": sum(i * m for i, m in enumerate(miles)) / total if total else 0,
        "eligible": not any(c["risk"]["score"] == 4 for c in checkpoints),
        "max_risk": max((c["risk"]["score"] for c in checkpoints), default=0),
        "duration_s": duration_s,
        "segments": segments,
    }


def recommend(routes: list[dict]) -> str | None:
    eligible = [r for r in routes if r["summary"]["eligible"]]
    if not eligible:
        return None
    return min(eligible, key=lambda r: (
        r["summary"]["risk_miles"]["Severe"],
        r["summary"]["risk_miles"]["High"],
        r["summary"]["average_risk"],
        r["duration_s"],
    ))["id"]
