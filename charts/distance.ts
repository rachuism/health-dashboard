import { type ActivityPoint, formatDistanceLabel, groupDistanceByDay } from "../parse.js";

function getRequired<T extends Element>(id: string, ctor: { new (): T; prototype: T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element: ${id}`);
  }
  return element;
}

const distanceChartCanvas = getRequired("distanceChart", HTMLCanvasElement);
const distanceSummaryEl = getRequired("distanceSummary", HTMLSpanElement);

function fitCanvasToCss(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not acquire 2d canvas context.");
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

export function drawDistanceChart(points: ActivityPoint[]): void {
  const ctx = fitCanvasToCss(distanceChartCanvas);
  const { width, height } = distanceChartCanvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);

  const groups = groupDistanceByDay(points).slice(-8);
  if (!groups.length) {
    distanceSummaryEl.textContent = "No distance data found";
    ctx.fillStyle = "#365160";
    ctx.font = "500 14px IBM Plex Mono, monospace";
    ctx.fillText("No distance values found in the response.", 20, 40);
    return;
  }

  const maxValue = Math.max(...groups.map((item) => item.value), 1);
  const padding = { top: 18, right: 18, bottom: 52, left: 22 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = chartWidth / groups.length;
  const gap = Math.min(18, barWidth * 0.22);

  ctx.fillStyle = "rgba(17, 33, 45, 0.08)";
  for (let index = 0; index < 4; index += 1) {
    const y = padding.top + (chartHeight / 4) * index;
    ctx.fillRect(padding.left, y, chartWidth, 1);
  }

  ctx.font = "600 12px Space Grotesk, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  groups.forEach((group, index) => {
    const x = padding.left + index * barWidth + gap / 2;
    const barHeight = (group.value / maxValue) * (chartHeight - 24);
    const y = padding.top + chartHeight - barHeight;

    const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
    gradient.addColorStop(0, "#0f9d8f");
    gradient.addColorStop(1, "#ef7b45");

    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth - gap, barHeight);

    ctx.fillStyle = "#11212d";
    ctx.fillText(formatDistanceLabel(group.value), x + (barWidth - gap) / 2, y - 6);

    ctx.save();
    ctx.fillStyle = "#365160";
    ctx.translate(x + (barWidth - gap) / 2, height - 18);
    ctx.rotate(-0.35);
    ctx.fillText(group.label, 0, 0);
    ctx.restore();
  });

  const totalDistance = groups.reduce((sum, item) => sum + item.value, 0);
  distanceSummaryEl.textContent = `${formatDistanceLabel(totalDistance)} across ${groups.length} day${groups.length === 1 ? "" : "s"}`;
}

export function clearDistanceChart(): void {
  const ctx = distanceChartCanvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, distanceChartCanvas.width, distanceChartCanvas.height);
  }
  distanceSummaryEl.textContent = "No distance data";
}
