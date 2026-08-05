import { STRAVA_CLIENT_ID } from "./config.js";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const SCOPE = "read,activity:read_all";
const STATE_KEY = "stravaOauthState";
const TOKENS_KEY = "stravaTokens";
// Refresh a little before the real expiry so an in-flight request never races it.
const EXPIRY_SKEW_MS = 60_000;

type StoredTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch ms
};

// Raw shape of Strava's /oauth/token response (both the code exchange and
// the refresh grant return this same shape, minus `athlete` on refresh).
type StravaTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number; // epoch seconds, per Strava's API
  message?: string; // present on error responses
  errors?: unknown;
};

export type RedirectReturnResult =
  | { status: "none" }
  | { status: "connected" }
  | { status: "error"; message: string };

function readStoredTokens(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.access_token === "string" && typeof parsed?.refresh_token === "string") {
      return parsed as StoredTokens;
    }
  } catch {
    // fall through to null
  }
  return null;
}

function writeStoredTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

function clearStoredTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

async function exchangeToken(body: Record<string, string>): Promise<StoredTokens> {
  const response = await fetch("/api/strava-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json()) as StravaTokenResponse;

  if (!response.ok || !data.access_token || !data.refresh_token || !data.expires_at) {
    throw new Error(data.message || `Strava token request failed (${response.status})`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at * 1000,
  };
}

/** Redirects the browser to Strava's consent screen. */
export function connectStrava(): void {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);

  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: "code",
    approval_prompt: "auto",
    scope: SCOPE,
    state,
  });

  window.location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

export function isStravaConnected(): boolean {
  return readStoredTokens() !== null;
}

export function disconnectStrava(): void {
  clearStoredTokens();
}

/** Returns a currently-valid token, refreshing via the backend if it has expired. */
export async function getValidToken(): Promise<string> {
  const stored = readStoredTokens();
  if (!stored) {
    throw new Error("Not connected. Click “Connect Strava” first.");
  }

  if (Date.now() < stored.expires_at - EXPIRY_SKEW_MS) {
    return stored.access_token;
  }

  try {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: stored.refresh_token,
    });
    writeStoredTokens(refreshed);
    return refreshed.access_token;
  } catch (error) {
    clearStoredTokens();
    throw error;
  }
}

/**
 * Handles the redirect back from Strava's consent screen (`?code=`/`?error=`
 * in the URL). Strips the query string unconditionally afterwards — Strava's
 * authorization codes are single-use, so leaving a dead `code` in the URL
 * would replay into an `invalid_grant` error on the next page load.
 */
export async function handleRedirectReturn(): Promise<RedirectReturnResult> {
  const params = new URLSearchParams(window.location.search);
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");

  if (!error && !code) {
    return { status: "none" };
  }

  try {
    if (error) {
      return { status: "error", message: `Strava connection cancelled (${error}).` };
    }

    const expectedState = sessionStorage.getItem(STATE_KEY);
    if (!state || !expectedState || state !== expectedState) {
      return { status: "error", message: "Strava sign-in failed a security check. Please try again." };
    }

    const tokens = await exchangeToken({ grant_type: "authorization_code", code: code! });
    writeStoredTokens(tokens);
    return { status: "connected" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return { status: "error", message: `Strava connection failed: ${message}` };
  } finally {
    sessionStorage.removeItem(STATE_KEY);
    window.history.replaceState(null, "", window.location.pathname);
  }
}
