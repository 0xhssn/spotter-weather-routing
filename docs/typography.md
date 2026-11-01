# Typography verification — November 1, 2026

Implemented the typography brief's T1–T8 presentation changes. Routing, weather matching, risk scoring, ranking and the bright map/heatmap palette are unchanged.

## Changes

- Shared rem scale in `frontend/src/tokens.css`: 11 px tracked labels/attribution, 12 px captions, 13 px metadata/tables, 14 px body/controls, 16 px mobile inputs, 20 px panel headings, 22 px sidebar heading and 28 px page title/durations at a default 16 px root.
- Narrower layouts rearrange content instead of reducing text size. Route cards stack below 600 px and use available columns at larger widths. Forms stack on narrow phones, and the sidebar width scales with browser text size.
- Recommended and How we compare retain visible text at every tested width. The main page title is the h1; the sidebar title is h2.
- Darker secondary text, separate risk-text tokens, readable map attribution, opaque map control surfaces, longer readable tooltips, and paragraphs capped at 72ch.
- Numeric cells align right. `tabular-nums` is requested, but the loaded DM Sans font does not supply tabular figures: at a 20 px root/17.5 px UI size, 1111 measured 21.84 px and 8888 measured 42.56 px. Other numeric cells use right alignment. The forecast offset now uses a monospace font, a fixed 6.5 rem box, and two-digit hours and minutes in the format `+00h 00m`. Both units stay visible at exact hours, and the timestamp column has a reserved width so playback does not resize the desktop slider.

## Browser checks

| Viewport width | Unexpected text below 12 px | Contrast flags below 4.5:1 | Page overflow | Recommended | Inputs |
| --- | ---: | ---: | ---: | --- | --- |
| 390 px | 0 | 0 | 0 | 12 px | 16 px |
| 768 px | 0 | 0 | 0 | 12 px | 14 px |
| 1024 px | 0 | 0 | 0 | 12 px | 14 px |
| 1280 px | 0 | 0 | 0 | 12 px | 14 px |
| 1440 px | 0 | 0 | 0 | 12 px | 14 px |

The 11 px exceptions are tracked labels, route numbers and map attribution. No unexpected clipped supporting text was found; road names retain intentional ellipses and the checkpoint table retains its internal horizontal scroll on small screens.

The checkpoint table, checkpoint card and methodology dialog passed the text audit at 1280 px. Deterministic Severe and No Travel examples passed; No Travel also passed at 390 px. A temporary 20 px root-font preview passed at 390 and 1280 px with enlarged text and no page overflow. This equivalent root-size check did not change the user's browser preferences. Physical iOS focus/zoom behaviour was not exercised.

The browser-console audit is a screening tool, not a full accessibility certification. It composites CSS background colours and considers opacity, but image-backed content and other rendering effects still require visual checks. Map tile labels are excluded.

## Repeatable checks

`npm test` runs `npm run check:typography` before the existing 52 frontend regression tests. The typography guard checks token-based font sizes, the 12 px floor with explicit 11 px exceptions, and responsive rules that shrink text. GitHub Actions already runs this command. The production build also passes.

For a rendered check, run the app, set the viewport, then paste `frontend/scripts/audit-typography.js` into the browser console. Inspect `small`, `faint`, `clipped`, `bodyOverflow`, `badge` and `inputs`, then verify visually.

## Screenshot evidence

| Width | Before | After |
| --- | --- | --- |
| 390 px | [Before](typography/before-390.jpg) | [After](typography/after-390.jpg) |
| 1280 px | [Before](typography/before-1280.jpg) | [After](typography/after-1280.jpg) |
| 1440 px | [Before](typography/before-1440.jpg) | [After](typography/after-1440.jpg) |
