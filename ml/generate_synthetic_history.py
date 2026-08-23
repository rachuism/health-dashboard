"""Generates placeholder daily-history data to train against until the app
actually persists a real per-user history (it currently only reads the
latest live/mock values, see mock.ts and parse.ts's latest*/aggregate*
helpers).

Output schema matches what the app would eventually export for training:
a JSON list of {date, hrvMs, rhrBpm, sleepMinutes, activeZoneMinutes}.

Same-day correlations modeled (see model.FEATURE_ORDER for the vector order):
  - low sleep -> lower HRV, higher RHR
  - high active-zone minutes -> lower HRV, higher RHR (fatigue)
Three anomaly patterns are written separately, isolated to one metric group
each, to sanity-check that training didn't produce a degenerate model that
flags everything (or nothing).
"""

import json
from datetime import date, timedelta
from pathlib import Path

import numpy as np

DATA_DIR = Path(__file__).parent / "data"

rng = np.random.default_rng(42)


def generate_normal_days(n_days: int) -> np.ndarray:
    sleep = rng.normal(400, 35, n_days)
    activity = np.clip(rng.normal(30, 15, n_days), 0, None)

    sleep_deficit = np.clip((400 - sleep) / 60, 0, None)
    activity_load = activity / 60

    hrv = rng.normal(55, 5, n_days) - 3 * sleep_deficit - 1.5 * activity_load
    rhr = rng.normal(58, 3, n_days) + 2 * sleep_deficit + 1.0 * activity_load

    return np.stack([hrv, rhr, sleep, activity], axis=1)


def to_records(vectors: np.ndarray, start_days_ago: int) -> list[dict]:
    today = date.today()
    records = []
    for i, (hrv, rhr, sleep, activity) in enumerate(vectors):
        day = today - timedelta(days=start_days_ago - i)
        records.append({
            "date": day.isoformat(),
            "hrvMs": round(float(hrv), 1),
            "rhrBpm": round(float(rhr), 1),
            "sleepMinutes": round(float(sleep), 1),
            "activeZoneMinutes": round(float(activity), 1),
        })
    return records


def main(n_days: int = 90):
    DATA_DIR.mkdir(exist_ok=True)

    normal = generate_normal_days(n_days)
    history = to_records(normal, start_days_ago=n_days - 1)
    history_path = DATA_DIR / "synthetic_history.json"
    history_path.write_text(json.dumps(history, indent=2))
    print(f"Wrote {len(history)} synthetic days to {history_path}")

    anomalies = {
        "sick_day": {"hrvMs": 30.0, "rhrBpm": 72.0, "sleepMinutes": 410.0, "activeZoneMinutes": 25.0},
        "overtrained": {"hrvMs": 38.0, "rhrBpm": 60.0, "sleepMinutes": 395.0, "activeZoneMinutes": 110.0},
        "poor_sleep": {"hrvMs": 52.0, "rhrBpm": 59.0, "sleepMinutes": 230.0, "activeZoneMinutes": 28.0},
    }
    anomalies_path = DATA_DIR / "synthetic_anomalies.json"
    anomalies_path.write_text(json.dumps(anomalies, indent=2))
    print(f"Wrote {len(anomalies)} labeled anomaly examples to {anomalies_path}")


if __name__ == "__main__":
    main()
