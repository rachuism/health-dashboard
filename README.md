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

## Getting started (owner setup)

Do this once, as the person hosting the dashboard.

1. **Google Cloud setup**:
   - Enable the **Health API** for your project.
   - On the **OAuth consent screen**, add the scope
     `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`.
     While the app is in *Testing* status, only accounts listed under
     **Test users** can sign in (restricted scopes require this).
   - Create an OAuth **client ID** of type **Web application**, and add every
     origin you'll serve from (e.g. `http://localhost:3000` for local dev,
     plus your deployed `https://` origin) under **Authorized JavaScript origins**.
2. Paste the client ID into `config.ts` (`GOOGLE_CLIENT_ID`).
3. Compile the TypeScript: `npx tsc`.
4. Serve the folder over HTTP (ESM modules and Google sign-in don't work over
   `file://`), e.g. `npx serve .` or VS Code Live Server, then open
   `dashboard.html` at the origin you registered above.

`request.http` (gitignored) remains as a manual REST-client reference for the raw
API; it is no longer needed for normal use.

### Sharing it with other people

The app is entirely client-side — there's no backend and no shared data — so
each person who signs in only ever sees their own Google Health data. To invite
someone:

1. Deploy the compiled site somewhere with a stable HTTPS origin (e.g. Vercel:
   import the repo, set the build command to `npx tsc`, output directory `.`),
   then add that origin under **Authorized JavaScript origins** as above.
2. In **Google Cloud Console → APIs & Services → OAuth consent screen → Test
   users**, add the email of everyone you want to have access (up to 100 while
   the app is in *Testing* status).
3. Send them the deployed URL. That's it — no local setup, no client ID, no
   build step on their end.

Each invited person must accept the tester invite Google emails them before
their sign-in will work; if someone tries before being added, Google shows its
own "access blocked" screen rather than the dashboard silently failing.

Going fully public (anyone, without being added as a tester) would require
publishing the OAuth consent screen and passing Google's verification —
including a security assessment, since the Health scope is restricted — which
is out of scope for a small-group setup like this.

## Note on credentials

The OAuth **client ID** is not secret and is safe in frontend code. The OAuth
**client secret** must never appear in the browser — it's only for confidential
(server-side) clients. Never commit real access tokens or client secrets.
