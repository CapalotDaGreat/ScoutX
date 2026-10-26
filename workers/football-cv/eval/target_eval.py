"""Evaluate a scoutx_tracker run against sparse target annotations.

Annotation file (labels.json): {"<source seconds>": label}
  "<k>!"   candidate k (1-based, from candidates.json at that moment) is certainly the target
  "<k>~"   candidate k is the target with high but not certain confidence (appearance)
  "0"      the target is not visible in this frame (verified)
  "?"      annotator cannot tell              -> excluded
  "small"  all candidates too small to judge  -> excluded
  "camera" camera not showing play            -> any target claim is a false attribution
candidates.json: {"candidates": {"<t>": {"frame": g, "boxes": [[x1,y1,x2,y2], ...]}}}

Metrics (frames with a decidable label only):
  claim precision  = correct claims / all claims (claim = CONFIRMED_VISIBLE or LIKELY_VISIBLE)
  recall           = correct claims / labelled target-visible frames
  false attribution= claims on the wrong person or where the target is not visible
Held-out split: labels farther than `--holdout-sec` from any user answer (feedback.json).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

CLAIM = ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")


def iou(a, b) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def evaluate(run_dir: str, labels: dict, candidates: dict, feedback: dict | None = None,
             holdout_sec: float = 10.0, include_likely_labels: bool = True) -> dict:
    z = np.load(Path(run_dir) / "timeline.npz", allow_pickle=False)
    times, boxes, states = z["times"], z["boxes"], z["states"]
    fb_times = [p[0] for p in (feedback or {}).get("yes", []) + (feedback or {}).get("no", [])]
    rows = []
    for t_str, lab in labels.items():
        if lab in ("?", "small"):
            continue
        if lab.endswith("~") and not include_likely_labels:
            continue
        t = float(t_str)
        g = int(np.argmin(np.abs(times - t)))
        st = str(states[g])
        claim = st in CLAIM
        if lab in ("0", "camera"):
            truth = None
        else:
            k = int(lab[:-1]) - 1
            truth = candidates["candidates"][t_str]["boxes"][k]
        correct = bool(claim and truth is not None and iou(boxes[g], truth) >= 0.5)
        heldout = all(abs(t - ft) > holdout_sec for ft in fb_times)
        rows.append({"t": t, "label": lab, "state": st, "claim": claim, "visible": truth is not None,
                     "correct": correct, "falseAttribution": claim and not correct, "heldout": heldout})

    def summary(sel):
        claims = [r for r in sel if r["claim"]]
        vis = [r for r in sel if r["visible"]]
        return {"labelled": len(sel), "targetVisible": len(vis), "claims": len(claims),
                "correct": int(sum(r["correct"] for r in sel)),
                "falseAttributions": int(sum(r["falseAttribution"] for r in sel)),
                "precision": round(sum(r["correct"] for r in claims) / len(claims), 3) if claims else None,
                "recall": round(sum(r["correct"] for r in vis) / len(vis), 3) if vis else None}

    return {"all": summary(rows), "heldout": summary([r for r in rows if r["heldout"]]),
            "certainOnly": summary([r for r in rows if r["label"].endswith("!") or not r["visible"]]),
            "rows": rows}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--candidates", required=True)
    ap.add_argument("--feedback")
    ap.add_argument("--holdout-sec", type=float, default=10.0)
    a = ap.parse_args()
    fb = json.loads(Path(a.feedback).read_text()) if a.feedback and Path(a.feedback).exists() else None
    r = evaluate(a.run, json.loads(Path(a.labels).read_text()), json.loads(Path(a.candidates).read_text()), fb,
                 a.holdout_sec)
    print(json.dumps({k: v for k, v in r.items() if k != "rows"}, indent=2))
    for row in r["rows"]:
        if row["falseAttribution"] or (row["visible"] and not row["correct"]):
            print("  ", row)


if __name__ == "__main__":
    main()


def evaluate_numbers(run_dir: str, numbers: dict, meta: list, target: str) -> dict:
    """Certain labels from readable shirt numbers: numbers = {crop_id: "17"}, meta[crop_id] = {t, box}.
    A claim on a crop showing another number is a certain false attribution; a crop showing the
    target number must be claimed (recall)."""
    z = np.load(Path(run_dir) / "timeline.npz", allow_pickle=False)
    times, boxes, states = z["times"], z["boxes"], z["states"]
    out = {"targetCrops": 0, "targetClaimed": 0, "otherCrops": 0, "otherClaimed": 0, "rows": []}
    for cid, num in numbers.items():
        m = meta[int(cid)]
        g = int(np.argmin(np.abs(times - m["t"])))
        claimed = str(states[g]) in CLAIM and iou(boxes[g], m["box"]) >= 0.5
        if num == target:
            out["targetCrops"] += 1
            out["targetClaimed"] += int(claimed)
            # Claiming someone else while the target is in view is also a false attribution.
            out.setdefault("wrongPersonWhileTargetVisible", 0)
            out["wrongPersonWhileTargetVisible"] += int(str(states[g]) in CLAIM and not claimed)
        else:
            out["otherCrops"] += 1
            out["otherClaimed"] += int(claimed)
        out["rows"].append({"t": m["t"], "number": num, "claimed": claimed, "state": str(states[g])})
    out["falseAttributionRate"] = round(out["otherClaimed"] / out["otherCrops"], 3) if out["otherCrops"] else None
    out["recall"] = round(out["targetClaimed"] / out["targetCrops"], 3) if out["targetCrops"] else None
    return out
