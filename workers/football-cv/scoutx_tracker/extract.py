"""Stage 1 (expensive, run once): per-frame detection, camera motion and appearance features.

Everything later stages need is written to disk, so tracking, identity and stats can be
re-run in seconds without decoding the video again.

Output `<out>/detections.npz`:
  dets   (N, 7)  frame, t, x1, y1, x2, y2, score              (people)
  sigs   (N, 80) body-region colour signature per detection
  emb_idx (M,)   detection index for each CNN embedding
  embs   (M, 1280) float16 CNN embeddings (every 2nd frame, people >= 36 px tall)
  balls  (B, 7)  frame, t, x1, y1, x2, y2, score
  warps  (F, 7)  2x3 camera motion prev->cur (row-major) + quality
  cuts   (C,)    frames where a hard scene cut was detected
  times  (F,)    timestamp of every processed frame
`<out>/crops/<frame>_<det>.jpg` close-up person crops (>= 80 px) for jersey-number reading.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import cv2
import numpy as np

from .cmc import CameraMotion, scene_cut
from .features import SIG_DIM, DeepEmbedder, colour_signature

PERSON, BALL = 0, 32


class Detector:
    def __init__(self, weights: str = "yolo11n.pt", imgsz: int = 1280) -> None:
        from ultralytics import YOLO  # noqa: PLC0415

        self.model = YOLO(weights)
        self.imgsz = imgsz

    def __call__(self, frame: np.ndarray):
        r = self.model.predict(frame, imgsz=self.imgsz, classes=[PERSON, BALL], conf=0.05, verbose=False)[0]
        b = r.boxes.xyxy.cpu().numpy().astype(np.float32)
        c = r.boxes.cls.cpu().numpy().astype(int)
        s = r.boxes.conf.cpu().numpy().astype(np.float32)
        p = (c == PERSON) & (s >= 0.12)
        q = c == BALL
        return b[p], s[p], b[q], s[q]


def extract(video: str, out_dir: str, t0: float = 0.0, start: float = 0.0, end: float | None = None,
            stride: int = 1, imgsz: int = 1280, crop_min_h: int = 80, progress=None) -> dict:
    out = Path(out_dir)
    (out / "crops").mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(video)
    fps_src = cap.get(cv2.CAP_PROP_FPS) or 10.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = fps_src / stride
    k = -1
    if start > 0:
        k = int(round(start * fps_src)) - 1
        cap.set(cv2.CAP_PROP_POS_FRAMES, k + 1)
    det = Detector(imgsz=imgsz)
    emb = DeepEmbedder()
    cmc = CameraMotion()
    dets, sigs, embs, emb_idx, balls, warps, cuts, times = [], [], [], [], [], [], [], []
    prev_small = None
    fi = -1
    t_start = time.time()
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        k += 1
        if (k % stride) != 0:
            continue
        t = t0 + k / fps_src
        if end is not None and k / fps_src >= end:
            break
        fi += 1
        times.append(t)
        small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
        pb, ps, bb, bs = det(frame)
        if scene_cut(prev_small, small):
            cuts.append(fi)
            cmc.reset()
        prev_small = small
        warp, q = cmc.update(frame, pb[ps >= 0.3] if len(pb) else None)
        warps.append(np.r_[warp.ravel(), q])
        for b, s in zip(bb, bs):
            balls.append([fi, t, *b, s])
        base = len(dets)
        want_emb = []
        for i, (b, s) in enumerate(zip(pb, ps)):
            sig, _ = colour_signature(frame, b)
            dets.append([fi, t, *b, s])
            sigs.append(sig.astype(np.float16))
            h = b[3] - b[1]
            if fi % 2 == 0 and h >= 36 and s >= 0.25:
                want_emb.append(i)
            if fi % 2 == 0 and h >= crop_min_h and s >= 0.4:
                x1, y1, x2, y2 = (int(v) for v in b)
                pad = int(0.05 * h)
                crop = frame[max(0, y1 - pad): y2, max(0, x1 - pad): x2 + pad]
                if crop.size:
                    cv2.imwrite(str(out / "crops" / f"{fi:06d}_{base + i}.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
        if want_emb:
            E = emb(frame, pb[want_emb])
            for i, e in zip(want_emb, E):
                emb_idx.append(base + i)
                embs.append(e.astype(np.float16))
        if progress and fi % 100 == 0:
            progress(fi, t, time.time() - t_start)
    cap.release()
    np.savez_compressed(
        out / "detections.npz",
        dets=np.array(dets, np.float64).reshape(-1, 7), sigs=np.array(sigs, np.float16).reshape(-1, SIG_DIM),
        emb_idx=np.array(emb_idx, np.int64), embs=np.array(embs, np.float16).reshape(-1, 1280),
        balls=np.array(balls, np.float64).reshape(-1, 7), warps=np.array(warps, np.float64).reshape(-1, 7),
        cuts=np.array(cuts, np.int64), times=np.array(times, np.float64),
    )
    meta = {"video": os.path.abspath(video), "t0": t0, "start": start, "fps": fps, "frames": fi + 1,
            "width": width, "height": height, "seconds": round(time.time() - t_start, 1)}
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def main() -> None:
    ap = argparse.ArgumentParser(description="Stage 1: detections + features")
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--t0", type=float, default=0.0, help="match time of the video's first frame (s)")
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--stride", type=int, default=1)
    a = ap.parse_args()

    def prog(fi, t, el):
        print(f"frame {fi} t={t:.1f}s elapsed={el:.0f}s ({el / max(fi, 1):.2f}s/f)", flush=True)

    print(json.dumps(extract(a.video, a.out, a.t0, a.start, a.end, a.stride, progress=prog)))


if __name__ == "__main__":
    main()
