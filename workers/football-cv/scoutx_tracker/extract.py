"""Stage 1 (expensive, run once): per-frame detection, camera motion and appearance features.

Everything later stages need is written to disk, so tracking, identity and stats can be
re-run in seconds without decoding the video again.

Output `<out>/detections.npz`:
  dets   (N, 7)  frame, t, x1, y1, x2, y2, score              (people)
  sigs   (N, 80) body-region colour signature per detection
  emb_idx (M,)   detection index for each CNN embedding
  embs   (M, 256) float16 grid colour descriptors (every 2nd frame, people >= 36 px tall)
  balls  (B, 7)  frame, t, x1, y1, x2, y2, score
  warps  (F, 7)  2x3 camera motion prev->cur (row-major) + quality
  cuts   (C,)    frames where a hard scene cut was detected
  times  (F,)    timestamp of every processed frame
  grass  (F,)    share of pitch-green pixels (camera state)
`<out>/crops/<frame>_<det>.jpg` close-up person crops (>= 80 px) for jersey-number reading.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import time
from pathlib import Path

import cv2
import numpy as np

from .cmc import CameraMotion, scene_cut
from .features import EMB_DIM, SIG_DIM, GridEmbedder, colour_signature
from .periods import grass_fraction

PERSON, BALL = 0, 32


DETECTOR = os.environ.get("SCOUTX_DETECTOR", "yolox_s")
WEIGHTS_DIR = Path(os.environ.get("SCOUTX_WEIGHTS_DIR", Path.home() / ".cache" / "scoutx" / "weights"))
# Official YOLOX COCO weights (Apache-2.0), pinned by SHA-256.
WEIGHTS_SHA256 = {
    "yolox_tiny": "9de513de589ac98bb92d3bca53b5af7b9acfa9b0bacb831f7999d0f7afaee8f0",
    "yolox_s": "f55ded7181e1b0c13285c56e7790b8f0e8f8db590fe4edb37f0b7f345c913a30",
    "yolox_m": "60076992b32da82951c90cfa7bd6ab70eba9eda243e08b940a396f60ac2d19b6",
}


def weights_path(variant: str) -> Path:
    """Local weights for `variant`, downloaded once from the official release and hash-checked."""
    import hashlib  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415

    from .yolox_net import WEIGHTS_URL  # noqa: PLC0415

    path = WEIGHTS_DIR / f"{variant}.pth"
    if not path.exists():
        WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".part")
        urllib.request.urlretrieve(WEIGHTS_URL.format(name=variant), tmp)  # noqa: S310 - fixed https URL
        tmp.rename(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if WEIGHTS_SHA256.get(variant) and digest != WEIGHTS_SHA256[variant]:
        raise RuntimeError(f"{path} does not match the pinned SHA-256 for {variant}")
    return path


def _has_onnxruntime() -> bool:
    try:
        import onnxruntime  # noqa: F401, PLC0415
    except ImportError:
        return False
    return True


class Detector:
    """Person + ball detector. Default: YOLOX-s (Apache-2.0, self-contained network in
    yolox_net.py). The former Ultralytics YOLO11 (AGPL-3.0) is no longer used."""

    def __init__(self, variant: str = DETECTOR, imgsz: int = 1280) -> None:
        import torch  # noqa: PLC0415

        from .yolox_net import Detector as Yolox  # noqa: PLC0415

        backend = os.environ.get("SCOUTX_BACKEND", "auto")
        use_onnx = backend == "onnx" or (backend == "auto" and not torch.cuda.is_available() and _has_onnxruntime())
        if use_onnx:
            from .yolox_net import OnnxDetector  # noqa: PLC0415

            self.model = OnnxDetector(variant, weights_path(variant), imgsz)
        else:
            self.model = Yolox(variant, weights_path(variant), imgsz)
        self.name = self.model.name
        self.on_gpu = not use_onnx and torch.cuda.is_available()

    @staticmethod
    def _split(b, s, c):
        b = b.astype(np.float32)
        s = s.astype(np.float32)
        p = (c == PERSON) & (s >= 0.12)
        q = c == BALL
        return b[p], s[p], b[q], s[q]

    def __call__(self, frame: np.ndarray):
        return self._split(*self.model([frame], conf=0.05)[0])

    def batch(self, frames: list[np.ndarray]):
        """One forward pass for several frames (GPU throughput); same results as per-frame calls."""
        return [self._split(*r) for r in self.model(frames, conf=0.05)]


def extract(video: str, out_dir: str, t0: float = 0.0, start: float = 0.0, end: float | None = None,
            stride: int = 1, imgsz: int = 1280, crop_min_h: int = 80, progress=None,
            decoder: str = os.environ.get("SCOUTX_DECODER", "cv2"),
            batch: int = int(os.environ.get("SCOUTX_BATCH", "0"))) -> dict:
    out = Path(out_dir)
    (out / "crops").mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(video)
    fps_src = cap.get(cv2.CAP_PROP_FPS) or 10.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = fps_src / stride
    k = -1
    # 4.1: ffmpeg decodes multi-threaded (14.5 s vs 77 s for 120 s of 1080p on 2 vCPU) and can use
    # NVDEC on GPU hosts (SCOUTX_HWACCEL=cuda). It is opt-in (SCOUTX_DECODER=ffmpeg): for the 10-bit
    # HLG iPhone footage its colour conversion differs from OpenCV's by ~22 grey levels, and the
    # kit-colour model was calibrated on OpenCV frames - re-validate before switching the default.
    use_ffmpeg = decoder == "ffmpeg" and shutil.which("ffmpeg") is not None
    ff = None
    if use_ffmpeg:
        cap.release()
        from .discovery import ffmpeg_frames  # noqa: PLC0415

        ff = ffmpeg_frames(video, start, end if end is not None else 1e9, fps)
        k = int(round(start * fps_src / stride)) * stride - stride
    elif start > 0:
        k = int(round(start * fps_src)) - 1
        cap.set(cv2.CAP_PROP_POS_FRAMES, k + 1)
    det = Detector(imgsz=imgsz)
    emb = GridEmbedder()
    cmc = CameraMotion()
    dets, sigs, embs, emb_idx, balls, warps, cuts, times, grass = [], [], [], [], [], [], [], [], []
    prev_small = None
    fi = -1
    t_start = time.time()
    tm = {"decode": 0.0, "detect": 0.0, "scene_cmc": 0.0, "colour_signature": 0.0, "embedding": 0.0, "crops_io": 0.0}
    # 4.1 batched inference: frames are detected in batches (default 8 on CUDA, 1 on CPU where
    # batching gives no speed-up); everything after detection still runs frame by frame, in order.
    if batch <= 0:
        batch = 8 if det.on_gpu else 1
    pending: list[tuple[float, np.ndarray]] = []

    def run_batch() -> None:
        if not pending:
            return
        _tb = time.perf_counter()
        results = det.batch([f for _, f in pending])
        tm["detect"] += time.perf_counter() - _tb
        for (tt, fr), r in zip(pending, results):
            consume(tt, fr, *r)
        pending.clear()

    def consume(t, frame, pb, ps, bb, bs) -> None:
        nonlocal fi, prev_small
        fi += 1
        times.append(t)
        _t = time.perf_counter()
        grass.append(grass_fraction(frame))
        small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
        if scene_cut(prev_small, small):
            cuts.append(fi)
            cmc.reset()
        prev_small = small
        warp, q = cmc.update(frame, pb[ps >= 0.3] if len(pb) else None)
        warps.append(np.r_[warp.ravel(), q])
        tm["scene_cmc"] += time.perf_counter() - _t
        for b, s in zip(bb, bs):
            balls.append([fi, t, *b, s])
        base = len(dets)
        want_emb = []
        _t = time.perf_counter()
        _io = 0.0
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
                    _w = time.perf_counter()
                    cv2.imwrite(str(out / "crops" / f"{fi:06d}_{base + i}.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 92])
                    _io += time.perf_counter() - _w
        tm["colour_signature"] += time.perf_counter() - _t - _io
        tm["crops_io"] += _io
        _t = time.perf_counter()
        if want_emb:
            E = emb(frame, pb[want_emb])
            for i, e in zip(want_emb, E):
                emb_idx.append(base + i)
                embs.append(e.astype(np.float16))
        tm["embedding"] += time.perf_counter() - _t
        if progress and fi % 100 == 0:
            progress(fi, t, time.time() - t_start)

    while True:
        _t = time.perf_counter()
        if ff is not None:
            nxt = next(ff, None)
            ok, frame = (nxt is not None), (nxt[1] if nxt is not None else None)
            if ok:
                k += stride - 1
        else:
            ok, frame = cap.read()
        tm["decode"] += time.perf_counter() - _t
        if not ok:
            break
        k += 1
        if (k % stride) != 0:
            continue
        t = t0 + k / fps_src
        if end is not None and k / fps_src >= end:
            break
        pending.append((t, frame))
        if len(pending) >= batch:
            run_batch()
    run_batch()
    if ff is None:
        cap.release()
    np.savez_compressed(
        out / "detections.npz",
        dets=np.array(dets, np.float64).reshape(-1, 7), sigs=np.array(sigs, np.float16).reshape(-1, SIG_DIM),
        emb_idx=np.array(emb_idx, np.int64), embs=np.array(embs, np.float16).reshape(-1, EMB_DIM),
        balls=np.array(balls, np.float64).reshape(-1, 7), warps=np.array(warps, np.float64).reshape(-1, 7),
        cuts=np.array(cuts, np.int64), times=np.array(times, np.float64), grass=np.array(grass, np.float32),
    )
    meta = {"video": os.path.abspath(video), "detector": det.name, "t0": t0, "start": start, "fps": fps, "frames": fi + 1,
            "width": width, "height": height, "seconds": round(time.time() - t_start, 1),
            "stageSeconds": {k: round(v, 2) for k, v in tm.items()}}
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
