import { GOOGLE_CLIENT_ID } from "./config.js";

// Minimal typings for the Google Identity Services (GIS) token client.
// For full types: npm i -D @types/google.accounts
interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (resp: TokenResponse) => void;
  error_callback?: (err: { type: string; message?: string }) => void;
}
declare const google: {
  accounts: {
    oauth2: {
      initTokenClient(config: TokenClientConfig): TokenClient;
      revoke(token: string, done?: () => void): void;
    };
  };
};

const SCOPE = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
].join(" ");
// Refresh a little before the real expiry so an in-flight request never races it.
const EXPIRY_SKEW_MS = 60_000;

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0; // epoch ms
let everConsented = false;
let pending: { resolve: (token: string) => void; reject: (err: Error) => void } | null = null;

function settle(ok: boolean, value: string | Error): void {
  const p = pending;
  pending = null;
  if (!p) return;
  if (ok) p.resolve(value as string);
  else p.reject(value as Error);
}

function ensureClient(): TokenClient {
  if (tokenClient) return tokenClient;
  if (typeof google === "undefined" || !google.accounts?.oauth2) {
    throw new Error("Google sign-in isn't ready yet. Check the GIS script loaded, then retry.");
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: (resp) => {
      if (resp.error) {
        settle(false, new Error(resp.error_description || resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + resp.expires_in * 1000 - EXPIRY_SKEW_MS;
      everConsented = true;
      settle(true, resp.access_token);
    },
    error_callback: (err) => settle(false, new Error(err.message || err.type)),
  });
  return tokenClient;
}

export function isSignedIn(): boolean {
  return accessToken !== null && Date.now() < tokenExpiry;
}

/**
 * Request an access token. `interactive` shows Google's account/consent popup
 * (must be called from a user gesture); otherwise it tries to refresh silently.
 */
export function requestToken(interactive: boolean): Promise<string> {
  const client = ensureClient();
  return new Promise<string>((resolve, reject) => {
    // Reject any prior outstanding request before starting a new one.
    settle(false, new Error("Superseded by a newer sign-in request."));
    pending = { resolve, reject };
    client.requestAccessToken({ prompt: interactive ? "consent" : "" });
  });
}

/** Returns a currently-valid token, refreshing silently if it has expired. */
export async function getValidToken(): Promise<string> {
  if (isSignedIn() && accessToken) return accessToken;
  if (!everConsented) {
    throw new Error("Not signed in. Click “Sign in with Google” first.");
  }
  return requestToken(false);
}

export function signOut(): void {
  if (accessToken) google.accounts.oauth2.revoke(accessToken);
  accessToken = null;
  tokenExpiry = 0;
}
