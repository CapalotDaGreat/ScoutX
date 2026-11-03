"""Score decoder runs of labelled IMG_4809 intervals (output of bench/decoder_interval_eval.py) per interval and
in aggregate, with the label time basis verified per interval. Bench-only.

    python bench/interval_scores.py --run default=DIR --run reference=DIR --video V --out scores.json

Per interval:
  * time basis: pp_bench.best_label_time_shift of ALL labelled boxes (geometry only, identity-independent) against
    the DEFAULT run's raw detections; the IMG_4809 correction record is used only where it covers the interval AND
    the check agrees; otherwise the stored basis is used and the disagreement is reported;
  * outcomes on stored and on the verified basis: correct / wrong-player / overlap-ambiguous / unmatched /
    '?'-label claims / abstained / no prediction, over target-labelled frames and over all labelled frames, plus
    confirmed vs likely of the correct ones;
  * frame sets between the first two runs (both / only A / only B / neither);
  * scenario descriptors from labels, default stage-1 output and native luma - never from candidate outcomes.
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


def load_timeline(d: Path) -> dict:
    with np.load(d / "automatic" / "timeline.npz", allow_pickle=False) as z:
        return {k: z[k].copy() for k in ("times", "present", "boxes", "states")}


def detections_lookup(d: Path):
    with np.load(d / "stage1" / "chunk" / "detections.npz", allow_pickle=False) as z:
        dets, times = z["dets"].copy(), z["times"].copy()
    by_t = {round(float(t), 1): dets[dets[:, 0] == i, 2:6] for i, t in enumerate(times)}
    return lambda t: by_t.get(round(t, 1))


def score(tl: dict, truth: dict, offset: float) -> dict:
    from audit_claim_outcomes import classify_claim  # noqa: PLC0415

    per = {}
    for key, labels in truth["frames"].items():
        t = truth["times"][key] - offset
        i = int(np.argmin(np.abs(tl["times"] - t)))
        if abs(tl["times"][i] - t) > 0.051:
            per[key] = ("noPrediction", None, any(x["label"] == "T" for x in labels))
            continue
        claim = (str(tl["states"][i]), tl["boxes"][i].tolist()) if tl["present"][i] else None
        per[key] = (classify_claim(claim, labels), str(tl["states"][i]), any(x["label"] == "T" for x in labels))
    tgt = Counter(o for o, _, t in per.values() if t)
    allc = Counter(o for o, _, _ in per.values())
    st = Counter(s for o, s, t in per.values() if t and o == "correctClaim")
    return {"targetLabelled": {"denominator": sum(tgt.values()), "scorable": sum(v for k, v in tgt.items() if k != "noPrediction"),
                               **dict(tgt)},
            "allLabelled": {"denominator": sum(allc.values()), **dict(allc)},
            "correctConfirmed": st.get("CONFIRMED_VISIBLE", 0), "correctLikely": st.get("LIKELY_VISIBLE", 0),
            "nonCorrectClaims": sorted([[k, round(truth["times"][k], 2), o, s] for k, (o, s, _) in per.items()
                                        if o not in ("correctClaim", "abstained", "noPrediction")], key=lambda r: int(r[0])),
            "_per": {k: o for k, (o, _, _) in per.items()}}


def apply_label_corrections(truth: dict, start: float, rec: dict, gt_path: Path) -> dict:
    """Return a copy of the interval truth with corrections applied. Each correction must match the original label
    exactly (source frame, index, label and box) and the file must be the one the corrections were made for."""
    import hashlib  # noqa: PLC0415

    want = rec["appliesTo"]["sha256"]
    if hashlib.sha256(Path(gt_path).read_bytes()).hexdigest() != want:
        raise ValueError("label corrections were made for a different label file")
    out = {**truth, "frames": {k: [dict(x) for x in v] for k, v in truth["frames"].items()}}
    for c in rec["corrections"]:
        local = str(int(c["sourceFrame"]) - int(round(start * 10)))
        if local not in out["frames"]:
            continue
        lab = out["frames"][local][c["labelIndex"]]
        if lab["label"] != c["from"] or any(abs(a - b) > 0.05 for a, b in zip(lab["box"], c["box"])):
            raise ValueError(f"correction {c['id']} does not match the original label")
        lab["label"] = c["to"]
    return out


def descriptors(truth: dict, default_dir: Path, video: str, start: float) -> dict:
    import hdr_reference as hr  # noqa: PLC0415

    hts = [lab["box"][3] - lab["box"][1] for labs in truth["frames"].values() for lab in labs if lab["label"] == "T"]
    labels = Counter(lab["label"] for labs in truth["frames"].values() for lab in labs)
    with np.load(default_dir / "stage1" / "chunk" / "detections.npz", allow_pickle=False) as z:
        warps, cuts, dets = z["warps"].copy(), z["cuts"].copy(), z["dets"].copy()
    motion = np.hypot(warps[:, 2], warps[:, 5])
    lum = [float(flat[: 1920 * 1080].mean()) for k, flat in hr.native_planes(video, int(start * 10), 300) if k % 10 == 0]
    h = dets[:, 5] - dets[:, 3]
    return {"labels": dict(labels), "targetLabelledFrames": sum(any(x["label"] == "T" for x in v) for v in truth["frames"].values()),
            "targetBoxHeightPx": {"median": round(float(np.median(hts)), 1), "p10": round(float(np.percentile(hts, 10)), 1)} if hts else None,
            "sceneCuts": int(len(cuts)), "cameraMotionPxPerFrame": {"median": round(float(np.median(motion)), 2),
                                                                    "p90": round(float(np.percentile(motion, 90)), 2)},
            "personDetectionsPerFrame": round(len(dets) / 300, 1), "shareDetectionsBelow90px": round(float((h < 90).mean()), 3),
            "nativeLumaCode10bit": {"mean": round(float(np.mean(lum)), 1), "min": round(float(np.min(lum)), 1),
                                    "max": round(float(np.max(lum)), 1)}}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", action="append", required=True, help="name=output dir of decoder_interval_eval.py")
    ap.add_argument("--video", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label-corrections", default=None,
                    help="label-corrections JSON (pitchproof.label-corrections.v1) applied ON TOP of the original labels; "
                         "the original label file is never modified and the default scores the original labels")
    a = ap.parse_args(argv)
    import pp_bench  # noqa: PLC0415
    from decoder_interval_eval import GT, interval_truth, key  # noqa: PLC0415

    runs = dict(r.split("=", 1) for r in a.run)
    names = list(runs)
    corr_rec = json.loads((HERE / "references" / "gt_time_basis_corrections.json").read_text())
    g = json.loads(GT.read_text())
    res = {"schema": "pitchproof.decoder-interval-scores.v1", "runs": runs, "intervals": {}, "productionApproval": False,
           "labels": {"file": GT.name, "corrections": None if not a.label_corrections else {
               "file": Path(a.label_corrections).name, "status": json.loads(Path(a.label_corrections).read_text()).get("status")}}}
    agg = {n: {b: Counter() for b in ("stored", "verified")} for n in names}
    for s, e in g["intervals"]:
        k = key(s)
        dirs = {n: Path(p) / k for n, p in runs.items()}
        if not all((d / "automatic" / "timeline.npz").exists() for d in dirs.values()):
            res["intervals"][k] = {"missing": [n for n, d in dirs.items() if not (d / "automatic" / "timeline.npz").exists()]}
            continue
        truth = interval_truth(s, e)
        if a.label_corrections:
            truth = apply_label_corrections(truth, s, json.loads(Path(a.label_corrections).read_text()), GT)
        boxes_by_t = {}
        for kk, labs in truth["frames"].items():
            boxes_by_t[truth["times"][kk]] = [lab["box"] for lab in labs]
        shift = pp_bench.best_label_time_shift(boxes_by_t, detections_lookup(dirs[names[0]]))
        best = max(shift, key=lambda x: shift[x]["medianIoU"])
        covered = any(a0 <= s and e <= a1 for c in corr_rec["corrections"] for a0, a1 in c["intervalsSec"])
        use_corr = covered and abs(best - 0.1) < 1e-9
        verified = pp_bench.apply_time_basis(truth, {**corr_rec, "corrections": [
            {**c, "intervalsSec": [[s, e]]} for c in corr_rec["corrections"]]}) if use_corr else truth
        item = {"intervalSec": [s, e], "timeBasisCheck": {str(x): v for x, v in shift.items()}, "bestShiftSec": best,
                "correctionRecordCovers": covered,
                "verifiedBasis": "corrected (+0.1 s)" if use_corr else "stored",
                "basisDisagreement": (covered and not use_corr) or (not covered and abs(best) > 1e-9),
                "descriptors": descriptors(truth, dirs[names[0]], a.video, s), "runs": {}}
        per = {}
        for n, d in dirs.items():
            tl = load_timeline(d)
            item["runs"][n] = {}
            for b, gt in (("stored", truth), ("verified", verified)):
                sc = score(tl, gt, s)
                per[(n, b)] = sc.pop("_per")
                item["runs"][n][b] = sc
                agg[n][b].update({f"target:{x}": v for x, v in sc["targetLabelled"].items()})
                agg[n][b].update({f"all:{x}": v for x, v in sc["allLabelled"].items()})
                agg[n][b].update({"correctConfirmed": sc["correctConfirmed"], "correctLikely": sc["correctLikely"]})
        if len(names) >= 2:
            A, B = names[:2]
            for b in ("stored", "verified"):
                tgt = [kk for kk in truth["frames"] if any(x["label"] == "T" for x in truth["frames"][kk])
                       and per[(A, b)][kk] != "noPrediction"]
                ok = lambda n, kk: per[(n, b)][kk] == "correctClaim"  # noqa: E731
                item.setdefault("frameSets", {})[b] = {
                    "both": sum(ok(A, kk) and ok(B, kk) for kk in tgt), f"only_{A}": sum(ok(A, kk) and not ok(B, kk) for kk in tgt),
                    f"only_{B}": sum(ok(B, kk) and not ok(A, kk) for kk in tgt), "neither": sum(not ok(A, kk) and not ok(B, kk) for kk in tgt)}
        res["intervals"][k] = item
    res["aggregate"] = {n: {b: dict(c) for b, c in v.items()} for n, v in agg.items()}
    Path(a.out).write_text(json.dumps(res, indent=1))
    for k, it in res["intervals"].items():
        if "missing" in it:
            print(k, "missing", it["missing"])
            continue
        print(k, "basis", it["verifiedBasis"], "best", it["bestShiftSec"], "disagree", it["basisDisagreement"])
        for n, r in it["runs"].items():
            v = r["verified"]
            print("   ", n, "target", {x: y for x, y in v["targetLabelled"].items()}, "| claims non-correct", len(v["nonCorrectClaims"]),
                  [c[2] for c in v["nonCorrectClaims"]][:8], "| conf/likely", v["correctConfirmed"], v["correctLikely"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
