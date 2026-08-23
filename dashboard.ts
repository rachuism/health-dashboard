import { fetchDataPoints } from "./api.js";
import { getValidToken, requestToken, signOut } from "./auth.js";
import {
  aggregateActiveZoneMinutes,
  aggregateSleepMinutes,
  type ActivityPoint,
  extractJsonText,
  getPointsFromParsedResponse,
  latestHrvMs,
  latestRestingHeartRateBpm,
} from "./parse.js";
import {
  type Feeling,
  getFeelingConcordance,
  getTodayEntry,
  isCompleteEntry,
  recordTodayFeeling,
  recordTodayMetrics,
} from "./history.js";
import { scoreToday } from "./recovery.js";
import {
  clearBtn,
  clearFeelingUi,
  clearMetricsAndItems,
  clearRecoverySignal,
  clearStravaActivities,
  connectStravaBtn,
  disconnectStravaBtn,
  feelingBadBtn,
  feelingGoodBtn,
  feelingOkayBtn,
  fetchBtn,
  jsonInput,
  mockBtn,
  renderBtn,
  renderFeelingConcordance,
  renderItems,
  renderMetrics,
  renderRecoverySignal,
  renderStravaActivities,
  setAuthState,
  setFeelingState,
  setRecoveryStatus,
  setStatus,
  setStravaAuthState,
  signInBtn,
  signOutBtn,
} from "./ui.js";
import { clearDistanceChart, drawDistanceChart } from "./charts/distance.js";
import { clearZoneChart, drawActiveZoneChart } from "./charts/zone.js";
import { clearVitalsRings, drawHrvRing, drawRestingHeartRateRing, drawSleepRing } from "./charts/vitals.js";
import {
  getMockExercisePoints,
  getMockHrvPoints,
  getMockRestingHeartRatePoints,
  getMockSleepPoints,
  getMockStravaActivities,
} from "./mock.js";
import { connectStrava, disconnectStrava, getValidToken as getValidStravaToken, handleRedirectReturn, isStravaConnected } from "./stravaAuth.js";
import { fetchActivities, parseActivities } from "./stravaApi.js";

function renderCharts(points: ActivityPoint[]): void {
  drawDistanceChart(points);
  drawActiveZoneChart(points);
}

function parseAndRender(): void {
  const text = jsonInput.value;
  const jsonText = extractJsonText(text);
  if (!jsonText) {
    setStatus("Paste a JSON response first.", "error");
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    setStatus("Invalid JSON. Check response formatting.", "error");
    return;
  }

  const points = getPointsFromParsedResponse(parsed);
  renderMetrics(points);
  renderCharts(points);
  renderItems(points);
  setStatus(
    points.length ? "Dashboard rendered from response JSON." : "JSON parsed, but no data points were found.",
    points.length ? "ok" : "error"
  );
}

// Vitals (HRV/RHR/sleep) share the already-validated token from the caller
// instead of each retrying 401s independently — auth.ts's requestToken()
// keeps only one pending request at a time, so concurrent retries would
// cancel each other. A failed/empty fetch here just renders that ring's
// empty state; it must not affect the exercise distance/zone rendering.
async function fetchVitalMetric(
  token: string,
  dataType: string,
  render: (points: ActivityPoint[]) => void,
  onFetched?: (points: ActivityPoint[]) => void
): Promise<void> {
  try {
    const result = await fetchDataPoints(token, dataType);
    const points = result.ok ? getPointsFromParsedResponse(JSON.parse(result.bodyText)) : [];
    render(points);
    // Only record on a genuinely successful fetch -- an empty `points` from a
    // failed/thrown request must never be mistaken for "confirmed zero" data.
    if (result.ok) onFetched?.(points);
  } catch {
    render([]);
  }
}

async function fetchFromApi(): Promise<void> {
  setStatus("Fetching data from API...");

  try {
    let token = await getValidToken();
    let result = await fetchDataPoints(token, "exercise");

    // Token may have been revoked/expired server-side: refresh once and retry.
    if (result.status === 401) {
      token = await requestToken(false);
      result = await fetchDataPoints(token, "exercise");
    }

    jsonInput.value = result.bodyText;

    if (!result.ok) {
      setStatus(`API error ${result.status}. Response loaded for inspection.`, "error");
      return;
    }

    parseAndRender();
    // Re-parsed from the same bodyText parseAndRender() just used (it reads
    // from jsonInput.value internally and doesn't hand points back out) --
    // duplicated here only for the history write below.
    recordTodayMetrics({
      activeZoneMinutes: aggregateActiveZoneMinutes(getPointsFromParsedResponse(JSON.parse(result.bodyText))),
    });

    await Promise.all([
      fetchVitalMetric(token, "heart-rate-variability", drawHrvRing, (points) =>
        recordTodayMetrics({ hrvMs: latestHrvMs(points) })
      ),
      fetchVitalMetric(token, "daily-resting-heart-rate", drawRestingHeartRateRing, (points) =>
        recordTodayMetrics({ rhrBpm: latestRestingHeartRateBpm(points) })
      ),
      fetchVitalMetric(token, "sleep", drawSleepRing, (points) =>
        recordTodayMetrics({ sleepMinutes: aggregateSleepMinutes(points) })
      ),
    ]);

    await updateRecoverySignal();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    setStatus(`Request failed: ${message}`, "error");
  }
}

// Only ever scores today's *real* recorded history (see history.ts) --
// never the mock flow -- and only once all four of today's metrics were
// successfully fetched, since the model needs a complete vector.
async function updateRecoverySignal(): Promise<void> {
  const entry = getTodayEntry();
  if (!entry || !isCompleteEntry(entry)) {
    setRecoveryStatus("Not enough of today's metrics recorded yet.");
    return;
  }

  setRecoveryStatus("Scoring today's recovery signal... (first time on this device downloads a small local scoring model, ~11MB)");
  try {
    const signal = await scoreToday(entry);
    renderRecoverySignal(signal);
    // Recorded so getFeelingConcordance() can later check this verdict
    // against how the day actually felt, once rated.
    recordTodayMetrics({ flagged: signal.flagged });
    refreshFeelingUi();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    setRecoveryStatus(`Recovery signal unavailable: ${message}`);
  }
}

function refreshFeelingUi(): void {
  setFeelingState(getTodayEntry()?.feeling ?? null);
  renderFeelingConcordance(getFeelingConcordance());
}

function handleFeelingClick(feeling: Feeling): void {
  recordTodayFeeling(feeling);
  refreshFeelingUi();
}

async function signIn(): Promise<void> {
  setStatus("Opening Google sign-in...");
  try {
    await requestToken(true);
    setAuthState(true);
    setStatus("Signed in. Fetching your health data...");
    await fetchFromApi();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    setStatus(`Sign-in failed: ${message}`, "error");
  }
}

function handleSignOut(): void {
  signOut();
  setAuthState(false);
  setStatus("Signed out.");
}

async function fetchStravaActivities(): Promise<void> {
  setStatus("Fetching activities from Strava...");
  try {
    const token = await getValidStravaToken();
    const result = await fetchActivities(token);
    if (!result.ok) {
      setStatus(`Strava API error ${result.status}.`, "error");
      return;
    }
    renderStravaActivities(parseActivities(result.bodyText));
    setStatus("Strava activities loaded.", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    setStatus(`Strava request failed: ${message}`, "error");
  }
}

function handleStravaDisconnect(): void {
  disconnectStrava();
  setStravaAuthState(false);
  clearStravaActivities();
  setStatus("Disconnected from Strava.");
}

function loadMockData(): void {
  const points = getMockExercisePoints();
  jsonInput.value = JSON.stringify({ point: points }, null, 2);
  renderMetrics(points);
  renderCharts(points);
  renderItems(points);
  drawHrvRing(getMockHrvPoints());
  drawRestingHeartRateRing(getMockRestingHeartRatePoints());
  drawSleepRing(getMockSleepPoints());
  renderStravaActivities(getMockStravaActivities());
  setStatus("Showing mock data — not from your account.", "ok");
}

function clearAll(): void {
  jsonInput.value = "";
  clearMetricsAndItems();
  clearDistanceChart();
  clearZoneChart();
  clearVitalsRings();
  clearStravaActivities();
  clearRecoverySignal();
  clearFeelingUi();
  setStatus("Cleared.");
}

signInBtn.addEventListener("click", signIn);
signOutBtn.addEventListener("click", handleSignOut);
fetchBtn.addEventListener("click", fetchFromApi);
renderBtn.addEventListener("click", parseAndRender);
mockBtn.addEventListener("click", loadMockData);
clearBtn.addEventListener("click", clearAll);
connectStravaBtn.addEventListener("click", connectStrava);
disconnectStravaBtn.addEventListener("click", handleStravaDisconnect);
feelingBadBtn.addEventListener("click", () => handleFeelingClick("bad"));
feelingOkayBtn.addEventListener("click", () => handleFeelingClick("okay"));
feelingGoodBtn.addEventListener("click", () => handleFeelingClick("good"));

setAuthState(false);
// Feeling/concordance come from localStorage, not a network fetch, so they
// reflect immediately on load rather than waiting for fetchFromApi().
refreshFeelingUi();

// Strava state survives reloads (unlike Google's in-memory-only token), so it
// needs an explicit hydrate-then-handle-redirect step on load. This runs
// after setAuthState(false) above (that call is Google-only) but must finish
// before anything else touches Strava UI state.
async function initStrava(): Promise<void> {
  const result = await handleRedirectReturn();
  if (result.status === "error") {
    setStatus(result.message, "error");
  } else if (result.status === "connected") {
    setStatus("Connected to Strava.", "ok");
  }

  const connected = isStravaConnected();
  setStravaAuthState(connected);
  if (connected) {
    await fetchStravaActivities();
  }
}

void initStrava();
