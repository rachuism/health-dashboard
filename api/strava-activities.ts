// Vercel Edge Function. Pure CORS-bypass proxy — no secret involved, just
// forwards the caller's own bearer token. Strava's REST API has a long
// history of inconsistent/missing CORS headers, so calling it directly from
// the browser is unreliable; this same-origin endpoint sidesteps that.
export const config = { runtime: "edge" };

const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

function isAllowedOrigin(request: Request): boolean {
  const allowed = process.env.STRAVA_ALLOWED_ORIGIN;
  if (!allowed) return true;
  const origin = request.headers.get("origin");
  if (origin) return origin === allowed;
  const referer = request.headers.get("referer");
  return referer != null && referer.startsWith(allowed);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401 });
  }

  const perPage = new URL(request.url).searchParams.get("per_page") ?? "30";

  const stravaResponse = await fetch(`${ACTIVITIES_URL}?per_page=${encodeURIComponent(perPage)}`, {
    headers: { Authorization: authorization },
  });

  const bodyText = await stravaResponse.text();
  return new Response(bodyText, {
    status: stravaResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
