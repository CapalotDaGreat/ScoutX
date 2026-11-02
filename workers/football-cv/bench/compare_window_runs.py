"""Compare two runs of the same evaluation window layer by layer (5.3 CPU-divergence audit).

    python bench/compare_window_runs.py --window gap1150 \
        --a linux=<dir with automatic/timeline.npz, automatic/result.json, stage1/*/detections.npz, meta.json> \
        --b windows=<same layout> [--a-decode a_probe.json --b-decode b_probe.json] \
        [--a-pixels a_precision_diagnostics.json] --out comparison.json

Reports, in pipeline order:
  decoding   - decoded-frame hash agreement (from decode_probe JSON or harness diagnostics), and whether a later
               probe reproduces the run's own saved hashes;
  detection  - per-frame counts, greedy one-to-one IoU>=0.5 matching (same pixel coordinate system: both runs
               store boxes in source-frame pixels), missed/extra boxes, score changes, threshold-crossing counts;
               near the target: the same on frames where the target label exists, restricted to boxes overlapping it;
  ocr        - per-tracklet accepted number reads (result.json numberReads) as (time, text) evidence, "20" counts;
  identity   - per-frame state agreement, intervals where one run claims and the other abstains, and the evidence
               label each run carried there;
  accuracy   - both runs under the stored AND the time-corrected label basis (never mixed), outcome partition with
               unmatched/indeterminate claims kept separate.
Numbers only; npz are read with allow_pickle=False. Nothing here decides causality: changed layers are listed in
order so the earliest divergence and its downstream associations can be read off.
"""
from __future__ import annotations

import argparse
import glob
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))
import pp_bench  # noqa: E402

DET_THRESHOLD = 0.12   # extract.Detector._split person threshold


def load_run(d: str) -> dict:
    p = Path(d)
    det = glob.glob(str(p / "stage1" / "*" / "detections.npz"))
    meta = glob.glob(str(p / "stage1" / "*" / "meta.json"))
    if not det or not meta:
        raise FileNotFoundError(f"{d}: stage1/*/detections.npz and meta.json required")
    with np.load(det[0], allow_pickle=False) as z:
        dets, times = z["dets"].copy(), z["times"].copy()
    with np.load(p / "automatic" / "timeline.npz", allow_pickle=False) as z:
        tl = {k: z[k].copy() for k in ("times", "present", "boxes", "states", "evidence")}
    return {"dir": str(p), "dets": dets, "frameTimes": times, "meta": json.loads(Path(meta[0]).read_text()),
            "timeline": tl, "result": json.loads((p / "automatic" / "result.json").read_text())}


def match(a: np.ndarray, b: np.ndarray, thr: float = 0.5):
    pairs = sorted(((pp_bench.iou(x, y), i, j) for i, x in enumerate(a) for j, y in enumerate(b)), reverse=True)
    ua, ub, m = set(), set(), []
    for v, i, j in pairs:
        if v < thr:
            break
        if i in ua or j in ub:
            continue
        ua.add(i)
        ub.add(j)
        m.append((i, j, v))
    return m, [i for i in range(len(a)) if i not in ua], [j for j in range(len(b)) if j not in ub]


def detection_layer(A: dict, B: dict, target_boxes: dict) -> dict:
    out = {"frames": 0, "a": 0, "b": 0, "matched": 0, "onlyA": 0, "onlyB": 0, "meanIoU": None,
           "scoreDeltaMean": None, "onlyANearThreshold": 0, "onlyBNearThreshold": 0,
           "targetFrames": 0, "targetMatched": 0, "targetOnlyA": 0, "targetOnlyB": 0, "framesWithChanges": []}
    ious, dscore = [], []
    fa = {round(float(t), 1): i for i, t in enumerate(A["frameTimes"])}
    fb = {round(float(t), 1): i for i, t in enumerate(B["frameTimes"])}
    for t in sorted(set(fa) & set(fb)):
        da = A["dets"][A["dets"][:, 0] == fa[t]]
        db = B["dets"][B["dets"][:, 0] == fb[t]]
        m, oa, ob = match(da[:, 2:6], db[:, 2:6])
        out["frames"] += 1
        out["a"] += len(da)
        out["b"] += len(db)
        out["matched"] += len(m)
        out["onlyA"] += len(oa)
        out["onlyB"] += len(ob)
        ious += [v for _, _, v in m]
        dscore += [float(db[j, 6] - da[i, 6]) for i, j, _ in m]
        out["onlyANearThreshold"] += int(sum(da[i, 6] < DET_THRESHOLD + 0.1 for i in oa))
        out["onlyBNearThreshold"] += int(sum(db[j, 6] < DET_THRESHOLD + 0.1 for j in ob))
        tb = target_boxes.get(t)
        if tb is not None:
            out["targetFrames"] += 1
            ta = [i for i in range(len(da)) if pp_bench.iou(da[i, 2:6], tb) >= 0.5]
            tbb = [j for j in range(len(db)) if pp_bench.iou(db[j, 2:6], tb) >= 0.5]
            out["targetMatched"] += bool(ta) and bool(tbb)
            out["targetOnlyA"] += bool(ta) and not tbb
            out["targetOnlyB"] += bool(tbb) and not ta
        if oa or ob:
            out["framesWithChanges"].append({"t": t, "onlyA": len(oa), "onlyB": len(ob)})
    out["meanIoU"] = round(float(np.mean(ious)), 4) if ious else None
    out["scoreDeltaMean"] = round(float(np.mean(dscore)), 4) if dscore else None
    out["framesWithChanges"] = out["framesWithChanges"][:300]
    return out


def ocr_layer(A: dict, B: dict) -> dict:
    def reads(run):
        out = []
        for tid, rs in run["result"].get("numberReads", {}).items():
            for f, num, conf, where in rs:
                out.append({"tid": int(tid), "frame": int(f), "number": str(num), "conf": round(float(conf), 4), "where": where})
        return out
    ra, rb = reads(A), reads(B)
    return {"acceptedReadsA": len(ra), "acceptedReadsB": len(rb),
            "numbersA": dict(Counter(r["number"] for r in ra).most_common()), "numbersB": dict(Counter(r["number"] for r in rb).most_common()),
            "target20A": [r for r in ra if r["number"] == "20"], "target20B": [r for r in rb if r["number"] == "20"],
            "sightingsA": A["result"].get("identity", {}).get("numberSightings"), "sightingsB": B["result"].get("identity", {}).get("numberSightings"),
            "note": "numberReads are accepted reads attached to tracklets (frame = window-local frame index); raw rejected reads are not in result.json"}


def identity_layer(A: dict, B: dict) -> dict:
    ta, tb = A["timeline"], B["timeline"]
    n = min(len(ta["times"]), len(tb["times"]))
    claim = lambda tl, i: bool(tl["present"][i]) and str(tl["states"][i]) in pp_bench.CLAIM  # noqa: E731
    intervals, cur = [], None
    for i in range(n):
        ca, cb = claim(ta, i), claim(tb, i)
        kind = "both" if ca and cb else "onlyA" if ca else "onlyB" if cb else "neither"
        if cur and cur["kind"] == kind:
            cur["t1"] = round(float(ta["times"][i]), 2)
            cur["frames"] += 1
            cur["evidenceA"][str(ta["evidence"][i])] += 1
            cur["evidenceB"][str(tb["evidence"][i])] += 1
        else:
            cur = {"kind": kind, "t0": round(float(ta["times"][i]), 2), "t1": round(float(ta["times"][i]), 2), "frames": 1,
                   "evidenceA": Counter([str(ta["evidence"][i])]), "evidenceB": Counter([str(tb["evidence"][i])])}
            intervals.append(cur)
    for c in intervals:
        c["evidenceA"], c["evidenceB"] = dict(c["evidenceA"]), dict(c["evidenceB"])
    states = Counter((str(ta["states"][i]), str(tb["states"][i])) for i in range(n))
    return {"frames": n, "stateAgreement": round(sum(v for (x, y), v in states.items() if x == y) / n, 4) if n else None,
            "statePairs": {f"{x}|{y}": v for (x, y), v in states.most_common()},
            "claimIntervals": [c for c in intervals if c["kind"] in ("onlyA", "onlyB")],
            "tracklets": {"A": len(A["result"].get("tracklets", [])), "B": len(B["result"].get("tracklets", []))}}


def accuracy_layer(run: dict, truth: dict, off: float) -> dict:
    from audit_claim_outcomes import classify_claim  # noqa: PLC0415

    tl = run["timeline"]
    c, ctv = Counter(), Counter()
    for key, labels in truth["frames"].items():
        t = truth["times"][key] - off
        i = int(np.argmin(np.abs(tl["times"] - t)))
        if abs(tl["times"][i] - t) > 0.051:
            c["noPrediction"] += 1
            continue
        cl = (str(tl["states"][i]), tl["boxes"][i].tolist()) if tl["present"][i] else None
        o = classify_claim(cl, labels)
        c[o] += 1
        if any(lab["label"] == "T" for lab in labels):
            ctv[o] += 1
    return {"allLabelledFrames": dict(c), "targetVisibleLabelledFrames": dict(ctv)}


def decode_layer(a_probe: dict | None, b_probe: dict | None, a_pixels: dict | None, b_pixels: dict | None) -> dict:
    out = {}
    if a_probe and b_probe:
        common = set(a_probe["hashes"]) & set(b_probe["hashes"])
        out["probeVsProbe"] = {"frames": len(common), "identical": sum(a_probe["hashes"][k] == b_probe["hashes"][k] for k in common),
                               "backends": [a_probe.get("backend"), b_probe.get("backend")], "cv2": [a_probe.get("cv2"), b_probe.get("cv2")]}
    for name, probe, pix in (("A", a_probe, a_pixels), ("B", b_probe, b_pixels)):
        if probe and pix:
            common = set(probe["hashes"]) & set(pix)
            out[f"probeReproducesRun{name}"] = {"frames": len(common), "identical": sum(probe["hashes"][k] == pix[k] for k in common)}
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--window", required=True)
    ap.add_argument("--a", required=True, help="name=dir")
    ap.add_argument("--b", required=True, help="name=dir")
    ap.add_argument("--a-decode")
    ap.add_argument("--b-decode")
    ap.add_argument("--a-pixels", help="harness precision_diagnostics.json of run A (decodedPixels)")
    ap.add_argument("--b-pixels")
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    import fp32_comparison as fc  # noqa: PLC0415

    (na, da), (nb, db) = (x.split("=", 1) for x in (args.a, args.b))
    A, B = load_run(da), load_run(db)
    _, truth = fc.fixture_truth(args.window)
    off = fc.WINDOWS[args.window][0]
    corr = pp_bench.apply_time_basis(truth, json.loads((HERE / "references" / "gt_time_basis_corrections.json").read_text()))
    jl = lambda p: json.loads(Path(p).read_text()) if p else None  # noqa: E731
    pix = lambda p: (jl(p) or {}).get("decodedPixels") if p else None  # noqa: E731
    # target boxes keyed by absolute source time (detections.npz times are absolute) under the corrected basis (labels are boxes in source pixels)
    tboxes = {round(corr["times"][k], 1): next(lab["box"] for lab in labs if lab["label"] == "T")
              for k, labs in corr["frames"].items() if any(lab["label"] == "T" for lab in labs)}
    res = {"schema": "pitchproof.window-run-comparison.v1", "window": args.window, "runs": {"A": na, "B": nb},
           "frameTimesEqual": bool(np.array_equal(np.round(A["frameTimes"], 2), np.round(B["frameTimes"], 2))),
           "metaA": A["meta"], "metaB": B["meta"],
           "decoding": decode_layer(jl(args.a_decode), jl(args.b_decode), pix(args.a_pixels), pix(args.b_pixels)),
           "detection": detection_layer(A, B, tboxes), "ocr": ocr_layer(A, B), "identity": identity_layer(A, B),
           "accuracy": {basis: {na: accuracy_layer(A, gt, off), nb: accuracy_layer(B, gt, off)}
                        for basis, gt in (("storedLabelTimes", truth), ("timeCorrected", corr))},
           "productionApproval": False}
    Path(args.out).write_text(json.dumps(res, indent=2, default=str))
    print(json.dumps({"frameTimesEqual": res["frameTimesEqual"], "decoding": res["decoding"],
                      "detection": {k: v for k, v in res["detection"].items() if k != "framesWithChanges"},
                      "identity": {k: res["identity"][k] for k in ("frames", "stateAgreement", "tracklets")},
                      "accuracy": res["accuracy"]}, indent=1, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())
