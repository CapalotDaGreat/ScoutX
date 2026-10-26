"""Jersey / shorts number reading on close-up person crops.

1. Localise: inside the shirt (back/front) and shorts bands, build binary maps of pixels that
   could be digits - white-ish, dark, or strongly contrasting with the garment's own colour -
   and keep digit-shaped connected components aligned on one line.
2. Recognise: the tight, binarised crop goes to two independent recognisers (docTR PARSeq and
   EasyOCR's recogniser, digits only). A read counts only if it is 1-2 digits and either both
   agree or one is near-certain.
A crop yields at most one number; conflicting numbers make it abstain.
"""

from __future__ import annotations

import re

import cv2
import numpy as np

BANDS = {"shirt": (0.10, 0.52), "shorts": (0.46, 0.72)}
_DIGITS = re.compile(r"^[1-9]\d?$")


def _maps(band: np.ndarray) -> dict[str, np.ndarray]:
    hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV).astype(np.int16)
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    grass = (hsv[:, :, 0] >= 33) & (hsv[:, :, 0] < 85) & (s > 40)
    lab = cv2.cvtColor(band, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
    keep = ~grass.reshape(-1)
    garment = np.median(lab[keep], 0) if keep.sum() > 20 else np.median(lab, 0)
    dist = np.linalg.norm(lab - garment, axis=1).reshape(band.shape[:2])
    out = {
        "white": (s < 70) & (v > 150),
        "dark": v < 70,
        "contrast": dist > 48,
    }
    return {k: (m & ~grass).astype(np.uint8) for k, m in out.items()}


def _digit_box(mask: np.ndarray):
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    n, _, st, _ = cv2.connectedComponentsWithStats(mask)
    H, W = mask.shape
    keep = [i for i in range(1, n)
            if 0.2 * H <= st[i, 3] <= 0.8 * H and st[i, 2] <= 0.45 * W and st[i, 4] >= 10
            and st[i, 0] > 0.06 * W and st[i, 0] + st[i, 2] < 0.94 * W
            and 0.15 <= st[i, 2] / max(st[i, 3], 1) <= 1.2]
    if not keep:
        return None
    big = max(keep, key=lambda i: st[i, 4])
    cy, bh = st[big, 1] + st[big, 3] / 2, st[big, 3]
    keep = [i for i in keep if abs(st[i, 1] + st[i, 3] / 2 - cy) < 0.25 * bh + 3 and abs(st[i, 3] - bh) < 0.35 * bh + 2
            and abs(st[i, 0] - st[big, 0]) < 1.6 * bh]
    keep = sorted(keep, key=lambda i: st[i, 0])[:3]
    x1 = min(st[i, 0] for i in keep)
    y1 = min(st[i, 1] for i in keep)
    x2 = max(st[i, 0] + st[i, 2] for i in keep)
    y2 = max(st[i, 1] + st[i, 3] for i in keep)
    if y2 - y1 < 7:
        return None
    return x1, y1, x2, y2


class NumberReader:
    def __init__(self, min_conf: float = 0.9) -> None:
        import easyocr  # noqa: PLC0415
        from doctr.models import recognition_predictor  # noqa: PLC0415

        self.parseq = recognition_predictor("parseq", pretrained=True)
        self.easy = easyocr.Reader(["en"], gpu=False, verbose=False)
        self.min_conf = min_conf

    def _candidates(self, crop: np.ndarray) -> list[tuple[str, np.ndarray]]:
        h = crop.shape[0]
        out = []
        for name, (a, b) in BANDS.items():
            band = crop[int(h * a): int(h * b)]
            if band.shape[0] < 14 or band.shape[1] < 10:
                continue
            seen = set()
            for kind, m in _maps(band).items():
                box = _digit_box(m)
                if box is None or box in seen:
                    continue
                seen.add(box)
                x1, y1, x2, y2 = box
                pad = max(3, int(0.22 * (y2 - y1)))
                patch = m[max(0, y1 - pad): y2 + pad, max(0, x1 - pad): x2 + pad]
                img = ((1 - patch) * 255).astype(np.uint8)
                img = cv2.resize(img, (max(8, int(img.shape[1] * 64 / img.shape[0])), 64), interpolation=cv2.INTER_NEAREST)
                out.append((f"{name}:{kind}", cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)))
        return out

    def read(self, crop_bgr: np.ndarray) -> tuple[str | None, float, str | None]:
        """Returns (number, confidence, where) or (None, 0, None)."""
        cands = self._candidates(crop_bgr)
        if not cands:
            return None, 0.0, None
        pq = self.parseq([img for _, img in cands])
        votes: dict[str, tuple[float, str]] = {}
        for (where, img), (text, conf) in zip(cands, pq):
            text = text.strip()
            if not _DIGITS.match(text):
                continue
            e = self.easy.recognize(img, allowlist="0123456789", detail=1)
            etext, econf = (str(e[0][1]).strip(), float(e[0][2])) if e else ("", 0.0)
            score = 0.0
            if _DIGITS.match(text) and text == etext:
                score = max(conf, econf)
            elif _DIGITS.match(text) and conf >= 0.995 and len(text) == 2:
                score = conf * 0.95
            if score >= self.min_conf:
                if text not in votes or score > votes[text][0]:
                    votes[text] = (score, where)
        if not votes and crop_bgr.shape[0] >= 250:
            # Big close-up: shorts numbers are small and coloured; try full scene-text reading.
            h = crop_bgr.shape[0]
            band = crop_bgr[int(h * 0.44): int(h * 0.74)]
            for _, text, conf in self.easy.readtext(band[:, :, ::-1], allowlist="0123456789", detail=1,
                                                    text_threshold=0.5, low_text=0.3):
                text = str(text).strip()
                if _DIGITS.match(text) and float(conf) >= 0.95:
                    votes[text] = (float(conf), "shorts:scene")
        if len(votes) != 1:
            return None, 0.0, None
        (num, (conf, where)), = votes.items()
        return num, conf, where
