import type { ActivityPoint } from "./parse.js";

const DAY_NANOS = 24 * 60 * 60 * 1e9;

function nanosAgo(daysAgo: number): number {
  return Date.now() * 1e6 - daysAgo * DAY_NANOS;
}

// Oldest to newest, 8 days — matches the distance chart's 8-day window.
const MOCK_DISTANCE_KM = [3.2, 5.1, 0, 7.4, 2.8, 4.6, 6.0, 1.5];
const MOCK_ZONE_MINUTES = [18, 32, 0, 45, 22, 38, 50, 15];
const MOCK_HRV_MS = [52, 48, 55, 61, 58];
const MOCK_RESTING_BPM = [58, 57, 60, 56, 55];

export function getMockExercisePoints(): ActivityPoint[] {
  return MOCK_DISTANCE_KM.map((km, index) => {
    const daysAgo = MOCK_DISTANCE_KM.length - 1 - index;
    const startTimeNanos = nanosAgo(daysAgo);
    return {
      startTimeNanos,
      endTimeNanos: startTimeNanos + 30 * 60 * 1e9,
      distanceMeters: km * 1000,
      activeZoneMinutes: MOCK_ZONE_MINUTES[index],
      value: [{ stringVal: "running" }],
    } as ActivityPoint;
  });
}

export function getMockHrvPoints(): ActivityPoint[] {
  return MOCK_HRV_MS.map((ms) => ({
    rootMeanSquareOfSuccessiveDifferencesMilliseconds: ms,
  })) as ActivityPoint[];
}

export function getMockRestingHeartRatePoints(): ActivityPoint[] {
  return MOCK_RESTING_BPM.map((bpm) => ({
    beatsPerMinute: String(bpm),
  })) as ActivityPoint[];
}

export function getMockSleepPoints(): ActivityPoint[] {
  return [
    {
      summary: {
        stagesSummary: [
          { type: "DEEP", minutes: 85 },
          { type: "LIGHT", minutes: 210 },
          { type: "REM", minutes: 95 },
          { type: "AWAKE", minutes: 20 },
        ],
      },
    },
  ] as ActivityPoint[];
}
