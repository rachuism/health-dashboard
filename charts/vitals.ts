import { type ActivityPoint, aggregateSleepMinutes, latestHrvMs, latestRestingHeartRateBpm } from "../parse.js";
import { clearRing, renderRing } from "./ring.js";

const SLEEP_GOAL_HOURS = 8;

function getRequired<T extends Element>(id: string, ctor: { new (): T; prototype: T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

const hrvChartSvg = getRequired("hrvChart", SVGSVGElement);
const hrvSummaryEl = getRequired("hrvSummary", HTMLSpanElement);

const rhrChartSvg = getRequired("rhrChart", SVGSVGElement);
const rhrSummaryEl = getRequired("rhrSummary", HTMLSpanElement);

const sleepChartSvg = getRequired("sleepChart", SVGSVGElement);
const sleepSummaryEl = getRequired("sleepSummary", HTMLSpanElement);

export function drawHrvRing(points: ActivityPoint[]): void {
  const value = latestHrvMs(points);
  hrvSummaryEl.textContent = value == null ? "No data yet" : "Latest reading";
  // No progress arc: HRV has no universal target, so the ring is a static
  // decorative frame around the raw value rather than an implied scale.
  renderRing(hrvChartSvg, {
    valueText: value == null ? "-" : String(Math.round(value)),
    unitText: "ms",
    colorFrom: "#34d399",
    colorTo: "#38bdf8",
  });
}

export function drawRestingHeartRateRing(points: ActivityPoint[]): void {
  const value = latestRestingHeartRateBpm(points);
  rhrSummaryEl.textContent = value == null ? "No data yet" : "Latest reading";
  renderRing(rhrChartSvg, {
    valueText: value == null ? "-" : String(Math.round(value)),
    unitText: "bpm",
    colorFrom: "#fb923c",
    colorTo: "#f87171",
  });
}

export function drawSleepRing(points: ActivityPoint[]): void {
  const totalMinutes = aggregateSleepMinutes(points);
  const hasData = totalMinutes > 0;
  const hours = totalMinutes / 60;

  sleepSummaryEl.textContent = hasData ? `${hours.toFixed(1)}h` : "No data yet";
  renderRing(sleepChartSvg, {
    valueText: hasData ? hours.toFixed(1) : "-",
    unitText: "hours",
    subLabel: `goal ${SLEEP_GOAL_HOURS}h`,
    colorFrom: "#38bdf8",
    colorTo: "#34d399",
    progress: hasData ? hours / SLEEP_GOAL_HOURS : 0,
  });
}

export function clearVitalsRings(): void {
  clearRing(hrvChartSvg);
  clearRing(rhrChartSvg);
  clearRing(sleepChartSvg);
  hrvSummaryEl.textContent = "No data yet";
  rhrSummaryEl.textContent = "No data yet";
  sleepSummaryEl.textContent = "No data yet";
}
