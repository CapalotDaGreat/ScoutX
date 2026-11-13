"""Profile and equivalence check of the per-frame camera-state block of stage 1 (2026-11-14 experiment E4).

    python bench/camera_state_profile.py --video V --start 900 --frames 600 --dets <stage1 chunk>/detections.npz --out prof.json

Decodes `--frames` frames once with OpenCV (the production `cv2` decoder) and runs, on the same decoded frames and
the same person boxes, (a) the production block (grass_fraction, the 160x90 HSV thumbnail, scene_cut, CameraMotion)
and (b) the candidate that computes the 160x90 INTER_AREA thumbnail once and reuses it for grass and scene cut.
Reports time per sub-step and whether grass, cuts and warps are bit-identical.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from scoutx_tracker.cmc import CameraMotion, scene_cut  # noqa: E402
from scoutx_tracker.periods import grass_fraction, grass_fraction_small  # noqa: E402


def run(frames, boxes_by_frame, shared: bool) -> dict:
    cmc = CameraMotion()
    prev_small = None
    grass, cuts, warps = [], [], []
    tm = {"thumbnail_and_grass": 0.0, "scene_cut": 0.0, "cmc": 0.0}
    for fi, frame in enumerate(frames):
        t = time.perf_counter()
        if shared:
            thumb = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
            grass.append(grass_fraction_small(thumb))
            small = cv2.cvtColor(thumb, cv2.COLOR_BGR2HSV)
        else:
            grass.append(grass_fraction(frame))
            small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
        tm["thumbnail_and_grass"] += time.perf_counter() - t
        t = time.perf_counter()
        if scene_cut(prev_small, small):
            cuts.append(fi)
            cmc.reset()
        prev_small = small
        tm["scene_cut"] += time.perf_counter() - t
        t = time.perf_counter()
        pb = boxes_by_frame.get(fi)
        warp, q = cmc.update(frame, pb)
        warps.append(np.r_[warp.ravel(), q])
        tm["cmc"] += time.perf_counter() - t
    w = np.array(warps)
    return {"secondsPerFrame": {k: round(v / len(frames) * 1000, 3) for k, v in tm.items()}, "msUnit": "ms per frame",
            "grassSha": hashlib.sha256(np.array(grass, np.float64).tobytes()).hexdigest(), "cuts": cuts,
            "warpsSha": hashlib.sha256(w.tobytes()).hexdigest()}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--frames", type=int, default=300)
    ap.add_argument("--dets", help="stage-1 detections.npz of the chunk that starts at --start (person boxes for the CMC mask)")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    cap = cv2.VideoCapture(a.video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 10.0
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(round(a.start * fps)))
    frames, t = [], time.perf_counter()
    while len(frames) < a.frames:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    decode = time.perf_counter() - t
    boxes: dict[int, np.ndarray] = {}
    if a.dets:
        d = np.load(a.dets)["dets"]
        for fi in range(len(frames)):
            sel = d[(d[:, 0] == fi) & (d[:, 6] >= 0.3)]
            boxes[fi] = sel[:, 2:6] if len(sel) else None
    base = run(frames, boxes, shared=False)
    cand = run(frames, boxes, shared=True)
    rec = {"schema": "pitchproof.camera-state-profile.v1", "video": Path(a.video).name, "startSec": a.start, "frames": len(frames),
           "decodeMsPerFrame": round(decode / max(1, len(frames)) * 1000, 3), "baseline": base, "sharedThumbnail": cand,
           "identical": {k: base[k] == cand[k] for k in ("grassSha", "cuts", "warpsSha")}}
    Path(a.out).write_text(json.dumps(rec, indent=1))
    print(json.dumps(rec, indent=1))
    return 0 if all(rec["identical"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())
