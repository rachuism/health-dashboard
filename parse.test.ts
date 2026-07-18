import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type ActivityPoint,
  aggregateActiveZoneMinutes,
  aggregateSleepMinutes,
  durationMinutes,
  extractActiveZoneMinutes,
  extractDistanceKm,
  extractHrvMs,
  extractJsonText,
  extractRestingHeartRateBpm,
  extractSleepMinutes,
  formatDistanceLabel,
  getPointsFromParsedResponse,
  groupDistanceByDay,
  latestHrvMs,
  latestRestingHeartRateBpm,
  nanosToDateString,
  pickActivityLabel,
} from "./parse.js";

test("extractDistanceKm converts using the matched field's own unit", () => {
  assert.equal(extractDistanceKm({ distanceMeters: 1500 } as ActivityPoint), 1.5);
  assert.equal(extractDistanceKm({ distanceKm: 3 } as ActivityPoint), 3);
  assert.equal(extractDistanceKm({ distanceMiles: 1 } as ActivityPoint), 1.60934);
});

test("extractDistanceKm treats a bare 'distance' field as meters (API convention)", () => {
  assert.equal(extractDistanceKm({ distance: 500 } as ActivityPoint), 0.5);
});

test("extractDistanceKm converts by the matched field's own unit, not unrelated text elsewhere in the point", () => {
  // Regression test for the bug this was fixed for: distance used to be
  // converted by scanning the whole serialized point for "mile"/"meter",
  // which could misfire on an unrelated string value.
  const point = {
    distanceMeters: 1000,
    notes: "ran 2 miles total, but this field is meters",
  } as ActivityPoint;
  assert.equal(extractDistanceKm(point), 1);
});

test("extractDistanceKm returns null when no distance field is present", () => {
  assert.equal(extractDistanceKm({ foo: "bar" } as ActivityPoint), null);
});

test("formatDistanceLabel formats sub-km distances in meters", () => {
  assert.equal(formatDistanceLabel(0.42), "420 m");
});

test("formatDistanceLabel formats km distances with appropriate precision", () => {
  assert.equal(formatDistanceLabel(5.2), "5.2 km");
  assert.equal(formatDistanceLabel(12.7), "13 km");
});

test("formatDistanceLabel handles null/non-finite input", () => {
  assert.equal(formatDistanceLabel(null), "-");
  assert.equal(formatDistanceLabel(Number.NaN), "-");
});

test("extractActiveZoneMinutes finds zone-minute fields by fuzzy key match", () => {
  assert.equal(extractActiveZoneMinutes({ activeZoneMinutes: 12 } as ActivityPoint), 12);
  assert.equal(extractActiveZoneMinutes({ value: [{ activeZoneMinute: 7 }] } as unknown as ActivityPoint), 7);
});

test("aggregateActiveZoneMinutes sums across all points, skipping ones without the field", () => {
  const points = [
    { activeZoneMinutes: 10 },
    { distance: 100 },
    { activeZoneMinutes: 5 },
  ] as ActivityPoint[];
  assert.equal(aggregateActiveZoneMinutes(points), 15);
});

test("nanosToDateString returns '-' for missing/invalid input", () => {
  assert.equal(nanosToDateString(undefined), "-");
  assert.equal(nanosToDateString(null), "-");
});

test("durationMinutes computes elapsed minutes between nanosecond timestamps", () => {
  const endNanos = 5 * 60 * 1e9; // 5 minutes, expressed in nanoseconds
  assert.equal(durationMinutes(0, endNanos), 5);
});

test("durationMinutes returns 0 for a reversed or missing window", () => {
  assert.equal(durationMinutes(5 * 60 * 1e9, 0), 0);
  assert.equal(durationMinutes(undefined, undefined), 0);
});

test("pickActivityLabel prefers a string value, falling back through the value array", () => {
  assert.equal(pickActivityLabel({ value: [{ stringVal: "Running" }] } as ActivityPoint), "Running");
  assert.equal(pickActivityLabel({ value: [{ intVal: 8 }] } as ActivityPoint), "type 8");
  assert.equal(pickActivityLabel({ value: [] } as ActivityPoint), "exercise");
});

test("extractJsonText extracts the object literal from surrounding prose", () => {
  assert.equal(extractJsonText('here you go: {"point":[]} thanks'), '{"point":[]}');
});

test("extractJsonText returns null for empty/unparseable input", () => {
  assert.equal(extractJsonText(""), null);
  assert.equal(extractJsonText("just some text with no braces"), null);
});

test("getPointsFromParsedResponse finds the point array under common key names", () => {
  assert.deepEqual(getPointsFromParsedResponse({ point: [{ a: 1 }] }), [{ a: 1 }]);
  assert.deepEqual(getPointsFromParsedResponse({ dataPoints: [{ b: 2 }] }), [{ b: 2 }]);
});

test("getPointsFromParsedResponse falls back to the first array-of-objects value for unknown key names", () => {
  assert.deepEqual(getPointsFromParsedResponse({ someUnknownKey: [{ c: 3 }] }), [{ c: 3 }]);
});

test("getPointsFromParsedResponse returns an empty array when nothing matches", () => {
  assert.deepEqual(getPointsFromParsedResponse({ foo: "bar" }), []);
  assert.deepEqual(getPointsFromParsedResponse(null), []);
});

test("extractHrvMs reads the RMSSD field from a heart-rate-variability sample", () => {
  const point = { rootMeanSquareOfSuccessiveDifferencesMilliseconds: 42 } as ActivityPoint;
  assert.equal(extractHrvMs(point), 42);
});

test("extractRestingHeartRateBpm parses the string-typed beatsPerMinute field", () => {
  const point = { beatsPerMinute: "58" } as ActivityPoint;
  assert.equal(extractRestingHeartRateBpm(point), 58);
});

test("extractSleepMinutes sums stage minutes, excluding AWAKE", () => {
  const point = {
    summary: {
      stagesSummary: [
        { type: "DEEP", minutes: "90" },
        { type: "LIGHT", minutes: 240 },
        { type: "AWAKE", minutes: 15 },
      ],
    },
  } as ActivityPoint;
  assert.equal(extractSleepMinutes(point), 330);
});

test("extractSleepMinutes returns 0 when there is no stages summary", () => {
  assert.equal(extractSleepMinutes({} as ActivityPoint), 0);
});

test("aggregateSleepMinutes sums sleep minutes across all sessions in the window", () => {
  const points = [
    { summary: { stagesSummary: [{ type: "DEEP", minutes: 100 }] } },
    { summary: { stagesSummary: [{ type: "LIGHT", minutes: 50 }] } },
  ] as ActivityPoint[];
  assert.equal(aggregateSleepMinutes(points), 150);
});

test("latestHrvMs returns the last point with an extractable value, skipping ones without it", () => {
  const points = [
    { rootMeanSquareOfSuccessiveDifferencesMilliseconds: 30 },
    { someOtherField: 1 },
    { rootMeanSquareOfSuccessiveDifferencesMilliseconds: 55 },
  ] as ActivityPoint[];
  assert.equal(latestHrvMs(points), 55);
});

test("latestHrvMs returns null for an empty list", () => {
  assert.equal(latestHrvMs([]), null);
});

test("latestRestingHeartRateBpm returns the most recent bpm reading", () => {
  const points = [{ beatsPerMinute: "60" }, { beatsPerMinute: "57" }] as ActivityPoint[];
  assert.equal(latestRestingHeartRateBpm(points), 57);
});

test("groupDistanceByDay groups and sums distance per calendar day", () => {
  const points = [
    { distanceMeters: 1000, startTimeNanos: 0 },
    { distanceMeters: 2000, startTimeNanos: 0 },
  ] as ActivityPoint[];
  const groups = groupDistanceByDay(points);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].value, 3);
});
