import { type ActivityPoint, aggregateActiveZoneMinutes } from "../parse.js";
import { clearRing, renderRing } from "./ring.js";

const ACTIVE_ZONE_GOAL = 60;

function getRequired<T extends Element>(id: string, ctor: { new (): T; prototype: T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

const zoneChartSvg = getRequired("zoneChart", SVGSVGElement);
const zoneSummaryEl = getRequired("zoneSummary", HTMLSpanElement);

export function drawActiveZoneChart(points: ActivityPoint[]): void {
  const totalMinutes = aggregateActiveZoneMinutes(points);
  const progress = totalMinutes / ACTIVE_ZONE_GOAL;
  const remaining = Math.max(ACTIVE_ZONE_GOAL - totalMinutes, 0);

  zoneSummaryEl.textContent = remaining > 0 ? `${remaining}m remaining` : "Goal reached";

  renderRing(zoneChartSvg, {
    valueText: String(Math.round(totalMinutes)),
    unitText: "minutes",
    subLabel: `goal ${ACTIVE_ZONE_GOAL}m`,
    colorFrom: "#fb923c",
    colorTo: "#34d399",
    progress,
  });
}

export function clearZoneChart(): void {
  clearRing(zoneChartSvg);
  zoneSummaryEl.textContent = `Goal ${ACTIVE_ZONE_GOAL}m`;
}
