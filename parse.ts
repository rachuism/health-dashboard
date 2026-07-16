type PrimitiveMetric = string | number | boolean | null | undefined;

export type MetricLeaf = {
  stringVal?: string;
  intVal?: number;
  fpVal?: number;
  value?: MetricLeaf;
  mapVal?: Array<{ key: string; value?: MetricLeaf }>;
  [key: string]: unknown;
};

export type ActivityPoint = {
  startTimeNanos?: string | number;
  startTime?: string | number;
  endTimeNanos?: string | number;
  modifiedTimeMillis?: string | number;
  value?: MetricLeaf[];
  [key: string]: unknown;
};

export type DistanceGroup = {
  label: string;
  value: number;
};

export function nanosToDateString(nanos: string | number | null | undefined): string {
  if (!nanos) return "-";
  const ms = Number(nanos) / 1e6;
  if (!Number.isFinite(ms)) return "-";
  return new Date(ms).toLocaleString();
}

export function durationMinutes(
  startNanos: string | number | undefined,
  endNanos: string | number | undefined
): number {
  const startMs = Number(startNanos) / 1e6;
  const endMs = Number(endNanos) / 1e6;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return 0;
  return (endMs - startMs) / 1000 / 60;
}

export function pickActivityLabel(point: ActivityPoint): string {
  const values = Array.isArray(point.value) ? point.value : [];
  for (const entry of values) {
    if (entry.stringVal) return entry.stringVal;
    if (entry.intVal !== undefined) return `type ${entry.intVal}`;
    if (entry.fpVal !== undefined) return `value ${entry.fpVal}`;
    if (entry.mapVal && entry.mapVal.length) {
      return entry.mapVal
        .map((item) => `${item.key}:${item.value?.stringVal ?? item.value?.intVal ?? item.value?.fpVal ?? "?"}`)
        .join(", ");
    }
  }
  return "exercise";
}

function toNumber(value: PrimitiveMetric): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function matchesMetricKey(key: string, terms: string[]): boolean {
  const normalized = String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
  return terms.some((term) => normalized.includes(term));
}

type MetricMatch = { value: number; key: string };

// Find the first numeric value whose field name matches one of `terms`,
// returning both the value and the matched key (joined with the nested key
// when the value lives one level down) so callers can read the field's unit.
function findMetricMatch(value: unknown, terms: string[]): MetricMatch | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findMetricMatch(entry, terms);
      if (found != null) return found;
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  for (const [key, entry] of Object.entries(value)) {
    if (matchesMetricKey(key, terms)) {
      const numeric = toNumber(entry as PrimitiveMetric);
      if (numeric != null) return { value: numeric, key };

      if (entry && typeof entry === "object") {
        for (const [nestedKey, nested] of Object.entries(entry)) {
          const nestedNumeric = toNumber(nested as PrimitiveMetric);
          if (nestedNumeric != null) return { value: nestedNumeric, key: `${key} ${nestedKey}` };
        }
      }
    }
  }

  for (const entry of Object.values(value)) {
    const found = findMetricMatch(entry, terms);
    if (found != null) return found;
  }

  return null;
}

function findMetricValue(value: unknown, terms: string[]): number | null {
  return findMetricMatch(value, terms)?.value ?? null;
}

// Convert a distance value to kilometers using only the unit carried by its own
// field name. A bare/unitless `distance` is treated as meters, matching the
// Google Health/Fitness convention. `kilometre` must be checked before `metre`
// since it contains it as a substring.
function distanceToKm(value: number, key: string): number {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized.includes("mile")) return value * 1.60934;
  if (normalized.includes("kilometer") || normalized.includes("kilometre") || normalized.includes("km")) {
    return value;
  }
  if (normalized.includes("meter") || normalized.includes("metre")) return value / 1000;
  return value / 1000; // default: meters (API convention)
}

export function extractDistanceKm(point: ActivityPoint): number | null {
  const directTerms = [
    "distancekm",
    "distancekilometer",
    "distancekilometre",
    "distancemeter",
    "distancemeters",
    "distancemetre",
    "distancemetres",
    "distancemiles",
    "distance",
  ];
  const match = findMetricMatch(point, directTerms);
  if (match == null) return null;

  return distanceToKm(match.value, match.key);
}

export function extractActiveZoneMinutes(point: ActivityPoint): number | null {
  return findMetricValue(point, [
    "activezoneminute",
    "activezone",
    "zoneminute",
    "zoneminutes",
    "activeminute",
  ]);
}

export function extractHrvMs(point: ActivityPoint): number | null {
  return findMetricValue(point, [
    "rootmeansquareofsuccessivedifferencesmilliseconds",
    "standarddeviationmilliseconds",
    "rmssd",
  ]);
}

export function extractRestingHeartRateBpm(point: ActivityPoint): number | null {
  return findMetricValue(point, ["beatsperminute"]);
}

type SleepStagesSummary = { type?: string; minutes?: PrimitiveMetric };

export function extractSleepMinutes(point: ActivityPoint): number {
  const summary = (point as { summary?: { stagesSummary?: SleepStagesSummary[] } }).summary;
  const stages = summary?.stagesSummary;
  if (!Array.isArray(stages)) return 0;

  return stages.reduce((total, stage) => {
    if (stage?.type === "AWAKE") return total;
    return total + (toNumber(stage?.minutes) ?? 0);
  }, 0);
}

// API list endpoints return points in chronological order, so the last
// element with an extractable value is the most recent reading.
export function latestHrvMs(points: ActivityPoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const value = extractHrvMs(points[i]);
    if (value != null) return value;
  }
  return null;
}

export function latestRestingHeartRateBpm(points: ActivityPoint[]): number | null {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const value = extractRestingHeartRateBpm(points[i]);
    if (value != null) return value;
  }
  return null;
}

export function aggregateSleepMinutes(points: ActivityPoint[]): number {
  let total = 0;
  for (const point of points) {
    total += extractSleepMinutes(point);
  }
  return total;
}

export function formatDistanceLabel(distanceKm: number | null): string {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return "-";
  if (distanceKm >= 1) return `${distanceKm.toFixed(distanceKm >= 10 ? 0 : 1)} km`;
  return `${Math.round(distanceKm * 1000)} m`;
}

export function groupDistanceByDay(points: ActivityPoint[]): DistanceGroup[] {
  const map = new Map<string, number>();

  for (const point of points) {
    const distanceKm = extractDistanceKm(point);
    if (distanceKm == null) continue;

    const start = Number(
      point.startTimeNanos || point.startTime || point.endTimeNanos || point.modifiedTimeMillis || 0
    );
    const date =
      Number.isFinite(start) && start > 1e12
        ? new Date(start / 1e6)
        : Number.isFinite(start)
          ? new Date(start)
          : null;
    const key = date ? date.toLocaleDateString() : "Unknown";
    map.set(key, (map.get(key) || 0) + distanceKm);
  }

  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
}

export function aggregateActiveZoneMinutes(points: ActivityPoint[]): number {
  let total = 0;
  for (const point of points) {
    const extracted = extractActiveZoneMinutes(point);
    if (extracted != null) total += extracted;
  }
  return total;
}

export function extractJsonText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject !== -1 && lastObject !== -1 && lastObject > firstObject) {
      return trimmed.slice(firstObject, lastObject + 1);
    }

    const firstArray = trimmed.indexOf("[");
    const lastArray = trimmed.lastIndexOf("]");
    if (firstArray !== -1 && lastArray !== -1 && lastArray > firstArray) {
      return trimmed.slice(firstArray, lastArray + 1);
    }
  }

  return null;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getPointsFromParsedResponse(parsed: unknown): ActivityPoint[] {
  if (Array.isArray(parsed)) return parsed as ActivityPoint[];

  if (isObjectRecord(parsed)) {
    const candidateKeys = ["point", "points", "dataPoints", "items", "rows", "data"];
    for (const key of candidateKeys) {
      if (Array.isArray(parsed[key])) return parsed[key] as ActivityPoint[];
    }

    for (const value of Object.values(parsed)) {
      if (Array.isArray(value) && value.length && value.every((item) => isObjectRecord(item))) {
        return value as ActivityPoint[];
      }
    }
  }

  return [];
}
