"""Appearance features for players: body-region colour signatures and an optional CNN embedding.

No faces are modelled. The colour signature splits the person box into head / shirt / shorts /
socks bands and histograms each band over a small named colour palette with grass removed.
"""

from __future__ import annotations

import cv2
import numpy as np

# Named palette (index -> name). Chromatic hues come in a bright and a dark variant.
HUES = [("red", 0, 8), ("orange", 8, 20), ("yellow", 20, 35), ("green", 35, 80),
        ("sky", 80, 100), ("blue", 100, 125), ("purple", 125, 145), ("pink", 145, 170)]
PALETTE = ["black", "darkgrey", "lightgrey", "white"] + [f"{n}" for n, _, _ in HUES] + [f"dark_{n}" for n, _, _ in HUES]
NB = len(PALETTE)  # 20
REGIONS = [("head", 0.0, 0.16), ("shirt", 0.16, 0.50), ("shorts", 0.50, 0.68), ("socks", 0.68, 0.95)]
SIG_DIM = NB * len(REGIONS)

KIT_NAMES = {
    "orange": ["orange", "dark_orange"], "red": ["red", "dark_red"], "yellow": ["yellow"],
    "green": ["green", "dark_green"], "sky blue": ["sky"], "light blue": ["sky"], "blue": ["blue", "dark_blue"],
    "navy": ["dark_blue", "black"], "purple": ["purple", "dark_purple"], "pink": ["pink"],
    "white": ["white", "lightgrey"], "black": ["black"], "grey": ["darkgrey", "lightgrey"],
    "gray": ["darkgrey", "lightgrey"], "maroon": ["dark_red"],
}


def palette_index(hsv: np.ndarray) -> np.ndarray:
    """hsv: (..., 3) uint8 OpenCV HSV -> palette index (...,), -1 for grass."""
    h = hsv[..., 0].astype(np.int16)
    s = hsv[..., 1].astype(np.int16)
    v = hsv[..., 2].astype(np.int16)
    idx = np.full(h.shape, -1, dtype=np.int16)
    chroma = (s >= 50) & (v >= 50)
    for k, (_, lo, hi) in enumerate(HUES):
        sel = chroma & (h >= lo) & (h < hi)
        if k == 0:
            sel = chroma & ((h < hi) | (h >= 170))
        idx[sel & (v >= 130)] = 4 + k
        idx[sel & (v < 130)] = 4 + len(HUES) + k
    achro = ~chroma
    idx[achro & (v < 60)] = 0
    idx[achro & (v >= 60) & (v < 120)] = 1
    idx[achro & (v >= 120) & (v < 185)] = 2
    idx[achro & (v >= 185)] = 3
    grass = (h >= 33) & (h < 85) & (s >= 40) & (v >= 40)
    idx[grass] = -1
    return idx


def colour_signature(frame_bgr: np.ndarray, box: np.ndarray, max_h: int = 96) -> tuple[np.ndarray, float]:
    """Returns (signature SIG_DIM, L2-normalised Hellinger) and fraction of non-grass pixels."""
    H, W = frame_bgr.shape[:2]
    x1, y1, x2, y2 = [int(round(v)) for v in box]
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(W, x2), min(H, y2)
    if x2 - x1 < 4 or y2 - y1 < 8:
        return np.zeros(SIG_DIM, np.float32), 0.0
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.shape[0] > max_h:
        s = max_h / crop.shape[0]
        crop = cv2.resize(crop, (max(4, int(crop.shape[1] * s)), max_h), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    idx = palette_index(hsv)
    h, w = idx.shape
    # Central columns carry the body; edges are mostly background for running poses.
    c1, c2 = int(w * 0.15), max(int(w * 0.85), int(w * 0.15) + 1)
    parts, kept = [], 0
    for _, a, b in REGIONS:
        band = idx[int(h * a): max(int(h * b), int(h * a) + 1), c1:c2].ravel()
        band = band[band >= 0]
        kept += band.size
        hist = np.bincount(band, minlength=NB).astype(np.float32)
        hist /= max(hist.sum(), 1.0)
        parts.append(hist)
    sig = np.sqrt(np.concatenate(parts))
    n = float(np.linalg.norm(sig))
    return (sig / n if n > 0 else sig).astype(np.float32), kept / max(1, h * (c2 - c1))


def region_hist(sig: np.ndarray, region: str) -> np.ndarray:
    k = [r for r, _, _ in REGIONS].index(region)
    part = sig[k * NB:(k + 1) * NB] ** 2
    return part / max(part.sum(), 1e-9)


def kit_score(sig: np.ndarray, kit: str, region: str = "shirt") -> float:
    """Fraction of the region's non-grass pixels that fall in the named kit colour."""
    names = KIT_NAMES.get(kit.strip().lower())
    if not names:
        return 0.0
    part = region_hist(sig, region)
    return float(sum(part[PALETTE.index(n)] for n in names))


class DeepEmbedder:
    """Generic CNN embedding of a person crop (ImageNet-pretrained YOLO classifier backbone).
    Used only for re-linking the same player across tracklets inside one match."""

    def __init__(self, weights: str = "yolo11n-cls.pt", size: tuple[int, int] = (224, 96)) -> None:
        import torch  # noqa: PLC0415
        from ultralytics import YOLO  # noqa: PLC0415

        self.torch = torch
        model = YOLO(weights).model.eval()
        # Everything except the final classification head -> global pooled feature.
        self.body = model.model[:-1]
        head = model.model[-1]
        self.head_conv = head.conv
        self.pool = head.pool
        self.size = size  # (h, w)

    def __call__(self, frame_bgr: np.ndarray, boxes: np.ndarray) -> np.ndarray:
        torch = self.torch
        if len(boxes) == 0:
            return np.zeros((0, 1280), np.float32)
        H, W = frame_bgr.shape[:2]
        crops = []
        for x1, y1, x2, y2 in boxes:
            x1, y1, x2, y2 = int(max(0, x1)), int(max(0, y1)), int(min(W, x2)), int(min(H, y2))
            c = frame_bgr[y1:max(y2, y1 + 2), x1:max(x2, x1 + 2)]
            c = cv2.resize(c, (self.size[1], self.size[0]), interpolation=cv2.INTER_LINEAR)
            crops.append(c[:, :, ::-1])
        x = torch.from_numpy(np.stack(crops)).permute(0, 3, 1, 2).float() / 255.0
        with torch.no_grad():
            y = x
            for layer in self.body:
                y = layer(y)
            y = self.pool(self.head_conv(y)).flatten(1)
            y = torch.nn.functional.normalize(y, dim=1)
        return y.numpy().astype(np.float32)
