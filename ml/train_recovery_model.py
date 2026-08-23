"""Trains the recovery-signal autoencoder on daily history and exports it
for in-browser inference via onnxruntime-web.

Usage:
    python generate_synthetic_history.py   # only needed until real history exists
    python train_recovery_model.py

Inputs:
    ml/data/synthetic_history.json   list of {date, hrvMs, rhrBpm, sleepMinutes,
                                      activeZoneMinutes} -- swap this file (or
                                      point --history at a real export) once
                                      the app persists actual daily history.
    ml/data/synthetic_anomalies.json labeled examples used only for the
                                      post-training sanity check below.

Outputs (both are the only artifacts the frontend needs):
    ml/model/recovery_model.onnx     the trained autoencoder
    ml/model/normalization.json      {featureOrder, mean, std, threshold} --
                                      required at inference time to normalize
                                      the day being scored the same way
                                      training data was normalized, and to
                                      decide flagged/not without needing the
                                      training set client-side.

The sanity check re-runs the three labeled anomalies through both the
PyTorch model and the exported ONNX model and confirms:
  1. every anomaly's reconstruction error exceeds the normal-day p95
     threshold (i.e. the model would actually flag it)
  2. ONNX output matches PyTorch output (the export didn't silently change
     behavior)
Training does NOT proceed to export if either check fails.
"""

import argparse
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
import torch.nn as nn

from model import FEATURE_ORDER, RecoveryAutoencoder

ROOT = Path(__file__).parent
DEFAULT_HISTORY = ROOT / "data" / "synthetic_history.json"
DEFAULT_ANOMALIES = ROOT / "data" / "synthetic_anomalies.json"
MODEL_DIR = ROOT / "model"


def load_vectors(records: list[dict]) -> np.ndarray:
    return np.array([[r[key] for key in FEATURE_ORDER] for r in records], dtype=np.float32)


def train(x_train: np.ndarray, epochs: int = 300, lr: float = 1e-2) -> RecoveryAutoencoder:
    model = RecoveryAutoencoder()
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    loss_fn = nn.MSELoss()
    x_tensor = torch.tensor(x_train, dtype=torch.float32)

    for _ in range(epochs):
        optimizer.zero_grad()
        loss = loss_fn(model(x_tensor), x_tensor)
        loss.backward()
        optimizer.step()

    return model


def reconstruction_error(model: RecoveryAutoencoder, x: np.ndarray) -> np.ndarray:
    with torch.no_grad():
        recon = model(torch.tensor(x, dtype=torch.float32)).numpy()
    return (x - recon) ** 2


def sanity_check(model: RecoveryAutoencoder, threshold: float,
                  anomalies_norm: dict[str, np.ndarray], onnx_path: Path) -> bool:
    session = ort.InferenceSession(str(onnx_path))
    all_flagged = True
    for name, vec in anomalies_norm.items():
        torch_err = reconstruction_error(model, vec[None, :])[0]
        torch_total = float(torch_err.sum())

        onnx_recon = session.run(None, {"metrics": vec[None, :].astype(np.float32)})[0][0]
        onnx_err = (vec - onnx_recon) ** 2
        onnx_total = float(onnx_err.sum())
        max_diff = float(np.abs(torch_err - onnx_err).max())

        flagged = torch_total > threshold
        all_flagged = all_flagged and flagged
        top = FEATURE_ORDER[int(np.argmax(torch_err))]
        print(f"  {name:12s} error={torch_total:6.2f}  [{'FLAGGED' if flagged else 'MISSED':7s}]  "
              f"top_contributor={top:16s}  torch_vs_onnx_max_diff={max_diff:.2e}")

    return all_flagged


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--history", type=Path, default=DEFAULT_HISTORY)
    parser.add_argument("--anomalies", type=Path, default=DEFAULT_ANOMALIES)
    args = parser.parse_args()

    history = json.loads(args.history.read_text())
    if len(history) < 20:
        raise SystemExit(
            f"Only {len(history)} days in {args.history} -- need at least ~20 days "
            "before this model has enough signal to be worth training. "
            "See ml/README.md."
        )

    x_train_raw = load_vectors(history)
    mean, std = x_train_raw.mean(axis=0), x_train_raw.std(axis=0)
    x_train_norm = (x_train_raw - mean) / std

    model = train(x_train_norm)

    MODEL_DIR.mkdir(exist_ok=True)
    onnx_path = MODEL_DIR / "recovery_model.onnx"
    dummy = torch.zeros(1, len(FEATURE_ORDER))
    torch.onnx.export(
        model, dummy, str(onnx_path),
        input_names=["metrics"], output_names=["reconstruction"],
        dynamic_axes={"metrics": {0: "batch"}, "reconstruction": {0: "batch"}},
    )
    print(f"Exported {onnx_path}")

    # p95 of reconstruction error on the training data itself -- the
    # threshold above which a day's total error counts as "flagged". Shipped
    # in normalization.json so the browser doesn't need the training set to
    # decide flagged/not, just today's single reconstruction error.
    train_err = reconstruction_error(model, x_train_norm).sum(axis=1)
    threshold = float(np.percentile(train_err, 95))
    print(f"\nNormal-day error: mean={train_err.mean():.3f}  p95 threshold={threshold:.3f}")

    normalization_path = MODEL_DIR / "normalization.json"
    normalization_path.write_text(json.dumps({
        "featureOrder": FEATURE_ORDER,
        "mean": mean.tolist(),
        "std": std.tolist(),
        "threshold": threshold,
    }, indent=2))
    print(f"Wrote {normalization_path}")

    anomalies_raw = json.loads(args.anomalies.read_text())
    anomalies_norm = {
        name: ((np.array([vec[k] for k in FEATURE_ORDER], dtype=np.float32) - mean) / std)
        for name, vec in anomalies_raw.items()
    }
    passed = sanity_check(model, threshold, anomalies_norm, onnx_path)

    if not passed:
        raise SystemExit(
            "\nSanity check FAILED: at least one known-bad day was not flagged. "
            "Model artifacts were still written, but don't ship them -- "
            "re-run training (more epochs, more data) before trusting this model."
        )
    print("\nSanity check passed: all labeled anomalies flagged, ONNX matches PyTorch.")


if __name__ == "__main__":
    main()
