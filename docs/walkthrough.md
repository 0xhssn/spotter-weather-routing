# Loom walkthrough outline (5–10 minutes)

1. **0:00–0:45 — Goal and stack.** A driver enters cities, departure, cargo weight, and checkpoint spacing. React/TypeScript UI, Django API, Valhalla truck routes, Open-Meteo forecasts. Explain the assumed semi dimensions and empty weight immediately.
2. **0:45–2:00 — Trip comparison.** Start with the clearly labeled example; compare three corridors, mileage, time, severe/high mileage bars. Explain why the recommended route can be longer.
3. **2:00–3:15 — Map and weather.** Select each route; inspect checkpoint ETA and weather. Open the checkpoint table, change the corridor slider, play animation, toggle layers, and fit the map. Explain that the slider does not change the arrival-aware recommendation.
4. **3:15–4:15 — Live providers.** Search cities and run Compare live routes. If the public API returns fewer than three viable options or a provider error, show the explicit state. Do not represent example weather as live.
5. **4:15–5:30 — Correctness.** Show `risk.py`: maximum weather category, strict load overrides, blocked-route exclusion, distance weighting, lexicographic ranking. Show shared threshold choices and final partial interval.
6. **5:30–6:30 — Time and performance.** Show step-based ETA sampling, UTC hourly forecast lookup, rain/snow conversions, batched requests/cache, and preloaded 49-frame heatmap.
7. **6:30–7:30 — Verification and deployment.** Run tests/build, show Docker topology and environment configuration. State actual live/API/browser checks, known limitations, and what would change for a production truck-routing service.

Before submission: verify reviewer access to the GitHub repository, deploy with TLS and production settings, record your own Loom, then submit the three links through the hiring questionnaire. The email asks for no more than four days and 16 work hours. No submission or video recording is automated here.
