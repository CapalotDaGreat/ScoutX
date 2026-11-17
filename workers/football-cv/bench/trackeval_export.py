"""Selected-player evaluation export in MOTChallenge 2D-box format for TrackEval (MIT, JonathonLuiten/TrackEval).

What this measures, and what it does not:
- ONE object: the selected player (labels "T"). Sparse selected-player labels cannot support multi-object claims, so
  this is single-target HOTA/IDF1/MOTA over the labelled intervals, not a full multi-object evaluation.
- One sequence per labelled interval, 10 fps, frame k = k-th labelled sample in the interval (label times on the
  corrected basis are matched to the nearest prediction sample within 0.051 s, as in audit_claim_outcomes).
- Predictions are the engine's claim boxes (present and in the chosen states) with a single track id.
- Frames whose prediction box best matches a "?" (annotator unsure) label are dropped from both sides instead of being
  scored, and are counted in the manifest; abstention is "no prediction row", so it stays distinguishable from a
  missing sample (a missing sample raises).

  python3 bench/trackeval_export.py <timeline.npz> <out_dir> [--states CONFIRMED_VISIBLE,LIKELY_VISIBLE] [--stored-basis]
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]


def _iou(a, b) -> float:
    w = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    h = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - w * h
    return w * h / u if u > 0 else 0.0


def load_labels(stored: bool) -> dict:
    import sys
    sys.path[:0] = [str(ROOT / "bench"), str(ROOT)]
    import pp_bench
    gt = json.loads((ROOT / "bench/results/5.1/gt_img4809_intervals.json").read_text())
    if not stored:
        gt = pp_bench.apply_time_basis(gt, json.loads((ROOT / "bench/references/gt_time_basis_corrections.json").read_text()))
    return gt


def export(timeline: Path, out: Path, states: set[str], stored: bool = False) -> dict:
    gt = load_labels(stored)
    with np.load(timeline, allow_pickle=False) as z:
        times, sts, boxes, present = z["times"], z["states"].astype(str), z["boxes"], z["present"]
    out.mkdir(parents=True, exist_ok=True)
    seqmap, manifest = ["name"], {"timeline": str(timeline), "timelineSha256": hashlib.sha256(timeline.read_bytes()).hexdigest(),
                                  "states": sorted(states), "basis": "stored" if stored else "corrected", "sequences": {}}
    labelled = sorted(gt["frames"], key=lambda k: gt["times"][k])
    for n, (a, b) in enumerate(gt["intervals"]):
        keys = [k for k in labelled if a <= gt["times"][k] <= b]
        name = f"img4809-i{n}"
        seq = out / "gt" / name
        (seq / "gt").mkdir(parents=True, exist_ok=True)
        gt_rows, pr_rows, dropped_unsure, target_frames = [], [], 0, 0
        for f, k in enumerate(keys, start=1):
            t = gt["times"][k]
            j = int(np.argmin(np.abs(times - t)))
            if abs(times[j] - t) > 0.051:
                raise SystemExit(f"no prediction sample within 0.051 s of label t={t}")
            labels = gt["frames"][k]
            claim = present[j] and sts[j] in states
            pbox = [float(v) for v in boxes[j][:4]] if claim else None
            if pbox is not None:
                best = max(labels, key=lambda lb: _iou(pbox, lb["box"]), default=None)
                if best is not None and best["label"] == "?" and _iou(pbox, best["box"]) >= 0.5:
                    dropped_unsure += 1
                    continue
            for lb in labels:
                if lb["label"] == "T":
                    x1, y1, x2, y2 = lb["box"]
                    gt_rows.append(f"{f},1,{x1:.1f},{y1:.1f},{x2 - x1:.1f},{y2 - y1:.1f},1,1,1")
                    target_frames += 1
            if pbox is not None:
                x1, y1, x2, y2 = pbox
                pr_rows.append(f"{f},1,{x1:.1f},{y1:.1f},{x2 - x1:.1f},{y2 - y1:.1f},1,-1,-1,-1")
        (seq / "gt" / "gt.txt").write_text("\n".join(gt_rows) + ("\n" if gt_rows else ""))
        (seq / "seqinfo.ini").write_text(f"[Sequence]\nname={name}\nframeRate=10\nseqLength={len(keys)}\nimWidth=1920\nimHeight=1080\n")
        (out / "trackers" / "engine" / "data").mkdir(parents=True, exist_ok=True)
        (out / "trackers" / "engine" / "data" / f"{name}.txt").write_text("\n".join(pr_rows) + ("\n" if pr_rows else ""))
        seqmap.append(name)
        manifest["sequences"][name] = {"interval": [a, b], "labelledFrames": len(keys), "targetFrames": target_frames,
                                       "predictionRows": len(pr_rows), "droppedUnsure": dropped_unsure}
    (out / "seqmap.txt").write_text("\n".join(seqmap) + "\n")
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    return manifest


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("timeline", type=Path)
    ap.add_argument("out", type=Path)
    ap.add_argument("--states", default="CONFIRMED_VISIBLE,LIKELY_VISIBLE")
    ap.add_argument("--stored-basis", action="store_true")
    a = ap.parse_args()
    m = export(a.timeline, a.out, set(a.states.split(",")), a.stored_basis)
    print(json.dumps({k: v for k, v in m.items() if k != "sequences"}))
