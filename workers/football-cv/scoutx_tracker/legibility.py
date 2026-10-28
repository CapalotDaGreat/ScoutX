"""5.1 legibility gate: skip number reading on crops where a shirt number cannot realistically be
read (too small, blurred, no digit-shaped marks), before any recogniser runs.

The features cost ~1 ms per crop (no model): box height, torso sharpness (variance of the
Laplacian on the torso resized to a fixed height), torso contrast, and the number of
digit-shaped candidate regions the binarised reader would send to its recognisers.
A skipped crop is never evidence of anything: an unread number is not a "different number".
Thresholds are chosen on logged discovery reads (bench/results/5.1/legibility_eval.json).
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Legibility:
    h: float              # crop height (px)
    sharp: float          # torso Laplacian variance at 64 px height
    contrast: float       # torso grey-level standard deviation
    candidates: int       # digit-shaped regions found by the reader's localiser


def torso(crop: np.ndarray) -> np.ndarray:
    h, w = crop.shape[:2]
    t = crop[int(h * 0.12):int(h * 0.50), int(w * 0.15):int(w * 0.85)]
    if t.size == 0:
        return t
    return cv2.resize(t, (max(8, int(t.shape[1] * 64 / max(t.shape[0], 1))), 64), interpolation=cv2.INTER_AREA)


def features(crop: np.ndarray, reader=None) -> Legibility:
    t = torso(crop)
    if t.size == 0:
        return Legibility(float(crop.shape[0]), 0.0, 0.0, 0)
    g = cv2.cvtColor(t, cv2.COLOR_BGR2GRAY)
    sharp = float(cv2.Laplacian(g, cv2.CV_32F).var())
    n = len(reader._candidates(crop)) if reader is not None and hasattr(reader, "_candidates") else -1
    return Legibility(float(crop.shape[0]), sharp, float(g.std()), n)


@dataclass
class Gate:
    """Read a crop only if it passes. Defaults: off (everything passes) until set from a benchmark."""
    min_h: float = 0.0
    min_sharp: float = 0.0
    min_contrast: float = 0.0
    weak_min_h: float = 0.0       # weak torso verification (expensive) needs at least this height ...
    weak_min_sharp: float = 0.0   # ... and this sharpness

    def main(self, f: Legibility) -> bool:
        return f.h >= self.min_h and f.sharp >= self.min_sharp and f.contrast >= self.min_contrast

    def weak(self, f: Legibility) -> bool:
        return f.h >= self.weak_min_h and f.sharp >= self.weak_min_sharp
