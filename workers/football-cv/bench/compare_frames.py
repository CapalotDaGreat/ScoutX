"""Changed-frames report between two engine timelines on the IMG_4809 selected-player labels.

Every labelled interval frame gets one outcome per run:
  correct    claim (CONFIRMED/LIKELY) on the labelled target box (IoU >= 0.5)
  wrong      claim on a box labelled N (another player): a demonstrated wrong-player claim
  nolabel    claim that matches no labelled box while no target box is labelled (target hidden or not
             annotated; cannot be verified either way)
  unsure     claim on a "?" box (not scored)
  offtarget  claim that matches no labelled box while the target is labelled elsewhere
  abstain    no claim
States are reported with each outcome so CONFIRMED regressions stand out. Output: JSON with counts and every changed frame.
Usage: python bench/compare_frames.py BASE.npz CAND.npz OUT.json
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from trackeval_export import _iou, load_labels

CLAIM = {"CONFIRMED_VISIBLE", "LIKELY_VISIBLE"}


def outcomes(timeline: Path, gt: dict) -> dict[str, tuple[str, str]]:
    z = np.load(timeline)
    t, s, b, pr = z["times"], z["states"].astype(str), z["boxes"], z["present"]
    res = {}
    for k, labels in gt["frames"].items():
        tt = gt["times"][k]
        if not any(a <= tt <= e for a, e in gt["intervals"]):
            continue
        j = int(np.argmin(abs(t - tt)))
        if abs(t[j] - tt) > 0.051:
            raise SystemExit(f"{timeline}: no prediction sample within 0.05 s of {tt}")
        st = str(s[j])
        if not (pr[j] and st in CLAIM):
            res[k] = ("abstain", st)
            continue
        box = [float(x) for x in b[j][:4]]
        best = max(labels, key=lambda lab: _iou(box, lab["box"]), default=None)
        if best is None or _iou(box, best["box"]) < 0.5:
            has_t = any(lab["label"] == "T" for lab in labels)
            res[k] = ("offtarget" if has_t else "nolabel", st)
        else:
            res[k] = ({"T": "correct", "N": "wrong", "?": "unsure"}[best["label"]], st)
    return res


def compare(base: Path, cand: Path) -> dict:
    gt = load_labels(False)
    a, c = outcomes(base, gt), outcomes(cand, gt)
    changed = [{"t": round(gt["times"][k], 1), "base": list(a[k]), "cand": list(c[k])}
               for k in sorted(a, key=lambda k: gt["times"][k]) if a[k] != c[k]]
    trans = Counter(f"{x['base'][0]}->{x['cand'][0]}" for x in changed if x["base"][0] != x["cand"][0])
    newly_wrong_conf = [x for x in changed if x["cand"][0] == "wrong" and x["cand"][1] == "CONFIRMED_VISIBLE"]
    return {"base": str(base), "cand": str(cand), "frames": len(a),
            "baseCounts": dict(Counter(v[0] for v in a.values())), "candCounts": dict(Counter(v[0] for v in c.values())),
            "transitions": dict(trans.most_common()), "newConfirmedWrong": newly_wrong_conf, "changed": changed}


if __name__ == "__main__":
    r = compare(Path(sys.argv[1]), Path(sys.argv[2]))
    Path(sys.argv[3]).write_text(json.dumps(r, indent=1))
    print(json.dumps({k: r[k] for k in ("frames", "baseCounts", "candCounts", "transitions")}), "newConfirmedWrong", len(r["newConfirmedWrong"]))
