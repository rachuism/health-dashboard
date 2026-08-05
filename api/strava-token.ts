// Vercel Edge Function. Holds the Strava client secret server-side and does
// nothing else — the code/refresh_token exchange with Strava requires a
// secret that must never reach the browser (unlike Google's GIS flow, Strava
// has no public/PKCE client option). Strava's response is forwarded as-is,
// not reshaped, so a rotated refresh_token is never silently dropped.
export const config = { runtime: "edge" };

const TOKEN_URL = "https://www.strava.com/oauth/token";

type TokenRequestBody =
  | { grant_type: "authorization_code"; code: string }
  | { grant_type: "refresh_token"; refresh_token: string };

function isValidBody(body: unknown): body is TokenRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const { grant_type } = body as Record<string, unknown>;
  if (grant_type === "authorization_code") {
    return typeof (body as Record<string, unknown>).code === "string";
  }
  if (grant_type === "refresh_token") {
    return typeof (body as Record<string, unknown>).refresh_token === "string";
  }
  return false;
}

// Cheap guard against randoms using this deployment as a free proxy to burn
// your Strava rate limit / Vercel invocation quota. Skipped if unset.
function isAllowedOrigin(request: Request): boolean {
  const allowed = process.env.STRAVA_ALLOWED_ORIGIN;
  if (!allowed) return true;
  const origin = request.headers.get("origin");
  if (origin) return origin === allowed;
  const referer = request.headers.get("referer");
  return referer != null && referer.startsWith(allowed);
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  if (!isAllowedOrigin(request)) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  if (!isValidBody(body)) {
    return new Response(
      JSON.stringify({ error: "Expected { grant_type: 'authorization_code', code } or { grant_type: 'refresh_token', refresh_token }" }),
      { status: 400 }
    );
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: "Strava credentials are not configured on the server" }), {
      status: 500,
    });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: body.grant_type,
    ...(body.grant_type === "authorization_code" ? { code: body.code } : { refresh_token: body.refresh_token }),
  });

  const stravaResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  const bodyText = await stravaResponse.text();
  return new Response(bodyText, {
    status: stravaResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
