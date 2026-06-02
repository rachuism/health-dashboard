import {
  type ActivityPoint,
  durationMinutes,
  nanosToDateString,
  pickActivityLabel,
} from "./parse.js";

function getRequiredElement<T extends Element>(id: string, ctor: { new (): T; prototype: T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

export const tokenInput = getRequiredElement("tokenInput", HTMLInputElement);
export const jsonInput = getRequiredElement("jsonInput", HTMLTextAreaElement);
export const fetchBtn = getRequiredElement("fetchBtn", HTMLButtonElement);
export const renderBtn = getRequiredElement("renderBtn", HTMLButtonElement);
export const clearBtn = getRequiredElement("clearBtn", HTMLButtonElement);

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

export function clearMetricsAndItems(): void {
  itemsEl.innerHTML = "";
  totalPointsEl.textContent = "0";
  totalDurationEl.textContent = "0m";
  windowStartEl.textContent = "-";
  windowEndEl.textContent = "-";
  emptyStateEl.classList.remove("hidden");
}
