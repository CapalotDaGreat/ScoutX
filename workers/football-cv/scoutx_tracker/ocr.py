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


def enhance(crop: np.ndarray) -> np.ndarray:
    """4.1 pre-processing: 2x cubic upscale for crops under 220 px, then an unsharp mask.
    Measured on 71 developer-labelled number crops: 14 full-number reads vs 10 without it, no
    extra full-number errors (lone-digit partial reads are ignored downstream anyway)."""
    if crop.shape[0] < 220:
        crop = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(crop, (0, 0), 1.2)
    return cv2.addWeighted(crop, 1.6, blur, -0.6, 0)


class NumberReader:
    def __init__(self, min_conf: float = 0.9, enhance_crops: bool | None = None) -> None:
        import os  # noqa: PLC0415

        self.enhance = (os.environ.get("SCOUTX_OCR_ENHANCE", "0") == "1") if enhance_crops is None else enhance_crops
        import easyocr  # noqa: PLC0415
        from doctr.models import recognition_predictor  # noqa: PLC0415

        import torch  # noqa: PLC0415

        gpu = torch.cuda.is_available()
        self.parseq = recognition_predictor("parseq", pretrained=True)
        if gpu:  # 4.1: OCR on the GPU host too (both recognisers are torch models)
            try:
                self.parseq = self.parseq.cuda()
            except Exception:  # noqa: BLE001 - stays on CPU if the predictor cannot move
                pass
        self.easy = easyocr.Reader(["en"], gpu=gpu, verbose=False)
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
        return self._read(crop_bgr)

    def read_and_verify(self, crop_bgr: np.ndarray, number: str) -> tuple[str | None, float, str | None, float]:
        """5.1: `read` plus `target_roi_confidence` in ONE PARSeq batch (main-reader candidates and
        the three colour torso regions together): same results, one model call instead of two
        (-29 % PARSeq time measured). Returns (number, conf, where, weak_conf)."""
        rois = torso_rois(crop_bgr)
        extra: list = []
        num, conf, where = self._read(crop_bgr, extra_imgs=rois, extra_out=extra)
        weak = max((float(p) for t, p in extra if t.strip() == number), default=0.0)
        return num, conf, where, weak

    def _read(self, crop_bgr: np.ndarray, extra_imgs: list | None = None, extra_out: list | None = None):
        if self.enhance and crop_bgr.size:
            crop_bgr = enhance(crop_bgr)
        cands = self._candidates(crop_bgr)
        extra_imgs = extra_imgs or []
        if not cands:
            if extra_imgs and extra_out is not None:
                extra_out.extend(self.parseq(extra_imgs))
            return None, 0.0, None
        pq_all = self.parseq([img for _, img in cands] + list(extra_imgs))
        pq = pq_all[:len(cands)]
        if extra_out is not None:
            extra_out.extend(pq_all[len(cands):])
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


def torso_rois(crop: np.ndarray) -> list[np.ndarray]:
    """Three colour torso regions (no binarisation), height 64 - for target verification."""
    h, w = crop.shape[:2]
    out = []
    for ya, yb, xa, xb in ((0.12, 0.45, 0.15, 0.85), (0.15, 0.40, 0.20, 0.80), (0.10, 0.50, 0.10, 0.90)):
        t = crop[int(h * ya):int(h * yb), int(w * xa):int(w * xb)]
        if t.shape[0] < 6 or t.shape[1] < 6:
            continue
        t = cv2.resize(t, (max(8, int(t.shape[1] * 64 / t.shape[0])), 64), interpolation=cv2.INTER_CUBIC)
        out.append(cv2.cvtColor(t, cv2.COLOR_BGR2RGB))
    return out


def target_roi_confidence(reader: "NumberReader", crop: np.ndarray, number: str) -> float:
    """5.0 weak evidence for ONE known number: PARSeq on colour torso regions must read exactly
    `number`. Used only when the main reader abstains, and only ever as a reason to ASK the owner
    (never to confirm). Measured: 0 of 423 crops of other players / spectators gave the target
    "20" at >= 0.95 (IMG_4809, IMG_5105, IMG_4529); it recovers some blurred night-match prints the
    binarised reader cannot localise (low recall)."""
    rois = torso_rois(crop)
    if not rois:
        return 0.0
    return max((float(p) for t, p in reader.parseq(rois) if t.strip() == number), default=0.0)


# 5.2 open-set torso reading (night / no localisable digits): colour torso windows at several
# heights and widths, one PARSeq batch. Inside one crop the windows share pixels, so their
# agreement is NOT independent evidence: the result is at most ONE weak read per crop.
# NOT USED BY THE PIPELINE (measured, bench/results/5.2/night_ocr.json): on developer-labelled night
# crops (IMG_4529) it reads 6/9 legible numbers on the threshold-selection pieces and 1/5 on the
# held-out piece with 0 wrong reads (the main reader: 0/14) - but on daylight crops the main reader
# could not read, 3 of its 15 reads were clearly wrong digits and 3 more were numbers "read" on
# shirt fronts without a number. Integrating it would need a separate verification step first.
TORSO_GRID = [(ya, ya + hh, xa, 1.0 - xa) for hh in (0.25, 0.33) for ya in (0.08, 0.13, 0.18, 0.23) for xa in (0.15, 0.22)
              if ya + hh <= 0.62]


def torso_grid(crop: np.ndarray) -> list[np.ndarray]:
    h, w = crop.shape[:2]
    out = []
    for ya, yb, xa, xb in TORSO_GRID:
        t = crop[int(h * ya):int(h * yb), int(w * xa):int(w * xb)]
        if t.shape[0] < 6 or t.shape[1] < 6:
            continue
        t = cv2.resize(t, (max(8, int(t.shape[1] * 64 / t.shape[0])), 64), interpolation=cv2.INTER_CUBIC)
        out.append(cv2.cvtColor(t, cv2.COLOR_BGR2RGB))
    return out


def open_torso_read(reader: "NumberReader", crop: np.ndarray, min_conf: float = 0.99, conflict_conf: float = 0.9,
                    digits: int = 2) -> tuple[str | None, float]:
    """Weak, number-agnostic read of a crop: the most confident `digits`-digit string over the torso
    grid, if >= min_conf and no OTHER `digits`-digit string reaches conflict_conf. Never evidence on
    its own (see identity rules)."""
    rois = torso_grid(crop)
    if not rois:
        return None, 0.0
    best: dict[str, float] = {}
    for t, p in reader.parseq(rois):
        t = t.strip()
        if len(t) == digits and _DIGITS.match(t):
            best[t] = max(best.get(t, 0.0), float(p))
    if not best:
        return None, 0.0
    top = max(best, key=best.get)
    if best[top] < min_conf or any(v >= conflict_conf for k, v in best.items() if k != top):
        return None, 0.0
    return top, best[top]


_SHARED: "NumberReader | None" = None


def shared_reader() -> "NumberReader":
    """One reader per worker process (4.1): loading docTR + EasyOCR costs seconds and would
    otherwise be paid on every resolve, correction and discovery call."""
    global _SHARED
    if _SHARED is None:
        _SHARED = NumberReader()
    return _SHARED
