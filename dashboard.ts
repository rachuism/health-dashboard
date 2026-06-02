import { fetchExerciseDataPoints } from "./api.js";
import { type ActivityPoint, extractJsonText, getPointsFromParsedResponse } from "./parse.js";
import {
  clearBtn,
  clearMetricsAndItems,
  fetchBtn,
  jsonInput,
  renderBtn,
  renderItems,
  renderMetrics,
  setStatus,
  tokenInput,
} from "./ui.js";
import { clearDistanceChart, drawDistanceChart } from "./charts/distance.js";
import { clearZoneChart, drawActiveZoneChart } from "./charts/zone.js";

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

async function fetchFromApi(): Promise<void> {
  const token = tokenInput.value.trim();
  if (!token) {
    setStatus("Access token is required to fetch data.", "error");
    return;
  }

  setStatus("Fetching data from API...");

  try {
    const result = await fetchExerciseDataPoints(token);
    jsonInput.value = result.bodyText;

    if (!result.ok) {
      setStatus(`API error ${result.status}. Response loaded for inspection.`, "error");
      return;
    }

    parseAndRender();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    setStatus(`Request failed: ${message}`, "error");
  }
}

function clearAll(): void {
  jsonInput.value = "";
  clearMetricsAndItems();
  clearDistanceChart();
  clearZoneChart();
  setStatus("Cleared.");
}

fetchBtn.addEventListener("click", fetchFromApi);
renderBtn.addEventListener("click", parseAndRender);
clearBtn.addEventListener("click", clearAll);
