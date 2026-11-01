# Waywise · Spotter full-stack assessment

Repository: [0xhssn/spotter-weather-routing](https://github.com/0xhssn/spotter-weather-routing) (private).

Live assessment: [Waywise](https://waywise-gsei.onrender.com/) · [API health](https://waywise-api-8xlf.onrender.com/api/health). Hosted on Render from November 2, 2026. **Suspend the paid API by November 15, 2026 at 23:59 WITA (UTC+8)**, or earlier when review is complete. Shutdown is manual; this deployment does not automatically expire.

A React + TypeScript and Django app that compares road routes using weather at each checkpoint's estimated arrival time, load-sensitive risk rules, and a preloaded 0–48 hour corridor forecast.

![Verified live route comparison](docs/preview.jpg)

## Run locally

Requires Python 3.11+ and Node.js 22.12+ on the 22.x line, or Node.js 24+.

```sh
cp .env.example .env
make setup
```

In two terminals:

```sh
make backend
```

```sh
make frontend
```

Open http://localhost:5173. The initial screen has **empty origin and destination fields**, a neutral map and a short prompt. No routes or weather are requested automatically. Select both cities to compare a trip, or choose **Load example scenario** explicitly for three recorded LA–Phoenix road routes and simulated weather. **Compare live routes** calls the real providers; a failed provider never silently becomes example data. City search supports cities and postal codes, not street addresses. Compare remains available for valid inputs, including repeated checks of the same trip. Changed fields add an **Update needed** badge to the button; successful comparison or reverting the edit clears it. Requests in progress, rate-limit cooldowns and invalid/incomplete inputs temporarily disable the button. Forecast viewing and map controls use loaded data and do not mark the trip changed. Failed changed-trip requests keep the update badge and remain retryable. Repeated comparisons may reuse the existing five-minute complete-plan cache.

## Docker

```sh
cp .env.example .env
docker compose up --build --wait
python3 scripts/docker_smoke.py
```

Open http://localhost:8080. Nginx serves the built frontend and proxies `/api/` to Gunicorn/Django. Both services have readiness checks; `--wait` waits for them to become healthy. The web port is bound to localhost. No database is required: trip comparisons are read-only and have no saved accounts or trips.

If Compose is installed as a standalone command, use `docker-compose` instead of `docker compose`. Set `WEB_PORT` to choose another local port. `APP_ENV_FILE` selects a separate backend environment file (default `.env`); for example, use `APP_ENV_FILE=.env.production docker compose up --build --wait` after setting the production values below. Local environment files are ignored by Git and excluded from image build contexts.

`python3 scripts/docker_smoke.py` checks the built HTML/JavaScript, Nginx readiness, the proxied Django health endpoint and the complete synthetic example forecast without calling external providers. Use `--base-url` if the port differs. Stop this stack with `docker compose down`.

For another hosting provider, set `DJANGO_DEBUG=false`, a random `DJANGO_SECRET_KEY`, and the real hostname in `DJANGO_ALLOWED_HOSTS`. Put the service behind your host's TLS reverse proxy.

## Temporary Render deployment

[`render.yaml`](render.yaml) defines a **free React static site** (`waywise`) and **one paid Django Docker service** (`waywise-api`, 512 MB / 0.5 CPU). Keep the workspace on Hobby; this app needs no database, persistent disk or second paid instance. The [published API instance price](https://render.com/pricing) is $7/month and compute is [prorated by the second](https://render.com/docs/faq): about **$1.63 for 7 days or $3.27 for 14 days** using a 30-day month, before extra bandwidth/build usage and tax. These are estimates rather than prepaid weekly packages.

1. In Render, create a Blueprint from the private `0xhssn/spotter-weather-routing` repository, branch `main`, using the root `render.yaml`. Grant repository access only to this assessment repository. Review that the frontend is a **Static Site**, the API has exactly **one 512 MB / 0.5 CPU paid instance**, and no other paid resources are listed.
2. Render prompts for `CORS_ALLOWED_ORIGINS` on the API and `VITE_API_BASE_URL` on the static site. Both are public URL settings, not credentials. For `CORS_ALLOWED_ORIGINS`, enter the exact frontend origin if already assigned, such as `https://waywise-xxxx.onrender.com`, with no path. If Render has not assigned it yet, use `https://setup.invalid` temporarily; the browser API will intentionally remain inaccessible until step 3. Do not use a wildcard.
3. When the frontend URL is assigned, set the API's `CORS_ALLOWED_ORIGINS` to that exact HTTPS origin in its Environment settings and save/redeploy. The Blueprint leaves this value under dashboard control on future syncs. Multiple approved frontend origins can be comma-separated.
4. Set the static site's `VITE_API_BASE_URL` to the API's assigned **public HTTPS URL**, without `/api`, then save and rebuild the static site. Until that URL is available, use `https://setup.invalid` at the initial prompt. Both URL settings use `sync: false` so subsequent Blueprint syncs preserve dashboard values. Render rejects references to reference-valued environment variables, so no chained reference or assumed hostname is used. Vite embeds the public API address at build time. Django automatically permits its `RENDER_EXTERNAL_HOSTNAME`; Gunicorn listens on Render's assigned `PORT`. Render generates the Django secret.
5. Confirm both deploys are healthy, open the frontend, load the example, search for a city and compare a live trip. Check `/api/health` on the API URL. The example must remain labeled; live failures must display an error. GitHub regression and container checks gate subsequent automatic deployments.
6. **Record the actual deployment time and a shutdown deadline no later than 14 days afterward.** Suspend the paid API after review and verify its suspended state; optionally remove both services when no longer needed. An active paid API keeps billing. This Blueprint does not automatically expire, and disconnecting/deleting the Blueprint alone does not stop its services. The static site has no compute charge, but both sites share the workspace's bandwidth/build allowances.

Current deployment: Blueprint `waywise-assessment`; static site `waywise` (`srv-dbjnv1u7bikc7382bbng`) and API `waywise-api` (`srv-dbjnv1u7bikc7382bbn0`). The URL settings are configured to the two live origins linked above. To stop compute billing, open [API Settings → Delete or suspend](https://dashboard.render.com/web/srv-dbjnv1u7bikc7382bbn0/settings#delete-or-suspend), choose **Suspend Web Service**, and verify **Suspended** status. Complete this by **November 15 at 23:59 WITA**, inside the 14-day limit from initial provisioning around November 2 at 02:06 WITA. Maintenance Mode does not stop the compute service.

For local split-hosting checks, copy `frontend/.env.example` to `frontend/.env.local`, set `VITE_API_BASE_URL` to the backend origin, and add the exact frontend origin to the backend's `CORS_ALLOWED_ORIGINS`. Restart both servers after changing environment values. Leave the frontend value empty for normal local Vite/Nginx proxying. Cross-origin access is limited to `/api/`, GET/POST/OPTIONS and JSON content type; `Retry-After` remains readable for the UI countdown. No cross-origin credentials are used.

## Features

- US city/postal-code autocomplete, explicit location selection, origin-local departure, load in pounds, and 10/25/50 mile spacing.
- Valhalla truck-profile alternative-route requests plus bounded waypoint detours when fewer than three alternatives are returned. Native and generated alternatives are deduplicated. Generated waypoints are through-points on major roads, with up to two bounded corridor widths; repeated and excessive detours are rejected. **Three distinct routes cannot be guaranteed for arbitrary endpoints.** The UI shows the actual count rather than cloning a route. When the truck provider rejects a long trip, an **unchecked-by-default checkbox** allows an OSRM car-profile comparison. It never activates for outages or without consent. The warning above the results and map popups state that truck restrictions are unchecked and travel times are car estimates. `ROUTING_PROVIDER=osrm` is also available as an explicit deployment setting.
- Arrival estimates use travel time distributed within individual routing steps, including slower sections and provider-supplied stationary maneuver time. Driver rest stops, traffic, and hours-of-service are not modeled.
- Checkpoints include origin and destination, including the final partial interval. Risk miles use the worse of adjacent endpoints across each road interval.
- Load-aware risk classification and a deterministic, lexicographic route recommendation. Any No Travel checkpoint disqualifies a route; if all routes are blocked, no recommendation is made.
- Leaflet road routes with a full-opacity selected line and white casing, zoom-aware checkpoints that retain every Moderate-or-higher point, and positional risk strips from origin to destination, keyboard-accessible checkpoint table, route-summary map popups, and corridor weather rendered on a canvas overlay. Cards expose average risk, and positive fractional risk mileage is never displayed as zero. Single-route results say so; High/Severe recommendations use caution colors. A single prioritized status slot shows provider notices and errors, with secondary notes behind a disclosure. Changed or failed comparisons dim and disable old results until refreshed.
- The heatmap has 49 precomputed hourly score frames. Low-risk fields are nearly transparent; Severe and No Travel fields are stronger and wider. Forecast state is isolated from cards and the checkpoint table, and route/marker layers are memoized. Slider movement, animation, and toggling layers do not make API calls or recompute route scores.
- The forecast timeline animates the complete 0–48 hour corridor weather window in about 12 seconds, independent of trip duration. Playback stops at hour 48; users can pause, scrub or replay it. Selecting a route or loading a comparison resets the timeline to departure and pauses playback. The moving vehicle/position marker and trip-progress panel have been removed so arrival does not interrupt the weather forecast. Checkpoint weather and route ranking still use the estimated arrival time at each checkpoint.
- Parallel, batched weather requests with bounded location counts; a shared 23-second provider budget with bounded timeouts and one short transient-error retry; cached geocoding/routing/weather and five-minute complete plans; explicit missing-forecast and upstream-error states.
- Responsive layout, keyboard city selection, reduced-motion support, accessible controls, and a keyboard-dismissable methodology dialog. Shared rem typography keeps supporting text readable, preserves visible recommendation labels, provides 16 px mobile inputs, and separates risk text colours from map colours. See `docs/typography.md` for typography verification and `docs/ui-audit.md` for the component audit, responsive screenshots and status-state checks.

## Rules and interpretation

The implementation follows `docs/assessment.pdf`. The brief has shared rain/snow boundaries: exactly 0.25 in/hr rain is **High**, 0.50 is **Severe**; exactly 1 in/hr snow is **High**, 2 is **Severe**. These use the more conservative category. Exactly 1 in/hr rain and 3 in/hr snow remain **Severe**, since No Travel is strictly greater. Wind ranges are continuous (e.g. 34.9 is Moderate).

Wind ≥55 mph is always No Travel. Wind ≥45 mph with load **over** 30,000 lb is No Travel. Wind ≥35 mph with load **over** 40,000 lb is at least Severe. The maximum weather/load category wins. Gusts are displayed but the supplied rules use sustained wind.

Ranking, among eligible routes:

1. Fewest Severe miles
2. Fewest High miles
3. Lowest distance-weighted average score (Low=0 … No Travel=4)
4. Shortest provider travel time

No risk-mile rounding is used for ranking. A large number of low-risk checkpoints cannot outweigh a few high-risk miles through checkpoint-count bias.

Weather uses UTC Unix timestamps. Sustained wind and temperature are instantaneous provider values, linearly interpolated at each checkpoint ETA. Rain, showers, snowfall and gust maxima use the hourly bin ending at or after that ETA; precipitation peaks are not smoothed. This follows the [Open-Meteo variable definitions](https://open-meteo.com/en/docs#hourly-parameter-definition). Rain plus showers is converted mm → inches using 25.4; snowfall cm → inches using 2.54. Forecast units, contiguous hourly timestamps, complete coverage and finite values are validated before scoring. Missing, malformed or out-of-range forecasts cause an explicit service error; they are never replaced with zero or clamped to stale hours. The 48-hour corridor slider is anchored to departure and is separate from arrival-aware route scores. For trips longer than 48 hours, checkpoint forecasts still extend through final arrival; a visible note explains the shorter corridor timeline.

The corridor grid samples all routes every 40 miles with ±20 mile lateral offsets, increasing its spacing on long routes to stay under 240 grid samples and 1,800 total forecast locations. Checkpoint spacing is never thinned for scoring. A coarse canvas field uses the highest risk where sample areas overlap, independently of draw order; checkpoint values are the exact samples used for ranking. The grid and temporal bins are approximations, not proof that unsampled miles are safe.

## Providers and limits

No API key is needed for the assessment prototype:

| Purpose | Provider | Limit or consideration |
|---|---|---|
| Truck routes | [Valhalla / FOSSGIS](https://valhalla.github.io/valhalla/start/introduction/) public demonstration server | Limited fair-use assessment traffic; assumed semi dimensions and gross weight; no availability guarantee |
| Optional road adapter | [OSRM](https://project-osrm.org/docs/v5.22.0/api/) public demonstration server | Explicit car profile, not a silent truck-routing fallback |
| Hourly weather | [Open-Meteo](https://open-meteo.com/en/docs) | Free API is for noncommercial evaluation; respect current quotas and terms |
| City lookup | [Open-Meteo / GeoNames](https://open-meteo.com/en/docs/geocoding-api) | Select a city/postal code; disambiguate with state/country |
| Basemap | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) | Attribution and browser Referer remain visible; no offline prefetch; use a dedicated provider for larger deployments |

**This is not certified truck navigation.** Live Valhalla requests use `costing=truck`, exclude unpaved through-roads, and assume a standard semi: height 4.11 m, width 2.6 m, length 21.64 m, and gross weight = cargo + assumed 30,000 lb empty weight (converted to metric tons). Cargo separately affects the weather rules. Real vehicle dimensions, axle loads, trailer configuration, closures, and hours of service must be verified. The example uses recorded truck routes for a 20,000 lb load; changing example load recalculates weather risks, not the recorded road geometry.

For production, collect actual vehicle specifications, self-host the router or obtain a supported service plan, and arrange appropriate weather/hosting capacity. The Valhalla demo requests include `X-Client-Id`; set `ROUTING_CLIENT_ID` to the deployed application's identity and follow the demo operator's publication/fair-use guidance before opening it to end users. OSRM is available only if explicitly selected and is visibly labeled as a car profile.

Application limits: departure now to seven days ahead, routes up to 5,000 miles, load 0–100,000 lb, and at most 1,800 weather locations. The public truck router has its own shorter distance limit. Departure is entered in the origin’s IANA timezone; every trip time uses that zone and includes its abbreviation. Repeated or nonexistent DST local times are rejected with an explanation. The same minute-rounding rule is used for displayed durations and arrivals. LocMem caching and request throttling are per Gunicorn process. A scaled/public deployment should add shared Redis caching, perimeter rate limiting, observability, and appropriate provider capacity. New successful plans are limited to 30/minute per remote IP, with a fixed window. Complete-plan cache hits bypass throttling; validation failures and provider failures do not consume the budget. HTTP 429 includes Retry-After and the UI counts down. Behind Nginx, clients conservatively share the proxy’s remote-IP budget until trusted proxy/shared rate limiting is configured. JSON responses are gzip-compressed by Django and Nginx.

## API

| Endpoint | Contract |
|---|---|
| `GET /api/health` | Process readiness |
| `GET /api/places?q=Los%20Angeles` | Up to six US city choices; set `GEOCODING_COUNTRY` to change country scope |
| `POST /api/plan` | JSON origin/destination `{label,lat,lon}`, ISO departure with timezone, `load_lb`, `spacing_miles` |
| `GET /api/example?load_lb=20000&spacing_miles=25` | Explicit example with simulated weather |

Plans return source mode, inputs (including explicit `allow_road_fallback`), route routing profiles/geometry/checkpoints, risk mileages, recommendation ID or null, heatmap frames, warnings, and source metadata. Each route's `geometry_progress` contains `[mile, elapsed_seconds]` pairs aligned with `geometry.coordinates`; timing-aware simplification bounds display position/mileage error to approximately 60 meters relative to the original routing geometry. Scoring still uses the full original geometry. Requests are stateless and do not mutate stored user data. Local Vite/Nginx uses the same origin; split hosting uses an explicit frontend-origin allowlist. There is no public arbitrary-URL proxy.

## Validation

```sh
make test
make build
.venv/bin/python backend/manage.py check
docker compose config --quiet
```

The automated backend and frontend suites cover threshold boundaries and fractional wind, strict load overrides, worst-condition behavior, No Travel exclusion, weighted mileage and partial intervals, recommendation tie-breaks, step-based ETA interpolation, forecast units/time bins, missing forecasts, input validation, upstream failure, the full example API contract, live orchestration at all three spacings, arrival-dependent route exclusion, malformed providers, route deduplication, stale city-search responses, city resets, timeline isolation, full-window forecast playback, modal scroll cleanup, all-blocked UI, proxy errors, heatmap overlap colors, malformed-response recovery, cache validation, mixed-validity alternatives, cancellation of slowly streaming provider responses, separate API build addresses, and cross-origin preflights/errors/retry headers. Successful plan and city-search responses are validated before entering UI state; unexpected render failures offer a reload action. See `docs/qa-fixes.md` for the latest QA fixes and checks; `docs/verification.md` records the earlier baseline.

## Structure

```text
backend/config/           Django configuration and URL wiring
backend/planner/risk.py   Pure risk scoring and recommendation
backend/planner/geometry.py  Road sampling and corridor geometry
backend/planner/providers.py Provider adapters, batching and cache
backend/planner/service.py   Trip orchestration, forecast matching
backend/planner/tests.py     Boundary and integration tests
frontend/src/            React UI, city search, Leaflet/canvas map
docs/                    Source assessment and walkthrough outline
```


## Deterministic visual QA and profiling

To reproduce the risk states without waiting for dangerous live weather, run `.venv/bin/python scripts/qa_fixture_server.py` from the project root. In another terminal run `cd frontend` then `API_PROXY_TARGET=http://127.0.0.1:8101 npm run dev -- --port 5175`. This separate local QA API serves **example data only**: load 20,000 lb for one Severe route; change to 30,001 lb and reload the example for No Travel. The production API never uses this harness.

For development render measurements, add `?qa-profile=1` to the normal frontend URL. Console messages record React commit duration and heatmap canvas draw duration. Production builds remove this diagnostic behavior. The automated tests assert that forecast ticks do not render the route cards, recommendation, or open checkpoint table.

GitHub Actions runs the backend tests, frontend tests, Django checks and production build on pushes to main and pull requests (`.github/workflows/ci.yml`). A separate container job generates an ephemeral production secret, builds both images, waits for both services to be healthy, runs the Docker smoke checks and always stops the stack.
