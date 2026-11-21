"""E9 synthetic jersey numbers (2026-11-21). Training data generator - no real footage, no faces.

Draws a simplified player (back or front view) on grass: shirt with folds and shading, a 1-2 digit number, shorts,
legs and a plain head shape. It then degrades the crop the way the measured failure looks: small pale digits
(~20-30 px), blur, distance, compression, night gain.

Each crop then goes through the ENGINE'S OWN localisation: `ocr.BANDS`, `ocr._maps` and `ocr._digit_box`. A sample is
kept only when the box the engine finds overlaps the true digit box, so the recogniser is fine-tuned on exactly the
binarised 64-px patches it sees at run time, never on clean renders.

    python -m bench.e9.synth --fonts FONT_DIR [FONT_DIR ...] --out data/e9_synth --n 200000 --seed 1

Fonts: pass directories of fonts whose licence allows this use (for example SIL OFL or Apache-2.0). The generator
records each font file's name and SHA-256 in `manifest.json` and never copies fonts. Output: PNG patches plus
`labels.jsonl` ({"file", "label", "kind", "font", "seed"}).
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from scoutx_tracker.ocr import BANDS, _digit_box, _maps

# Kit colours as BGR. Orange first: it is the measured failure (pale digits on an orange shirt).
SHIRTS = [(0, 110, 255), (20, 140, 250), (40, 40, 200), (200, 60, 20), (40, 40, 40), (240, 240, 240), (30, 160, 30),
          (140, 30, 120), (0, 200, 230), (120, 90, 40), (90, 90, 90), (200, 160, 60)]
NUMBER_INKS = [(245, 245, 245), (225, 235, 240), (205, 225, 235), (20, 20, 20), (90, 30, 10), (0, 200, 255)]


@dataclass
class Sample:
    crop: np.ndarray           # BGR person crop as stage 1 would save it
    label: str                 # "1".."99"
    digit_box: tuple           # true digit box (x1, y1, x2, y2) in crop pixels
    band: str                  # "shirt" or "shorts"


def fonts_in(dirs: list[str]) -> list[Path]:
    out: list[Path] = []
    for d in dirs:
        out += sorted(p for p in Path(d).rglob("*") if p.suffix.lower() in (".ttf", ".otf"))
    return out


def _fold_shading(h: int, w: int, rng: np.random.Generator) -> np.ndarray:
    x = np.linspace(0, 1, w)[None, :]
    y = np.linspace(0, 1, h)[:, None]
    g = 1.0 + 0.10 * np.sin(2 * np.pi * (rng.uniform(1, 3) * x + rng.uniform(0, 1)))
    g = g + 0.08 * np.sin(2 * np.pi * (rng.uniform(0.5, 2) * (x + y) + rng.uniform(0, 1)))
    g = g * (1.0 - rng.uniform(0, 0.25) * x if rng.random() < 0.5 else 1.0 - rng.uniform(0, 0.25) * (1 - x))
    return np.clip(g, 0.6, 1.3).astype(np.float32)


def _render_number(text: str, font: Path, px: int, ink: tuple, outline: tuple | None) -> np.ndarray:
    f = ImageFont.truetype(str(font), px)
    pad = px
    img = Image.new("RGBA", (px * 3 + pad, px * 2 + pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    kw = {"stroke_width": max(1, px // 14), "stroke_fill": outline[::-1] + (255,)} if outline else {}
    d.text((pad // 2, pad // 2), text, font=f, fill=ink[::-1] + (255,), **kw)
    a = np.asarray(img)
    ys, xs = np.nonzero(a[:, :, 3] > 0)
    if len(xs) == 0:
        return a[:1, :1]
    return a[ys.min(): ys.max() + 1, xs.min(): xs.max() + 1]


def make_sample(rng: np.random.Generator, fonts: list[Path], label: str | None = None) -> Sample:
    H = int(rng.integers(90, 230))                      # stage-1 crops are >= 80 px; targets read at 116-126 px
    W = max(30, int(H * rng.uniform(0.34, 0.5)))
    grass = np.array([rng.uniform(30, 70), rng.uniform(100, 160), rng.uniform(30, 70)], np.float32)
    img = np.ones((H, W, 3), np.float32) * grass + rng.normal(0, 6, (H, W, 3)).astype(np.float32)
    shirt = np.array(SHIRTS[0] if rng.random() < 0.35 else SHIRTS[int(rng.integers(len(SHIRTS)))], np.float32)
    shorts = np.array(SHIRTS[int(rng.integers(len(SHIRTS)))], np.float32)
    sx1, sx2 = int(W * rng.uniform(0.05, 0.15)), int(W * rng.uniform(0.85, 0.95))
    sy1, sy2 = int(H * rng.uniform(0.12, 0.17)), int(H * rng.uniform(0.47, 0.52))
    ty2 = int(H * rng.uniform(0.66, 0.72))
    cv2.circle(img, (W // 2, int(H * 0.07)), max(3, int(H * 0.06)), tuple(float(c) for c in rng.uniform(30, 200, 3)), -1)
    img[sy1:sy2, sx1:sx2] = shirt * _fold_shading(sy2 - sy1, sx2 - sx1, rng)[..., None]
    img[sy2:ty2, sx1 + 2: sx2 - 2] = shorts * _fold_shading(ty2 - sy2, sx2 - sx1 - 4, rng)[..., None]
    skin = rng.uniform(60, 220, 3).astype(np.float32)
    lw = max(2, W // 6)
    img[ty2:H, W // 2 - lw - 2: W // 2 - 2] = skin
    img[ty2:H, W // 2 + 2: W // 2 + lw + 2] = skin

    if label is None:
        label = str(int(rng.integers(1, 100)))
    on_shorts = rng.random() < 0.12
    band = "shorts" if on_shorts else "shirt"
    region = (sy2, ty2) if on_shorts else (sy1, sy2)
    dh = int((region[1] - region[0]) * (rng.uniform(0.25, 0.45) if on_shorts else rng.uniform(0.38, 0.62)))
    ink = NUMBER_INKS[int(rng.integers(len(NUMBER_INKS)))]
    if rng.random() < 0.4:                               # pale digit on orange: the measured failure
        ink = tuple(int(c) for c in np.clip(np.array(shirt) * 0.35 + 255 * 0.65, 0, 255))
    outline = tuple(int(c) for c in rng.uniform(0, 255, 3)) if rng.random() < 0.3 else None
    num = _render_number(label, fonts[int(rng.integers(len(fonts)))], max(8, int(dh * 1.25)), ink, outline)
    if num.shape[0] < 2:
        return make_sample(rng, fonts, label)
    sq = rng.uniform(0.7, 1.05)                         # body turn squeezes the number horizontally
    nh = max(6, dh)
    nw = max(4, int(num.shape[1] * nh / num.shape[0] * sq))
    if nw > (sx2 - sx1) * 0.9:
        nw = int((sx2 - sx1) * 0.9)
    num = cv2.resize(num, (nw, nh), interpolation=cv2.INTER_AREA)
    ang = rng.uniform(-8, 8)
    M = cv2.getRotationMatrix2D((nw / 2, nh / 2), ang, 1.0)
    num = cv2.warpAffine(num, M, (nw, nh), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    cx = int((sx1 + sx2) / 2 + rng.uniform(-0.08, 0.08) * W)
    cy = int((region[0] + region[1]) / 2 + rng.uniform(-0.1, 0.1) * (region[1] - region[0]))
    x1, y1 = max(0, cx - nw // 2), max(0, cy - nh // 2)
    x2, y2 = min(W, x1 + nw), min(H, y1 + nh)
    a = num[: y2 - y1, : x2 - x1, 3:4].astype(np.float32) / 255.0
    rgb = num[: y2 - y1, : x2 - x1, :3][..., ::-1].astype(np.float32)
    shade = _fold_shading(y2 - y1, x2 - x1, rng)[..., None]
    img[y1:y2, x1:x2] = img[y1:y2, x1:x2] * (1 - a) + rgb * shade * a
    ys, xs = np.nonzero(a[..., 0] > 0.5)
    box = (x1 + int(xs.min()), y1 + int(ys.min()), x1 + int(xs.max()) + 1, y1 + int(ys.max()) + 1) if len(xs) else (x1, y1, x2, y2)

    # Degradations: distance, blur, motion, night gain, sensor noise, compression
    img = np.clip(img, 0, 255).astype(np.uint8)
    if rng.random() < 0.7:
        s = rng.uniform(0.35, 0.8)
        small = cv2.resize(img, (max(8, int(W * s)), max(8, int(H * s))), interpolation=cv2.INTER_AREA)
        img = cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR)
    if rng.random() < 0.5:
        img = cv2.GaussianBlur(img, (0, 0), rng.uniform(0.4, 1.4))
    if rng.random() < 0.3:
        k = int(rng.integers(3, 8))
        ker = np.zeros((k, k), np.float32)
        ker[k // 2, :] = 1.0 / k
        M = cv2.getRotationMatrix2D((k / 2, k / 2), rng.uniform(0, 180), 1.0)
        img = cv2.filter2D(img, -1, cv2.warpAffine(ker, M, (k, k)))
    if rng.random() < 0.3:                               # night: dark, noisy, lifted blacks
        g = rng.uniform(0.35, 0.7)
        img = np.clip(img.astype(np.float32) * g + rng.uniform(5, 25) + rng.normal(0, 7, img.shape), 0, 255).astype(np.uint8)
    q = int(rng.integers(35, 92))
    img = cv2.imdecode(cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])[1], cv2.IMREAD_COLOR)
    return Sample(img, label, box, band)


def _iou(a, b) -> float:
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    inter = ix * iy
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / u if u > 0 else 0.0


def engine_patches(s: Sample, min_iou: float = 0.5) -> list[tuple[str, np.ndarray]]:
    """The binarised patches the engine would give PARSeq for this crop (NumberReader._candidates), keeping only
    those whose located box overlaps the true digits. A patch that covers one digit of "20" would teach "2"
    for "20", so it is dropped."""
    h = s.crop.shape[0]
    out = []
    for name, (a, b) in BANDS.items():
        if name != s.band:
            continue
        top = int(h * a)
        band = s.crop[top: int(h * b)]
        if band.shape[0] < 14 or band.shape[1] < 10:
            continue
        true = (s.digit_box[0], s.digit_box[1] - top, s.digit_box[2], s.digit_box[3] - top)
        seen = set()
        for kind, m in _maps(band).items():
            box = _digit_box(m)
            if box is None or box in seen or _iou(box, true) < min_iou:
                continue
            seen.add(box)
            x1, y1, x2, y2 = box
            pad = max(3, int(0.22 * (y2 - y1)))
            patch = m[max(0, y1 - pad): y2 + pad, max(0, x1 - pad): x2 + pad]
            img = ((1 - patch) * 255).astype(np.uint8)
            img = cv2.resize(img, (max(8, int(img.shape[1] * 64 / img.shape[0])), 64), interpolation=cv2.INTER_NEAREST)
            out.append((f"{name}:{kind}", cv2.cvtColor(img, cv2.COLOR_GRAY2RGB)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fonts", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=100000, help="crops to draw (kept patches are fewer)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--save-crops", type=int, default=0, help="also save the first N colour crops for inspection")
    a = ap.parse_args()
    fonts = fonts_in(a.fonts)
    if not fonts:
        print("no .ttf/.otf fonts found")
        return 2
    out = Path(a.out)
    (out / "patches").mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(a.seed)
    kept = drawn = 0
    with (out / "labels.jsonl").open("w") as fh:
        for i in range(a.n):
            s = make_sample(rng, fonts)
            drawn += 1
            if i < a.save_crops:
                (out / "crops").mkdir(exist_ok=True)
                cv2.imwrite(str(out / "crops" / f"{i:07d}_{s.label}.jpg"), s.crop)
            for kind, p in engine_patches(s):
                name = f"patches/{i:07d}_{kind.replace(':', '-')}.png"
                cv2.imwrite(str(out / name), p)
                fh.write(json.dumps({"file": name, "label": s.label, "kind": kind}) + "\n")
                kept += 1
    manifest = {"generator": "bench/e9/synth.py", "seed": a.seed, "cropsDrawn": drawn, "patchesKept": kept,
                "fonts": [{"file": f.name, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()} for f in fonts]}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(json.dumps({k: manifest[k] for k in ("cropsDrawn", "patchesKept")}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
