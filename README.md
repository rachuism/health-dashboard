# Health Dashboard

A small browser dashboard that fetches and visualizes Google Health API
activity data (exercise data points), with distance and active-zone charts.

## Modules

| File | Responsibility |
| --- | --- |
| `dashboard.html` | Page shell; loads the GIS script + the ESM entry point |
| `dashboard.ts` | Entry point — wires events, orchestrates auth → fetch → parse → render |
| `auth.ts` | Google sign-in via Google Identity Services (in-browser OAuth token flow) |
| `config.ts` | Your OAuth client ID (not a secret) |
| `api.ts` | `fetchExerciseDataPoints()` — Health API call (no DOM) |
| `parse.ts` | Types, extraction, and formatting (no DOM) |
| `ui.ts` | DOM refs, status, auth state, metric/item rendering |
| `charts/distance.ts` | Distance-over-time chart |
| `charts/zone.ts` | Active-zone chart |

## Authentication

Users sign in with their Google account directly in the browser — no backend and
no client secret. This uses [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/overview)
(GIS) with the OAuth *token model* (implicit flow): clicking **Sign in with
Google** opens Google's consent popup and returns a short-lived access token,
which the app uses to call the Health API. Expired tokens are refreshed silently
on a `401`.

## Getting started

1. **Google Cloud setup** (one-time):
   - Enable the **Health API** for your project.
   - On the **OAuth consent screen**, add the scope
     `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`.
     While the app is in *Testing* status, add your Google account under
     **Test users** (restricted scopes only allow listed testers).
   - Create an OAuth **client ID** of type **Web application**, and add your
     serving origin (e.g. `http://localhost:3000`) under
     **Authorized JavaScript origins**.
2. Paste the client ID into `config.ts` (`GOOGLE_CLIENT_ID`).
3. Compile the TypeScript: `npx tsc`.
4. Serve the folder over HTTP (ESM modules and Google sign-in don't work over
   `file://`), e.g. `npx serve .` or VS Code Live Server, then open
   `dashboard.html` at the origin you registered above.

`request.http` (gitignored) remains as a manual REST-client reference for the raw
API; it is no longer needed for normal use.

## Note on credentials

The OAuth **client ID** is not secret and is safe in frontend code. The OAuth
**client secret** must never appear in the browser — it's only for confidential
(server-side) clients. Never commit real access tokens or client secrets.
