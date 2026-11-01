# UI audit implementation

Implemented U1-U12 from the November 1 UI audit. This changes layout, interaction and copy; backend routing, forecast sampling, risk scoring and recommendation selection are unchanged. The user's newer instruction takes precedence over the brief's old disabled-Compare rule: valid unchanged comparisons remain available, with an Update needed badge for edited inputs.

| Finding | Result |
| --- | --- |
| U1-U2: detached and repeated copy | A trip summary, map footer, collapsible checkpoint card and Assumptions and sources card contain all supporting information. Timeline help appears once below the map; details live in How we compare. The full 48-hour weather playback takes about 12 seconds, independent of route duration. Removed the loose footer and taglines. Assumptions text uses the full card width with safe wrapping. |
| U3: stacked notices and stale results | One status slot prioritizes error, changed inputs, car caveat and other provider notes. Additional notes use a disclosure. Previous results are dimmed and inert after edits or any failed comparison, with no recommendation banner or recommended card badges. Loading uses the button and one results overlay. Truck-distance errors offer a Turn on action for the labelled car opt-in; application-wide distance limits retain their original message. |
| U4-U5: page chrome | One bordered trip summary contains cities, departure, load, checkpoint spacing, data source and the single methodology action. Removed the breadcrumb, account avatar, nonfunctional compass and marketing copy. |
| U6: sidebar | The sidebar sticks at top 0 with height 100dvh, without the old 76 px subtraction. Short viewport spacing keeps the form readable; the removed footnote cannot clip. |
| U7: checkpoint interaction | Map and table selections share an anchored popup and a 9 px selection ring. Leaflet pans the popup into view, including after a resize. Table selections reveal the map. Wind, Gust, Rain and Snow form a labelled 2-by-2 grid with units; reasons are labelled Why. |
| U8: table | The disclosure header contains route, count and origin time zone. Fixed column widths, right-aligned numbers, header units, coloured risk dots plus labels, a sticky header and a 27 rem internal scroll area replace the unbounded table. |
| U9: route cards | Cards use three columns when space permits and one otherwise; a two-route response may use two columns. The recommendation and recommended card come first, including in keyboard order. Best replaces Recommended below 1100 px. Removed duplicate route numbers and the ambiguous worst-risk dot. Each car route carries a Car estimate chip. |
| U10: dates | One dateTime formatter uses `Nov 1, 8:00 AM PST` in summaries, cards, map popups, checkpoint rows and timeline labels. Dates are always explicit, including next-day arrivals and daylight-saving transitions. |
| U11: map controls | Layer toggles are in the map header; zoom and fit share the map control stack. The legend is titled Risk. Endpoint pins sit above their coordinates and retain high-risk endpoint border colours. Removed the repeated route chip. |
| U12: form and actions | Check weather every has 10 mi / 25 mi / 50 mi controls. Long trips is a fieldset with a labelled checkbox and described help. The Compare helper describes button state without repeating the result notice. Show on map selects the recommendation and scrolls to it. The methodology dialog locks background scrolling and restores it when dismissed. |

## Verification

- 59 frontend regressions pass, covering status priority, inactive stale results, unchanged-input failures, truck-distance recovery, loading, dialog focus/Escape and scroll cleanup, next-day dates, checkpoint units/selection, example reset/in-flight edit preservation and full-window forecast playback.
- 60 backend regressions pass. TypeScript, the production build and the typography guard pass.
- A separate live LA-Phoenix smoke test against the normal backend succeeded with three routes and no browser warnings/errors. [Real-provider desktop preview](ui-audit/live-smoke-1280.jpg).
- Example, loading, live-style, error-over-stale-car and car-estimate layouts checked at 390, 768 and 1280 px. The component audit returns `[]` in every state, and none has page overflow. There is at most one status slot; loading has none. Old results are inert and unrecommended during loading and after errors.
- Additional checks cover 1024 px card alignment, 800/1043 px sidebar heights while scrolling, sticky table headers/internal scrolling, checkpoint popup selection/resizing, modal focus, forecast controls and route/timeline reset. Steady-state typography audits at 390, 768, 1024 and 1280 px found no small-text, contrast or clipping flags. At 800 px the sidebar has 8 px of internal scroll but all form text fits; at 1043 px it has no internal scroll.

The screenshot matrix below uses a separate, temporary local fixture API on port 8102 and frontend on 5174. Its live-style, car, delay and error responses are **synthetic visual QA states**, not evidence of current provider weather or real car routes. The normal application on 5173 continues to use the backend on 8000. No fixture server or override is part of the application or deployment.

| State | 390 px | 768 px | 1280 px |
| --- | --- | --- | --- |
| Example | [Phone](ui-audit/example-390.jpg) | [Tablet](ui-audit/example-768.jpg) | [Desktop](ui-audit/example-1280.jpg) |
| Loading | [Phone](ui-audit/loading-390.jpg) | [Tablet](ui-audit/loading-768.jpg) | [Desktop](ui-audit/loading-1280.jpg) |
| Live-style fixture | [Phone](ui-audit/live-390.jpg) | [Tablet](ui-audit/live-768.jpg) | [Desktop](ui-audit/live-1280.jpg) |
| Error over stale car results | [Phone](ui-audit/error-390.jpg) | [Tablet](ui-audit/error-768.jpg) | [Desktop](ui-audit/error-1280.jpg) |
| Car estimate fixture | [Phone](ui-audit/car-profile-390.jpg) | [Tablet](ui-audit/car-profile-768.jpg) | [Desktop](ui-audit/car-profile-1280.jpg) |

To repeat the checks, run `npm test` and `npm run build` in frontend, and `../.venv/bin/python manage.py test` in backend. The read-only console scripts in `frontend/scripts/audit-components.js` and `audit-typography.js` check loose component text and typography. Browser sizes are desktop emulations; physical phone/tablet testing remains a manual check.

## Latest interaction change

The moving vehicle/position marker and trip-progress display were removed at the user's request. Forecast playback now continues through all 48 hours without pausing at trip arrival, and still completes in about 12 seconds. The earlier screenshots preserve the audited layout at that point in time; [the current forecast view](ui-audit/forecast-only.jpg) shows the simplified map and timeline.
