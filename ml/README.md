# Recovery-signal model (PyTorch → ONNX)

Offline training pipeline for a small autoencoder that flags atypical days
(HRV, resting heart rate, sleep, active-zone minutes) against your own
history. Trains in PyTorch; the exported ONNX model is meant to run
client-side via [onnxruntime-web](https://onnxruntime.ai/docs/tutorials/web/)
— nothing here is a running service, it just produces two static files for
the frontend to load.

This is **not wired into the app yet**. The dashboard has no persisted daily
history to train on (see `parse.ts`'s `latest*`/`aggregate*` helpers — it
only ever reads the most recent live/mock values). Until that exists, this
pipeline trains on synthetic data as a placeholder to validate the approach
and keep the export path working.

Prototype note: a plain Mahalanobis-distance baseline (mean vector +
covariance matrix, no neural net) matched this autoencoder's anomaly
detection on the same synthetic data, with no training step and fully
transparent math. The autoencoder is worth it if the feature set grows
non-linearly (multi-day sequences, per-sleep-stage detail, Strava
in-workout heart rate) — for today's 4 flat features, Mahalanobis is the
simpler and equally honest option. Keeping PyTorch here anyway per request.

## Setup

```bash
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
```

## Usage

```bash
./venv/bin/python generate_synthetic_history.py   # placeholder data only —
                                                    # skip once real history exists
./venv/bin/python train_recovery_model.py
```

`train_recovery_model.py` refuses to run on fewer than ~20 days of history
(not enough signal to be worth training — see the conversation this came
from) and refuses to write anomaly-flagged model artifacts if its own
sanity check fails: it re-runs three labeled synthetic anomalies (sick day,
overtrained, poor sleep) through both the PyTorch model and the exported
ONNX model, and requires that every one gets flagged and that PyTorch/ONNX
outputs match exactly.

## Files

| File | Role |
| --- | --- |
| `model.py` | `RecoveryAutoencoder` definition + `FEATURE_ORDER` (must stay in sync with `parse.ts`'s extractors: HRV ms, RHR bpm, sleep minutes, active-zone minutes) |
| `generate_synthetic_history.py` | Writes placeholder `data/synthetic_history.json` + `data/synthetic_anomalies.json` |
| `train_recovery_model.py` | Trains, exports, and sanity-checks the model |
| `model/recovery_model.onnx` | Trained model (gitignored — regenerate, don't hand-edit) |
| `model/normalization.json` | `{featureOrder, mean, std}`, needed at inference time to normalize a new day the same way training data was normalized (gitignored) |

## Using a real history instead of synthetic data

Once the app persists daily history, export it as JSON in the same shape as
`data/synthetic_history.json` — a list of
`{date, hrvMs, rhrBpm, sleepMinutes, activeZoneMinutes}` — and run:

```bash
./venv/bin/python train_recovery_model.py --history /path/to/real_history.json
```

## Wiring into the app (not done yet)

1. Persist a daily snapshot of the four metrics (`localStorage`/IndexedDB) —
   this is the actual prerequisite, not the model.
2. Load `model/recovery_model.onnx` + `model/normalization.json` as static
   assets, lazily (only when the recovery panel is opened — `onnxruntime-web`
   adds a few hundred KB).
3. In the browser: normalize today's vector with the stored mean/std, run
   the ONNX session, compare input vs. reconstruction per feature, and show
   which metric drove the deviation — not just a single score.
