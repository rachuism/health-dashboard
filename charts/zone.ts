import { type ActivityPoint, aggregateActiveZoneMinutes } from "../parse.js";

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
const zoneValueEl = getRequired("zoneValue", HTMLDivElement);

export function drawActiveZoneChart(points: ActivityPoint[]): void {
  const totalMinutes = aggregateActiveZoneMinutes(points);
  const progress = Math.max(0, Math.min(totalMinutes / ACTIVE_ZONE_GOAL, 1));
  const remaining = Math.max(ACTIVE_ZONE_GOAL - totalMinutes, 0);
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  zoneValueEl.textContent = String(Math.round(totalMinutes));
  zoneSummaryEl.textContent = remaining > 0 ? `${remaining}m remaining` : "Goal reached";

  zoneChartSvg.innerHTML = [
    '<circle cx="110" cy="110" r="78" fill="none" stroke="rgba(17,33,45,0.08)" stroke-width="20"></circle>',
    `<circle cx="110" cy="110" r="78" fill="none" stroke="url(#zoneGradient)" stroke-width="20" stroke-linecap="round" stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${dashOffset.toFixed(2)}" transform="rotate(-90 110 110)"></circle>`,
    '<defs><linearGradient id="zoneGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0f9d8f"/><stop offset="100%" stop-color="#ef7b45"/></linearGradient></defs>',
    `<text x="110" y="103" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="30" font-weight="700" fill="#11212d">${Math.round(totalMinutes)}</text>`,
    '<text x="110" y="126" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.4" fill="#365160">minutes</text>',
    `<text x="110" y="156" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="10" letter-spacing="0.4" fill="#365160">goal ${ACTIVE_ZONE_GOAL}m</text>`,
  ].join("");
}

export function clearZoneChart(): void {
  zoneChartSvg.innerHTML = "";
  zoneSummaryEl.textContent = `Goal ${ACTIVE_ZONE_GOAL}m`;
  zoneValueEl.textContent = "0";
}
