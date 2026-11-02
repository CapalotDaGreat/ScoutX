"""Frame-level outcome sets for two runs of one window, with intervention membership (5.3 audit tooling).

    python bench/frame_sets.py --window gap1150 --a linux=<automatic dir> --b windows=<automatic dir> \
        [--intervention name=<automatic dir> ...] --out sets.json

For every labelled frame on BOTH label time bases (stored and the +0.1 s corrected record) it classifies each run's
claim with audit_claim_outcomes.classify_claim and reports, over target-labelled frames:
  correct in both / only A / only B / neither, the net difference, and for each intervention run which frames it
  gets correct (so recovery is read per frame, never from aggregate counts).
Frames whose label falls outside the run's timeline (the corrected endpoint) are 'noPrediction' and are listed, not
scored. Unmatched, '?'-label, wrong-player and overlap-ambiguous claims are listed per run and are never correct.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))


def outcomes(timeline: dict, truth: dict, offset: float) -> dict:
    from audit_claim_outcomes import classify_claim  # noqa: PLC0415

    out = {}
    for key, labels in truth["frames"].items():
        t = truth["times"][key] - offset
        i = int(np.argmin(np.abs(timeline["times"] - t)))
        if abs(timeline["times"][i] - t) > 0.051:
            o, state = "noPrediction", None
        else:
            claim = (str(timeline["states"][i]), timeline["boxes"][i].tolist()) if timeline["present"][i] else None
            o, state = classify_claim(claim, labels), str(timeline["states"][i])
        out[key] = {"outcome": o, "state": state, "timelineIndex": i,
                    "target": any(lab["label"] == "T" for lab in labels), "time": round(truth["times"][key], 2)}
    return out


def frame_sets(a: dict, b: dict, interventions: dict[str, dict]) -> dict:
    tgt = sorted((k for k in a if a[k]["target"]), key=int)
    scorable = [k for k in tgt if a[k]["outcome"] != "noPrediction" and b[k]["outcome"] != "noPrediction"]
    ok = lambda r, k: r[k]["outcome"] == "correctClaim"  # noqa: E731
    sets = {"both": [k for k in scorable if ok(a, k) and ok(b, k)], "onlyA": [k for k in scorable if ok(a, k) and not ok(b, k)],
            "onlyB": [k for k in scorable if ok(b, k) and not ok(a, k)], "neither": [k for k in scorable if not ok(a, k) and not ok(b, k)]}
    res = {"targetLabelled": len(tgt), "scorable": len(scorable),
           "notScorable": [{"frame": k, **a[k]} for k in tgt if k not in scorable],
           "counts": {n: len(v) for n, v in sets.items()}, "net": len(sets["onlyA"]) - len(sets["onlyB"]), "sets": sets,
           "outcomeCountsA": dict(Counter(a[k]["outcome"] for k in scorable)),
           "outcomeCountsB": dict(Counter(b[k]["outcome"] for k in scorable)),
           "nonCorrectClaimsAllLabelled": {
               run: [{"frame": k, **r[k]} for k in sorted(r, key=int)
                     if r[k]["outcome"] not in ("correctClaim", "abstained", "noPrediction")] for run, r in (("A", a), ("B", b))},
           "interventions": {}}
    for name, r in interventions.items():
        good = {k for k in scorable if ok(r, k)}
        res["interventions"][name] = {"correct": len(good),
                                      "onlyA_recovered": sorted(set(sets["onlyA"]) & good, key=int),
                                      "onlyB_kept": sorted(set(sets["onlyB"]) & good, key=int),
                                      "both_lost": sorted(set(sets["both"]) - good, key=int),
                                      "neither_gained": sorted(set(sets["neither"]) & good, key=int)}
    return res


def load(path: str) -> dict:
    with np.load(Path(path) / "timeline.npz", allow_pickle=False) as z:
        return {k: z[k].copy() for k in ("times", "present", "boxes", "states")}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--window", required=True)
    ap.add_argument("--a", required=True)
    ap.add_argument("--b", required=True)
    ap.add_argument("--intervention", action="append", default=[])
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    import fp32_comparison as fc  # noqa: PLC0415
    import pp_bench  # noqa: PLC0415

    _, truth = fc.fixture_truth(args.window)
    corr = pp_bench.apply_time_basis(truth, json.loads((HERE / "references" / "gt_time_basis_corrections.json").read_text()))
    off = fc.WINDOWS[args.window][0]
    (na, da), (nb, db) = (x.split("=", 1) for x in (args.a, args.b))
    inter = dict(x.split("=", 1) for x in args.intervention)
    out = {"schema": "pitchproof.frame-sets.v1", "window": args.window, "A": na, "B": nb, "productionApproval": False}
    for basis, gt in (("storedLabelTimes", truth), ("timeCorrected", corr)):
        A, B = outcomes(load(da), gt, off), outcomes(load(db), gt, off)
        out[basis] = frame_sets(A, B, {n: outcomes(load(p), gt, off) for n, p in inter.items()})
    Path(args.out).write_text(json.dumps(out, indent=1))
    for basis in ("storedLabelTimes", "timeCorrected"):
        r = out[basis]
        print(basis, "targetLabelled", r["targetLabelled"], "scorable", r["scorable"], r["counts"], "net", r["net"])
        for n, v in r["interventions"].items():
            print("  ", n, {k: (len(x) if isinstance(x, list) else x) for k, x in v.items()})
    return 0


if __name__ == "__main__":
    sys.exit(main())
