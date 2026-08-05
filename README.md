# Health Dashboard

A small browser dashboard that fetches and visualizes Google Health API data —
exercise (distance, active-zone minutes), heart rate variability, resting
heart rate, and sleep — as a dark, Bevel/Whoop-style set of ring charts. It also
shows recent activities from Strava.

## Modules

| File | Responsibility |
| --- | --- |
| `dashboard.html` | Page shell; loads the GIS script + the ESM entry point |
| `dashboard.ts` | Entry point — wires events, orchestrates auth → fetch → parse → render |
| `auth.ts` | Google sign-in via Google Identity Services (in-browser OAuth token flow) |
| `config.ts` | Your OAuth client IDs (not secrets) |
| `api.ts` | `fetchDataPoints(token, dataType)` — Health API call (no DOM) |
| `parse.ts` | Types, extraction, and formatting (no DOM) |
| `mock.ts` | Sample data for the "Load Mock Data" button (no DOM, no API calls) |
| `ui.ts` | DOM refs, status, auth state, metric/item rendering |
| `charts/distance.ts` | Distance-over-time chart |
| `charts/zone.ts` | Active-zone-minutes ring |
| `charts/ring.ts` | Shared SVG ring renderer (progress or static/decorative) used by all ring charts |
| `charts/vitals.ts` | VFC (HRV), RHR, and sleep rings |
| `stravaAuth.ts` | Strava connect/disconnect, OAuth redirect handling, token refresh (no DOM) |
| `stravaApi.ts` | `fetchActivities(token)` — calls the `api/strava-activities` proxy (no DOM) |
| `api/strava-token.ts` | Vercel Edge Function — holds the Strava client secret, does the code/refresh token exchange |
| `api/strava-activities.ts` | Vercel Edge Function — proxies activity reads around Strava's inconsistent CORS support |

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
   - On the **OAuth consent screen**, add these three scopes (all
     "Restricted", same tier — no extra verification burden from adding
     them):
     - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`
     - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`
     - `https://www.googleapis.com/auth/googlehealth.sleep.readonly`
     While the app is in *Testing* status, only accounts listed under
     **Test users** can sign in (restricted scopes require this). Anyone who
     signed in before these scopes were added needs to sign in again once to
     grant them.
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

## Strava integration

Unlike Google's in-browser token flow, Strava's OAuth requires a **client
secret** for every token exchange (the initial code exchange, and every
refresh — access tokens expire after 6h, and there's no PKCE/public-client
option). Strava's REST API also has a long history of inconsistent CORS
support, so reading activities directly from the browser is unreliable too.
Both problems are solved by two small Vercel Edge Functions
(`api/strava-token.ts`, `api/strava-activities.ts`) that hold the secret and
proxy the read, respectively — everything else stays client-side.

**Deliberate deviation from the Google module**: Google's access token lives
in memory only and is silently re-fetched on expiry. Strava has no equivalent
(refreshing needs the backend), so its tokens are persisted in `localStorage`
to survive reloads. This is proportionate under the same trust model as
"Sharing it with other people" above — each visitor only ever sees their own
data — but it's why `renderStravaActivities` is careful to escape every
rendered field (activity names are Strava-user-entered text).

### Owner setup

1. Create a Strava API application at
   [strava.com/settings/api](https://www.strava.com/settings/api). Note the
   **Client ID** and **Client Secret**.
   - Set **Authorization Callback Domain** to your deployed domain (bare
     domain, no path/port). Strava allows only one callback domain per app,
     so for local development create a **second, dev-only app** with the
     callback domain set to `localhost` — same shape as the Google README's
     "Test users" step above.
2. Paste the Client ID into `config.ts` (`STRAVA_CLIENT_ID`).
3. In your Vercel project, set these environment variables (Project Settings
   → Environment Variables) — never commit them:
   - `STRAVA_CLIENT_ID` (matches the value in `config.ts`)
   - `STRAVA_CLIENT_SECRET`
   - `STRAVA_ALLOWED_ORIGIN` (optional; e.g. `https://your-domain.tld` — when
     set, the two functions reject requests from any other origin)
4. Local dev: plain `npx serve .` still works for everything *except* the
   actual token exchange — the redirect to and back from Strava's consent
   screen is just page navigation. To exercise the exchange itself, either:
   - run `npx vercel dev` (after `vercel link` and `vercel env pull` to get
     a local `.env.local`), or
   - push to a branch and use the resulting Vercel Preview Deployment, which
     gets working Edge Functions with zero local secret handling.

### Sharing it with other people

The data-privacy model matches Google — each visitor connects their own
Strava account and only ever sees their own activities; the two Edge
Functions are stateless and hold no per-user data. **But who is *allowed* to
connect works differently**, and needs its own step:

A newly created Strava API application starts in "single-player mode" — only
the app owner's own Strava account can authorize it, full stop. To let anyone
else connect, raise the athlete limit to up to 10 in the app's API Settings
Dashboard (self-service, no review needed for that first tier). This is a
headcount cap, not a named allowlist like Google's Test Users — the first N
Strava accounts to click "Connect Strava" get in, whoever they are, so until
you raise the cap, treat the dashboard URL itself as the access control (same
as the unlisted-but-reachable Vercel URL is for Google before someone's added
as a Test user). Beyond 10 users, Strava requires requesting a review at
developers@strava.com.

As of June 30, 2026, Strava also requires an active Strava subscription to
keep Standard Tier API access at all — worth checking before relying on this
for more than personal/small-group use.
