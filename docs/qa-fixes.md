# QA follow-up — November 1, 2026

This implements the valid findings from the supplied QA brief while preserving the assessment risk table, strict load boundaries, worst-adjacent-checkpoint mileage and lexicographic recommendation order. `risk.py` is unchanged. The original 47 tests remain in the suite.

| Finding | Resolution |
|---|---|
| F1: long-haul routing | Distinguish distance/no-route 422 errors from outages/timeouts (503). An unchecked-by-default form option permits OSRM car-profile comparison only after a truck-router distance rejection; outages never silently downgrade. Car restrictions/ETA warnings appear above the cards and in map summaries. Support routes up to 5,000 miles, with an adaptive corridor grid and forecast coverage through final arrival. |
| F2: reviewer throttling | Complete-plan cache checked before a fixed 30/minute/IP budget. Invalid inputs and provider failures do not consume it. Return Retry-After and display a countdown. |
| F3: slider cost | Forecast state lives in ForecastPanel. Cards, recommendation, checkpoint table, route lines and markers are isolated/memoized. Canvas work is coalesced by requestAnimationFrame. A regression test checks that slider input does not render the unrelated result components. |
| F4: heatmap visibility | Low-risk fields are nearly transparent. Severe/No Travel have larger extents and stronger opacity, with maximum-risk overlap preserved. Base tiles are muted and route colors are distinct blue/cyan tones. Verified using deterministic example fixtures. |
| F5: location/error clarity | US country filter is explicit in geocoding and input placeholders; configurable with GEOCODING_COUNTRY. No-route errors are specific 422 responses. Invalid dates get a friendly message. |
| F6: timezone | Enter departure in the origin IANA timezone. Retain that zone while editing/replacing the city; display all trip times with the origin-zone abbreviation. Test UTC+8 viewing, DST transitions, ambiguous and nonexistent local times. |
| F7: recommendation tone | Single-route copy, prominent provider notices, amber High/red Severe caution tone, neutral selected-card styling, and risk-colored recommendation badges. No Travel remains excluded. |
| F8: payload and latency | Keep batched/parallel weather calls; increase batch size to 100, share a 23-second request budget, and allow one bounded transient retry. Simplify only display geometry with Douglas–Peucker; score full geometry. Enable JSON gzip in Django/Nginx. |
| F9: markers | Thin overlapping Low checkpoints at low zoom, keep every Moderate-or-higher point plus endpoints, and use smaller alternative-route markers. Full checkpoint data remains available in the table and scoring. |
| F10: minute mismatch | Shared minute rounding for duration, displayed arrival, calendar dates and timezone-aware labels. |
| F11: route labels | Use roads unique to alternatives where available; deterministic northern/southern corridor names for recorded geometry without road-name details. |
| F12: risk bars | Positional strips in segment order; origin left, destination right, with an accessible description. |
| F13: selected line | Dedicated selected-route pane, full opacity and white casing; checkpoint markers remain above it. |
| F14: tile seams | Transparent tile outlines and no container scaling; check again on the target deployment/browser at DPR 2. |
| F15: accessibility/polish | Explicit route names, associated layer labels, forecast aria-valuetext, gusts in checkpoint details, friendly timeout/proxy/validation errors. |
| D1–D3 | Document sustained-wind policy, conservative adjacent-interval mileage, and rain+showers. Existing rain/showers, snow, load-boundary and ranking tests remain passing. |

Additional regression found during browser QA: the initial example could overwrite an origin being typed while the request was pending. Preserve concurrent edits and mark the displayed example stale. Test this race. Make the desktop sidebar scrollable so the added fallback control does not hide the compare/example buttons in short windows.

## Checks actually performed

- A GitHub Actions workflow runs regression checks on pushes to main and pull requests.
- 55 Django tests and 30 frontend tests pass; Django system checks and TypeScript/Vite production build pass.
- Tests run with `TZ=Asia/Makassar`, including the origin-time and DST cases.
- Original scoring module compared byte-for-byte with the initial commit and left unchanged.
- Live comparisons: LA–Phoenix (3 truck routes, 8.16 s, 9.7 KB gzip), Denver–Chicago at 10 mi (3 truck routes, 4.81 s, 43.7 KB), LA–Dallas (2 car-profile routes with opt-in, 4.27 s, 27.4 KB), Houston–Chicago (2 car-profile routes, 4.55 s, 19.9 KB), Seattle–Miami (2 car-profile routes, 4.64 s, 57.9 KB). These are individual local observations, not a statistically established p95 or provider availability guarantee. Two initial public-provider failures were followed by successful rechecks; bounded retries were added and tested.
- Live browser: US city selection; origin zone changes from PDT to MDT for Denver; Denver–Chicago at 10-mile spacing; route selection; checkpoint table; 0–48h slider; no captured app console errors.
- Development profiler on Denver–Chicago, with all layers on and checkpoint table open, over 12 slider steps: React commits 2.0–2.9 ms; heatmap draw 0.2–0.5 ms. This measures those operations, not an end-to-end browser trace. The render-isolation test verifies the cards/recommendation/table do not render during these steps.
- Separate local fixture server: one Severe route gets caution styling and the honest single-route copy; 30,001 lb at 45 mph makes No Travel and removes the recommendation. Screenshots `qa-severe.png` and `qa-no-travel.png` show explicitly simulated example data.
- At 390×844, document width and scroll width are both 390px. Map, warning, layers and forecast controls remain usable. Viewport restored. Capture: `qa-mobile.png`.

## Reproduce the visual fixtures

Run `.venv/bin/python scripts/qa_fixture_server.py`. In another terminal, from `frontend`, run `API_PROXY_TARGET=http://127.0.0.1:8101 npm run dev -- --port 5175`. Use **Load example scenario**, not Compare live routes. At 20,000 lb the wind fixture is Severe; at 30,001 lb it is No Travel. This separate QA server is never used by the normal API or deployment.

Remaining limits: public routing/weather availability, per-process rate/cache state, the explicit car-profile limitations on long-haul comparisons, actual deployment verification and a broader cold-request latency sample. Docker execution and DPR-2 tile-seam verification are not claimed here. GitHub reviewer access, hosting, Loom and questionnaire submission remain delivery tasks.
