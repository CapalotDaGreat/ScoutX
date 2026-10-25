"""Offline-only interpolation experiment. Not a trained super-resolution model."""
from __future__ import annotations

import numpy as np
from PIL import Image

from app.identity import valid_read


class ConservativeScaleReader:
    def __init__(self, delegate):
        self.delegate = delegate

    @property
    def _reader(self):
        return self.delegate._reader

    @_reader.setter
    def _reader(self, value):
        self.delegate._reader = value

    def read(self, crop: np.ndarray) -> tuple[str | None, float]:
        # Resizing may not rescue crops rejected by the original pixel-size gate.
        if (crop.shape[0] < 24 or crop.shape[1] < 16 or crop.size > 3_000_000
                or crop.dtype != np.uint8 or not hasattr(self.delegate, '_reader')):
            return self.delegate.read(crop)
        original = self.delegate._reader
        tokens = set()
        class Proxy:
            def readtext(self, *args, **kwargs):
                rows = original.readtext(*args, **kwargs)
                tokens.update(str(text).strip() for _, text, confidence in rows
                              if valid_read(str(text).strip(), float(confidence)))
                return rows
        self.delegate._reader = Proxy()
        try:
            baseline = self.delegate.read(crop)
            resized = np.asarray(Image.fromarray(crop).resize((crop.shape[1]*2, crop.shape[0]*2),
                                                             Image.Resampling.BICUBIC))
            augmented = self.delegate.read(resized)
        finally:
            self.delegate._reader = original
        reads = [(n, c) for n, c in (baseline, augmented) if valid_read(n, c)]
        # Preserve conflicts hidden by the delegate's abstaining return value.
        if len(tokens) > 1 or not reads or len({n for n, _ in reads}) != 1:
            return None, 0.
        return reads[0][0], min(c for _, c in reads)
