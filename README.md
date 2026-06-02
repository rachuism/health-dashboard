# Health Dashboard

A small browser dashboard that fetches and visualizes Google Health API
activity data (exercise data points), with distance and active-zone charts.

## Modules

| File | Responsibility |
| --- | --- |
| `dashboard.html` | Page shell; loads the ESM entry point |
| `dashboard.ts` | Entry point — wires events, orchestrates fetch → parse → render |
| `api.ts` | `fetchExerciseDataPoints()` — Health API call (no DOM) |
| `parse.ts` | Types, extraction, and formatting (no DOM) |
| `ui.ts` | DOM refs, status, metric/item rendering |
| `charts/distance.ts` | Distance-over-time chart |
| `charts/zone.ts` | Active-zone chart |

## Getting started

1. Copy `request.http.example` to `request.http` and fill in your own Google
   OAuth `client_id`, `client_secret`, and authorization `code`. `request.http`
   is gitignored so credentials are never committed.
2. Compile the TypeScript: `npx tsc`.
3. Serve the folder over HTTP (ESM modules don't load over `file://`), e.g.
   `npx serve .` or VS Code Live Server, then open `dashboard.html`.

## Note on credentials

Never commit real OAuth secrets or access tokens. Keep them in `request.http`
(gitignored) or environment-specific config.
