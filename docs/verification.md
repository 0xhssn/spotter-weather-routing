# Verification record

This file records only checks actually performed. The review below supersedes the initial test counts and fixture routing details.

- Python dependencies resolved into pinned `backend/requirements.txt`.
- Frontend dependencies pinned in `frontend/package-lock.json`.
- Initial implementation: 22 Django tests passed; Django system check reports no issues.
- TypeScript check and Vite production build pass.
- Three real truck-route fixtures fetched from Valhalla: Los Angeles–Phoenix direct plus southern and northern waypoint detours. Example weather is explicitly synthetic. Recorded routes used 20,000 lb cargo plus 30,000 lb assumed empty weight.
- Real Open-Meteo city lookup returned Seattle, Washington and an end-to-end OSRM/weather API comparison returned HTTP 200. Valhalla truck routing was then verified separately, returning three distinct routes with bounded detours, and made the default.
- Browser checks: example loading; route selection; checkpoint table; explanation dialog and Escape/focus return; slider updates; basemap and heatmap rendering; mobile layout at 390px. A layer ordering issue and an API-key-only basemap were found and fixed.
- Final live browser check: keyboard city autocomplete/selection, then Los Angeles–Phoenix with 20,000 lb cargo returned three Valhalla truck routes and current Open-Meteo weather, displayed as LIVE FORECAST. The chosen recommendation was one of the eligible routes. A 390px document width check found no horizontal overflow. Desktop viewport restored afterward.
- Source, ignored local environment, dependencies, and build verified in `/Users/hhassan/projects/hiring/spotter-weather-routing`. No remote Git repository, deployment, questionnaire submission, or Loom video was created.
- Compose YAML parses and `web`/`backend` service references match. Docker daemon is stopped and the Docker Compose CLI plugin is unavailable on this machine; `docker compose config` and actual container startup could not be run. Container behavior remains unverified.


## Assignment review — October 30, 2026

The review was checked against both pages of `assessment.pdf`. New regression tests reproduced failures before the fixes were applied.

| Issue | Fix and regression coverage |
|---|---|
| Wind at a checkpoint used the next hour, potentially replacing current dangerous wind with a calm future reading. | Interpolate instantaneous wind/temperature at ETA; retain hourly accumulated precipitation and gust maxima. Test 60 → 0 mph five minutes after the first reading produces 55 mph. |
| A stationary routing maneuver lost its time, redistributing the delay over the entire route. | Preserve its elapsed time at the maneuver location; verify checkpoint ETAs before and after the delay. |
| Native provider alternatives could be duplicates; only generated detours were deduplicated. | Apply the same identity and distance/time bounds to every candidate; test duplicate replacements and the honest one-route outcome. |
| Synthetic waypoints were delivery stops and could lead into minor access roads. | Use Valhalla through-points constrained to secondary-or-higher roads; try a second bounded corridor if necessary. Refresh the recorded example from the corrected live adapter. |
| Malformed forecast times, values and units could be accepted; bad routes could return 400/500. | Validate provider contracts and return explicit 503 service errors. Cover nulls, booleans, negatives, nonfinite values, missing/duplicate/reversed hours, unexpected units, invalid geometry, and zero duration. |
| Late autocomplete responses and external city resets left stale results/text/errors. | Ignore cancelled responses; distinguish typing from external selection/reset; disable swapping until both cities are selected. Cover typing, reset, cancellation, error recovery and keyboard selection. |
| Low-risk heatmap samples could paint over more dangerous ones. | Render a categorical maximum-risk field, independent of sample order; test overlap and transparency outside the corridor. |
| Route comparison hid average risk, rounded small positive risk miles to zero, and lacked route-summary map popups. | Expose the comparison values, preserve fractional risk mileage, add route popups and snow in checkpoint popups; make table detail controls keyboard accessible. |
| HTML proxy errors surfaced as JSON parser failures. | Show an actionable service-unavailable message while preserving backend validation messages. |

Validation after fixes:

- **34 Django tests** pass, including live-plan orchestration at 10/25/50 mile spacing, all routes blocked by a load override, and a fast route excluded by weather specifically at its arrival time.
- **13 Vitest / Testing Library tests** pass. `make test` runs both suites.
- Django system checks and TypeScript/Vite production build pass.
- Live Valhalla comparison returned three distinct Los Angeles–Phoenix truck routes: approximately 374 miles / 6h23m, 439 miles / 7h44m, and 439 miles / 7h31m. The northern and southern alternatives were visually verified. Example fixtures were refreshed from those responses at 20,000 lb cargo.
- Live browser comparison successfully fetched and validated Open-Meteo forecasts, displayed LIVE FORECAST, and selected an eligible route. The 0–48h slider and keyboard checkpoint table controls were exercised; arrival scores remained unchanged when scrubbing the corridor forecast.
- Mobile viewport at 390×844 has no horizontal overflow (document and scroll width both 390px); map, legend, timeline and layer controls are usable. Desktop viewport restored.
- Desktop and mobile review captures: `review-desktop.jpg`, `review-mobile.jpg`.

Remaining assignment delivery gaps: hosted application and 5–10 minute Loom walkthrough; the private GitHub repository will need reviewer access before submission. Docker execution remains unverified on this machine because the daemon/Compose tooling were unavailable during initial implementation. A public free-tier routing API cannot guarantee three distinct viable routes for every endpoint pair; the app reports the actual count.


## Repository setup — November 1, 2026

- Created `https://github.com/0xhssn/spotter-weather-routing` as a private repository under `0xhssn`.
- Re-ran all 34 backend tests, 13 frontend tests, the production build, and Django system checks successfully before the initial commit.
- Reviewed the 54-file initial source inventory for credential patterns. Local `.env`, environment variants, virtualenv, dependencies, build outputs, and caches are excluded; `.env.example` is included.
- Hosting, the Loom recording, reviewer access and the questionnaire submission remain pending.


## QA brief follow-up — November 1, 2026

See `qa-fixes.md` for the implemented findings, preserved scoring behavior, expanded 85-test regression suite, live long-haul checks, render measurements and deterministic risk-state screenshots. This supersedes earlier application limits, timing display and test counts.
