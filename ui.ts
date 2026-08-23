import {
  type ActivityPoint,
  durationMinutes,
  formatDistanceLabel,
  nanosToDateString,
  pickActivityLabel,
} from "./parse.js";
import type { Feeling, FeelingConcordance } from "./history.js";
import type { RecoverySignal } from "./recovery.js";
import type { StravaActivity } from "./stravaApi.js";

function getRequiredElement<T extends Element>(id: string, ctor: { new (): T; prototype: T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

export const jsonInput = getRequiredElement("jsonInput", HTMLTextAreaElement);
export const signInBtn = getRequiredElement("signInBtn", HTMLButtonElement);
export const signOutBtn = getRequiredElement("signOutBtn", HTMLButtonElement);
export const fetchBtn = getRequiredElement("fetchBtn", HTMLButtonElement);
export const renderBtn = getRequiredElement("renderBtn", HTMLButtonElement);
export const mockBtn = getRequiredElement("mockBtn", HTMLButtonElement);
export const clearBtn = getRequiredElement("clearBtn", HTMLButtonElement);

export const connectStravaBtn = getRequiredElement("connectStravaBtn", HTMLButtonElement);
export const disconnectStravaBtn = getRequiredElement("disconnectStravaBtn", HTMLButtonElement);

const authStateEl = getRequiredElement("authState", HTMLDivElement);

export function setAuthState(signedIn: boolean): void {
  authStateEl.textContent = signedIn ? "Signed in to Google" : "Not signed in";
  authStateEl.className = "auth-state" + (signedIn ? " ok" : "");
  signInBtn.hidden = signedIn;
  signOutBtn.hidden = !signedIn;
  fetchBtn.disabled = !signedIn;
}

const stravaAuthStateEl = getRequiredElement("stravaAuthState", HTMLDivElement);

export function setStravaAuthState(connected: boolean): void {
  stravaAuthStateEl.textContent = connected ? "Connected to Strava" : "Not connected";
  stravaAuthStateEl.className = "auth-state" + (connected ? " ok" : "");
  connectStravaBtn.hidden = connected;
  disconnectStravaBtn.hidden = !connected;
}

const statusEl = getRequiredElement("status", HTMLDivElement);
const totalPointsEl = getRequiredElement("totalPoints", HTMLParagraphElement);
const totalDurationEl = getRequiredElement("totalDuration", HTMLParagraphElement);
const windowStartEl = getRequiredElement("windowStart", HTMLParagraphElement);
const windowEndEl = getRequiredElement("windowEnd", HTMLParagraphElement);
const itemsEl = getRequiredElement("items", HTMLUListElement);
const emptyStateEl = getRequiredElement("emptyState", HTMLParagraphElement);

export type StatusKind = "ok" | "error";

export function setStatus(message: string, kind?: StatusKind): void {
  statusEl.textContent = message;
  statusEl.className = "status" + (kind ? ` ${kind}` : "");
}

function escapeHtml(raw: unknown): string {
  return String(raw)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderMetrics(points: ActivityPoint[]): void {
  totalPointsEl.textContent = String(points.length);

  let totalMinutes = 0;
  let minStart: number | null = null;
  let maxEnd: number | null = null;

  for (const point of points) {
    totalMinutes += durationMinutes(point.startTimeNanos, point.endTimeNanos);
    const start = Number(point.startTimeNanos);
    const end = Number(point.endTimeNanos);
    if (Number.isFinite(start) && (minStart === null || start < minStart)) minStart = start;
    if (Number.isFinite(end) && (maxEnd === null || end > maxEnd)) maxEnd = end;
  }

  totalDurationEl.textContent = `${Math.round(totalMinutes)}m`;
  windowStartEl.textContent = nanosToDateString(minStart);
  windowEndEl.textContent = nanosToDateString(maxEnd);
}

export function renderItems(points: ActivityPoint[]): void {
  itemsEl.innerHTML = "";
  const sorted = [...points].sort(
    (left, right) => Number(right.endTimeNanos || 0) - Number(left.endTimeNanos || 0)
  );

  if (!sorted.length) {
    emptyStateEl.classList.remove("hidden");
    return;
  }

  emptyStateEl.classList.add("hidden");

  const maxItems = Math.min(12, sorted.length);
  for (let index = 0; index < maxItems; index += 1) {
    const point = sorted[index];
    const listItem = document.createElement("li");
    listItem.className = "item";

    const minutes = durationMinutes(point.startTimeNanos, point.endTimeNanos);
    const activity = pickActivityLabel(point);

    listItem.innerHTML = [
      `<div class="item-top"><span>${escapeHtml(activity)}</span><span>${Math.round(minutes)}m</span></div>`,
      `<div class="item-meta">start: ${escapeHtml(nanosToDateString(point.startTimeNanos))}</div>`,
      `<div class="item-meta">end: ${escapeHtml(nanosToDateString(point.endTimeNanos))}</div>`,
      point.modifiedTimeMillis
        ? `<div class="item-meta">modified: ${escapeHtml(new Date(Number(point.modifiedTimeMillis)).toLocaleString())}</div>`
        : "",
    ].join("");

    itemsEl.appendChild(listItem);
  }
}

const stravaItemsEl = getRequiredElement("stravaItems", HTMLUListElement);
const stravaEmptyStateEl = getRequiredElement("stravaEmptyState", HTMLParagraphElement);

export function renderStravaActivities(activities: StravaActivity[]): void {
  stravaItemsEl.innerHTML = "";

  if (!activities.length) {
    stravaEmptyStateEl.classList.remove("hidden");
    return;
  }

  stravaEmptyStateEl.classList.add("hidden");

  const sorted = [...activities].sort(
    (left, right) => new Date(right.start_date).getTime() - new Date(left.start_date).getTime()
  );

  for (const activity of sorted.slice(0, 12)) {
    const listItem = document.createElement("li");
    listItem.className = "item";

    const minutes = activity.moving_time / 60;
    const distanceLabel = formatDistanceLabel(activity.distance / 1000);

    listItem.innerHTML = [
      `<div class="item-top"><span>${escapeHtml(activity.name)}</span><span>${Math.round(minutes)}m</span></div>`,
      `<div class="item-meta">${escapeHtml(activity.type)} · ${escapeHtml(distanceLabel)}</div>`,
      `<div class="item-meta">${escapeHtml(new Date(activity.start_date).toLocaleString())}</div>`,
    ].join("");

    stravaItemsEl.appendChild(listItem);
  }
}

export function clearStravaActivities(): void {
  stravaItemsEl.innerHTML = "";
  stravaEmptyStateEl.classList.remove("hidden");
}

const recoverySummaryEl = getRequiredElement("recoverySummary", HTMLSpanElement);
const recoveryStatusEl = getRequiredElement("recoveryStatus", HTMLParagraphElement);
const recoveryBreakdownEl = getRequiredElement("recoveryBreakdown", HTMLUListElement);

const RECOVERY_FEATURE_LABELS: Record<string, string> = {
  hrvMs: "HRV",
  rhrBpm: "Resting heart rate",
  sleepMinutes: "Sleep",
  activeZoneMinutes: "Active zone minutes",
};

export function setRecoveryStatus(message: string): void {
  recoveryStatusEl.textContent = message;
  recoveryStatusEl.classList.remove("hidden");
  recoverySummaryEl.textContent = "-";
  recoveryBreakdownEl.innerHTML = "";
}

export function renderRecoverySignal(signal: RecoverySignal): void {
  recoveryStatusEl.classList.add("hidden");
  recoverySummaryEl.textContent = signal.flagged ? "Atypical day" : "Within your normal range";
  recoverySummaryEl.className = signal.flagged ? "error" : "ok";

  recoveryBreakdownEl.innerHTML = "";
  for (const { feature, error } of signal.perFeature) {
    const listItem = document.createElement("li");
    listItem.className = "item";
    const label = RECOVERY_FEATURE_LABELS[feature] ?? feature;
    listItem.innerHTML = `<div class="item-top"><span>${escapeHtml(label)}</span><span>${error.toFixed(2)}</span></div>`;
    recoveryBreakdownEl.appendChild(listItem);
  }
}

export function clearRecoverySignal(): void {
  setRecoveryStatus("No response fetched yet.");
}

export const feelingBadBtn = getRequiredElement("feelingBadBtn", HTMLButtonElement);
export const feelingOkayBtn = getRequiredElement("feelingOkayBtn", HTMLButtonElement);
export const feelingGoodBtn = getRequiredElement("feelingGoodBtn", HTMLButtonElement);

const feelingStateEl = getRequiredElement("feelingState", HTMLParagraphElement);
const feelingConcordanceEl = getRequiredElement("feelingConcordance", HTMLParagraphElement);

const FEELING_LABELS: Record<Feeling, string> = { bad: "Bad", okay: "Okay", good: "Good" };

export function setFeelingState(feeling: Feeling | null): void {
  feelingStateEl.textContent = feeling ? `Marked as: ${FEELING_LABELS[feeling]}` : "";
}

export function renderFeelingConcordance(concordance: FeelingConcordance | null): void {
  if (!concordance) {
    feelingConcordanceEl.textContent = "";
    return;
  }
  const pct = (rate: number | null) => (rate == null ? "n/a" : `${Math.round(rate * 100)}%`);
  feelingConcordanceEl.textContent =
    `Over ${concordance.ratedDays} rated days: felt "Bad" on ${pct(concordance.badRateWhenFlagged)} of flagged days ` +
    `vs. ${pct(concordance.badRateWhenNotFlagged)} of non-flagged days.`;
}

export function clearFeelingUi(): void {
  setFeelingState(null);
  renderFeelingConcordance(null);
}

export function clearMetricsAndItems(): void {
  itemsEl.innerHTML = "";
  totalPointsEl.textContent = "0";
  totalDurationEl.textContent = "0m";
  windowStartEl.textContent = "-";
  windowEndEl.textContent = "-";
  emptyStateEl.classList.remove("hidden");
}
