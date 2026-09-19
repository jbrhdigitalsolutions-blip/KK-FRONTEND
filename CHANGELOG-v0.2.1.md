# KK-FRONTEND v0.2.1 — DESIGN-ONLY

- Added one-representative design-template scanning for dynamic content routes.
- Added `/song/:id`, `/playlist/:id`, `/album/:id`, `/profile/:slug`, `/artist/:slug`, `/user/:slug` and related families.
- Added generic opaque-ID segment collapse.
- Added query-value dedup for content/search queries while preserving structural `tab/view/mode/type/section/layout` variants.
- Added design-only asset classifier.
- Excludes song audio, streaming chunks, API/data requests, telemetry, analytics, ads and non-decorative content video.
- Keeps frontend CSS, JS, fonts, icons, images, posters and decorative UI video.
- Default mode changed to `Design Only`.
- Default maximum changed to 40 design-route templates.
- Added content-instance collapse counts and template metadata to artifacts.
- Fixed progress state so ETA/unit fields can reset instead of remaining stale.
