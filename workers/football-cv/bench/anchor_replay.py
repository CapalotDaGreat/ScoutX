"""Owner-tap replay over a saved full-match stage 1 (2026-11-14 experiment E3).

    python bench/anchor_replay.py --stage1 <work>/stage1 --discovery <work>/discovery.json --out <dir> \
        --ground-truth bench/results/5.1/gt_img4809_intervals.json --time-basis bench/references/gt_time_basis_corrections.json \
        [--tap-intervals 0,3,6] [--anchor T:X,Y ...]

Runs the resolve stage (scoutx_tracker.analyze) with "this is me" anchors and scores the timeline. A SIMULATED tap is
placed on the developer-labelled target box (centre x, 35 % of the box height) in the first labelled target frame of
each chosen interval whose target box overlaps no other labelled box (a clear review frame, as the app would show).
Simulated taps are perfect by construction; they measure what a correct answer can propagate, not tap usability.
Scoring is reported for all labelled intervals and for the intervals WITHOUT a tap, because a tap inside a scored
interval trivially explains part of its own score. The OCR cache in the stage-1 directory is used as is: run every
variant on a copy of the SAME cache state, or the comparison is not controlled.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# --source <football-cv tree>: run the resolve of ANOTHER frozen source (e.g. the release baseline) with this scorer.
_SRC = sys.argv[sys.argv.index("--source") + 1] if "--source" in sys.argv else str(HERE.parent)
sys.path.insert(0, _SRC)
sys.path.insert(1, str(HERE))

import pp_bench  # noqa: E402
from audit_claim_outcomes import audit  # noqa: E402


def clear_tap(gt: dict, interval: tuple[float, float]) -> tuple[float, float, float] | None:
    for k in sorted(gt["frames"], key=lambda k: float(gt["times"][k])):
        t = float(gt["times"][k])
        if not (interval[0] <= t <= interval[1]):
            continue
        boxes = gt["frames"][k]
        tgt = [b for b in boxes if b["label"] == "T"]
        if len(tgt) != 1:
            continue
        x1, y1, x2, y2 = tgt[0]["box"]
        if any(b is not tgt[0] and pp_bench.iou(b["box"], tgt[0]["box"]) > 0.0 for b in boxes):
            continue
        if (y2 - y1) < 80:
            continue
        return (round(t, 2), round((x1 + x2) / 2, 1), round(y1 + 0.35 * (y2 - y1), 1))
    return None


def restrict(gt: dict, keep) -> dict:
    out = copy.deepcopy(gt)
    out["frames"] = {k: v for k, v in gt["frames"].items() if keep(float(gt["times"][k]))}
    out["times"] = {k: gt["times"][k] for k in out["frames"]}
    return out


def score(timeline: Path, claims: list, gt: dict) -> dict:
    acc = pp_bench.accuracy(claims, gt, (1920, 1080))
    return {"accuracy": {k: v for k, v in acc.items() if k != "wrongIdentityTimes"},
            "wrongIdentityTimes": acc.get("wrongIdentityTimes"), "outcomes": audit(timeline, gt)}


def main() -> int:
    import numpy as np  # noqa: PLC0415

    from scoutx_tracker.analyze import analyze  # noqa: PLC0415

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage1", required=True)
    ap.add_argument("--discovery", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ground-truth", required=True)
    ap.add_argument("--time-basis")
    ap.add_argument("--number", default="20")
    ap.add_argument("--kit", default="orange")
    ap.add_argument("--kit2", default="white")
    ap.add_argument("--tap-intervals", default="", help="comma-separated interval indices to place one simulated tap in")
    ap.add_argument("--anchor", action="append", default=[], help="explicit T:X,Y anchor (source seconds, pixels)")
    ap.add_argument("--source", help="football-cv tree whose scoutx_tracker runs the resolve (default: this tree)")
    a = ap.parse_args()
    gt_orig = json.loads(Path(a.ground_truth).read_text())
    gt = pp_bench.apply_time_basis(gt_orig, json.loads(Path(a.time_basis).read_text())) if a.time_basis else gt_orig
    intervals = [tuple(map(float, iv)) for iv in gt["intervals"]]
    taps, tapped = [], []
    for s in [x for x in a.tap_intervals.split(",") if x.strip()]:
        tap = clear_tap(gt, intervals[int(s)])
        if tap is None:
            print(f"interval {s}: no clear labelled target frame for a tap")
            continue
        taps.append(tap)
        tapped.append(int(s))
    for spec in a.anchor:
        t, xy = spec.split(":")
        x, y = xy.split(",")
        taps.append((float(t), float(x), float(y)))
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    disc = json.loads(Path(a.discovery).read_text())
    runs = sorted(str(p) for p in Path(a.stage1).glob("c_*"))
    report = analyze(runs, str(out / "report"), a.number, a.kit, kit2=a.kit2, anchors=taps or None,
                     sightings=disc["sightings"], log=print)
    timeline = out / "report" / "timeline.npz"
    with np.load(timeline, allow_pickle=False) as z:
        claims = [[round(float(z["times"][k]), 2), str(z["states"][k]), [round(float(v), 1) for v in z["boxes"][k]]]
                  for k in range(len(z["times"])) if z["present"][k]]
    untapped = [iv for i, iv in enumerate(intervals) if i not in tapped]
    rec = {
        "schema": "pitchproof.anchor-replay.v1", "resolveSource": _SRC, "taps": taps, "tappedIntervals": tapped,
        "tapKind": "simulated from developer labels (perfect answers)" if tapped else ("explicit" if taps else "none"),
        "anchorResolution": report.get("anchorResolution"),
        "coverage": report.get("coverage"), "identity": report.get("identity"),
        "invariantsOk": report.get("invariants", {}).get("ok"),
        "scores": {
            "allIntervals": {"storedBasis": score(timeline, claims, gt_orig), "correctedBasis": score(timeline, claims, gt)},
            "untappedIntervals": {"correctedBasis": score(timeline, claims, restrict(gt, lambda t: any(x <= t <= y for x, y in untapped)))},
        },
        "claimsFrames": len(claims),
    }
    (out / "anchor_replay.json").write_text(json.dumps(rec, indent=1, default=str))
    print(json.dumps({k: rec[k] for k in ("taps", "anchorResolution", "invariantsOk")}, default=str))
    print(json.dumps(rec["scores"]["untappedIntervals"]["correctedBasis"]["outcomes"], default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
