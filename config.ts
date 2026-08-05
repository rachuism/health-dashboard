// Google OAuth 2.0 *Web application* client ID. This is NOT a secret — client
// IDs are safe to ship in frontend code (unlike the client secret, which must
// never appear in the browser).
//
// Get one at: https://console.cloud.google.com/apis/credentials
//   1. Create an OAuth client ID of type "Web application".
//   2. Under "Authorized JavaScript origins", add the origin you serve from,
//      e.g. http://localhost:3000 (and your deployed https origin later).
//   3. On the OAuth consent screen, add the scope
//      https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
//      and add your Google account under "Test users" while the app is in
//      Testing status.
//
// Then paste the client ID below.
export const GOOGLE_CLIENT_ID = "376252375726-8kqjpnmljh8d2rfnr7b3b9pse0rh0vgo.apps.googleusercontent.com";

// Strava API client ID. Also NOT a secret — safe in frontend code. The client
// *secret* lives only in the STRAVA_CLIENT_SECRET Vercel env var, read by
// api/strava-token.ts; it must never appear here or anywhere in the browser.
//
// Get one at: https://www.strava.com/settings/api
//   1. Create an API application. Note the Client ID and Client Secret.
//   2. Set "Authorization Callback Domain" to the bare domain you serve from
//      (e.g. localhost for dev, your deployed domain for prod — Strava only
//      allows one callback domain per app, so most people register a second,
//      dev-only app for localhost).
//
// Then paste the client ID below.
export const STRAVA_CLIENT_ID = "";
