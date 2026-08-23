"""Shared model definition for the recovery-signal autoencoder.

Feature order must stay in sync with what the app extracts in parse.ts:
extractHrvMs, extractRestingHeartRateBpm, extractSleepMinutes,
extractActiveZoneMinutes. Any consumer (training, export, browser inference)
reads/writes vectors in this order.
"""

import torch.nn as nn

FEATURE_ORDER = ["hrvMs", "rhrBpm", "sleepMinutes", "activeZoneMinutes"]


class RecoveryAutoencoder(nn.Module):
    def __init__(self, n_features: int = len(FEATURE_ORDER), bottleneck: int = 2):
        super().__init__()
        self.encoder = nn.Sequential(
            nn.Linear(n_features, 3), nn.ReLU(),
            nn.Linear(3, bottleneck),
        )
        self.decoder = nn.Sequential(
            nn.Linear(bottleneck, 3), nn.ReLU(),
            nn.Linear(3, n_features),
        )

    def forward(self, x):
        return self.decoder(self.encoder(x))
