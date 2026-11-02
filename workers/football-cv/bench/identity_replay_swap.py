"""Identity replay with one input swapped (5.3 CPU-divergence follow-up). Local, bench-only, no inference change.

    python bench/identity_replay_swap.py --base <run dir: stage1/chunk, stage1/ocr_cache.json> --base-validation <validation.json>
        --other <run dir> --other-validation <validation.json> --window gap1150 --variant {own,ocr,sightings,both} --out <dir>

Stage 1 (detections, crops, colour signatures) always comes from --base. The variant decides where the two stage-2
inputs come from:
  own        base OCR cache, base discovery sightings (must reproduce the base run - replay sanity check)
  ocr        OCR reads transferred from --other, base sightings
  sightings  base OCR cache, discovery sightings from --other
  both       both transferred
OCR transfer ("the reads the --other decode would give for these detections"): every base crop FILE (not only the
crops the base run happened to read - which crops get read depends on identity) is keyed by (frame, detection). Each
base detection is matched one-to-one (IoU >= 0.5, greedy per frame) to an --other detection. The base crop takes
  1. the --other run's cached read of that detection, else
  2. a fresh read of the --other run's own crop file of that detection (--other pixels, same reader), else
  3. read-with-no-text when no --other detection matches.
Counts of each case go to replay.json. The OCR cache starts empty, as in the original runs (a warm cache changes
which reads exist when tracklets are first split, and does not reproduce the run); reads are served by crop pixel
hash whenever the pipeline asks. With transferred OCR, a base crop without a transferred read raises.
Variants that keep the base OCR may read base crops the base run never selected (base pixels, e.g. because other
sightings focus refinement elsewhere); those new reads are counted.
Nothing here changes thresholds, safeguards or the identity solver.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))

CROP = re.compile(r"(\d+)_(\d+)\.jpg$")


def sightings_of(validation: str, window: str) -> list[dict]:
    v = json.loads(Path(validation).read_text())
    item = next(r for r in v["results"] if r["window"] == window)
    if item["sightings"] and "discoverySightings" not in item:
        raise ValueError("discovery sightings were not retained")
    return item.get("discoverySightings", [])


def transfer_ocr(base_dets: np.ndarray, base_cache: dict, base_crops: list[str], other_dets: np.ndarray,
                 other_cache: dict, other_crop_dir: Path, read) -> tuple[dict, dict]:
    import cv2  # noqa: PLC0415

    from compare_window_runs import match  # noqa: PLC0415

    other_read = {}
    for key, value in other_cache.items():
        m = CROP.search(key)
        other_read[int(m.group(2))] = value
    other_file = {int(CROP.search(p.name).group(2)): p for p in other_crop_dir.glob("*.jpg")}
    out, counts = {}, {"baseCropFiles": len(base_crops), "baseCachedCrops": len(base_cache), "fromOtherCache": 0,
                       "freshReadOfOtherCrop": 0, "withText": 0, "noMatchingDetection": 0,
                       "textChangedVsBaseCache": 0}
    by_frame = {}
    for key in base_crops:
        f, d = map(int, CROP.search(key).groups())
        by_frame.setdefault(f, []).append((key, d))
    for f, items in by_frame.items():
        oi = np.where(other_dets[:, 0] == f)[0]
        bd = [d for _, d in items]
        pairs, _, _ = match(base_dets[bd, 2:6], other_dets[oi, 2:6])
        to_other = {bd[i]: int(oi[j]) for i, j, _ in pairs}
        for key, d in items:
            o = to_other.get(d)
            if o is None or (o not in other_read and o not in other_file):
                new, kind = [None, 0.0, None], "noMatchingDetection"
            elif o in other_read:
                new, kind = list(other_read[o]), "fromOtherCache"
            else:
                img = cv2.imread(str(other_file[o]))
                new, kind = list(read(img) if img is not None else (None, 0.0, None)), "freshReadOfOtherCrop"
            counts[kind] += 1
            counts["withText"] += bool(new[0])
            if key in base_cache:
                counts["textChangedVsBaseCache"] += (new[0] or None) != (base_cache[key][0] or None)
            out[key] = new
    return out, counts


def trace(captured: dict, truth: dict, span, start: float, window: str) -> dict:
    """Read-only: which tracklets carry the target (IoU >= 0.5 to the corrected-basis target label), how they are
    linked at contacts, and what the identity solver decided for each (score before/after hard evidence, chosen,
    evidence label, excluded reason, owner question). Tracking association and identity assignment are reported
    separately."""
    import pp_bench  # noqa: PLC0415

    corr = pp_bench.apply_time_basis(truth, json.loads((HERE / "references" / "gt_time_basis_corrections.json").read_text()))
    tgt = {round(corr["times"][k] - start, 1): next(l["box"] for l in v if l["label"] == "T")
           for k, v in corr["frames"].items() if any(l["label"] == "T" for l in v)}
    T, res, summary = captured["T"], captured["passes"][-1], captured["summary"]
    R = T.rows
    k_of = {s["tid"]: k for k, s in enumerate(summary)}
    per_frame, tids = [], set()
    for f in sorted(set(R[:, 0].astype(int))):
        t = round(f / 10, 1)
        if not span[0] - 0.5 <= t <= span[1] + 0.5:
            continue
        ix = np.where(R[:, 0] == f)[0]
        tb = tgt.get(t)
        best = max(ix, key=lambda r: pp_bench.iou(R[r, 3:7], tb)) if tb is not None and len(ix) else None
        tid = int(R[best, 2]) if best is not None and pp_bench.iou(R[best, 3:7], tb) >= 0.5 else None
        per_frame.append({"frame": f, "t": t, "targetLabel": tb is not None, "targetTid": tid,
                          "targetDet": int(R[best, 8]) if tid is not None else None})
        if tid is not None:
            tids.add(tid)
    pieces = []
    for e in per_frame:
        if pieces and pieces[-1]["tid"] == e["targetTid"]:
            pieces[-1]["f1"] = e["frame"]
        else:
            pieces.append({"f0": e["frame"], "f1": e["frame"], "tid": e["targetTid"]})
    qs = {q["tid"]: q for q in res.questions}

    def dec(tid):
        k = k_of.get(tid)
        if k is None:
            return None
        s = summary[k]
        return {"tid": tid, "t0": round(s["t0"], 2), "t1": round(s["t1"], 2), "n": s["n"], "contactPiece": s["contact"],
                "kit1": round(s["kit1"], 3), "candidate": k in res.candidates, "chosen": k in res.chosen,
                "seed": k in res.seeds, "evidence": res.evidence.get(k), "score": res.score.get(k),
                "appearanceScore": res.appearance_score.get(k), "confirmed": k in res.confirmed,
                "excluded": res.excluded.get(k), "conflictTimes": res.conflict_times.get(k),
                "evidenceTimes": res.evidence_times.get(k), "reads": captured["reads"].get(tid, []),
                "ownerQuestion": {x: qs[tid][x] for x in ("score", "from", "to", "currentlyTarget") if x in qs[tid]}
                if tid in qs else None, "origin": T.origin.get(tid)}
    links = [dict(l) if isinstance(l, dict) else vars(l) for l in T.links]
    near = [l for l in links if l.get("pre") in tids or l.get("post") in tids
            or (span[0] - 1 <= float(l.get("t", -1)) <= span[1] + 1)]
    # the LAST assembly's events are the ones behind T.links; earlier assemblies (before number reads) are kept too
    events = captured.get("linkEvents", [])
    final_ids = {(l["pre"], l["post"], l["t"]) for l in links}
    for e in events:
        e["inFinalAssembly"] = all((x["pre"], x["post"], x["t"]) in final_ids for x in e["links"]) and bool(e["links"])
        e["targetPres"] = [p for p in e["pres"] if p in tids]
        e["targetPosts"] = [p for p in e["posts"] if p in tids]
    near_events = [e for e in events if e["inFinalAssembly"] and span[0] - 1 <= e["tEnd"] <= span[1] + 1]
    chosen = [summary[k]["tid"] for k in res.chosen]
    return {"window": window, "spanSec": list(span), "basis": "corrected (+0.1 s) label times, window-local",
            "targetPieces": pieces, "trackingTargetTids": sorted(tids),
            "identityDecisions": [dec(t) for t in sorted(tids)],
            "contactLinksNearTarget": near, "contactEventsNearTarget": near_events, "contactEvents": T.contact_events,
            "chosenTidsOverall": chosen, "solver": res.iterations[-1], "identityPasses": len(captured["passes"]),
            "note": "tracking association (targetPieces, links) is reported separately from identity assignment"}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ("--base", "--base-validation", "--other", "--other-validation", "--out"):
        ap.add_argument(name, required=True)
    ap.add_argument("--window", default="gap1150")
    ap.add_argument("--variant", choices=("own", "ocr", "sightings", "both"), required=True)
    ap.add_argument("--unseen-ocr", choices=("read", "blank"), default="read",
                    help="own-OCR variants: a crop the base run never read is read on base pixels (read, default) or "
                         "answered with no text (blank: the read set stays a subset of the base run's)")
    ap.add_argument("--trace", nargs=2, type=float, metavar=("T0", "T1"),
                    help="read-only trace of tracklets/links/identity decisions overlapping the target in [T0, T1] "
                         "window seconds (corrected label basis); writes trace.json")
    a = ap.parse_args(argv)

    import fp32_comparison as fc  # noqa: PLC0415
    import validate_identity_windows as viw  # noqa: PLC0415
    from scoutx_tracker import ocr  # noqa: PLC0415
    from scoutx_tracker.analyze import analyze  # noqa: PLC0415
    from scoutx_tracker.tracklets import load_runs  # noqa: PLC0415

    import hashlib  # noqa: PLC0415

    import cv2  # noqa: PLC0415

    original_read = ocr.NumberReader.read
    served, new_reads = [0], [0]

    out = Path(a.out)
    if out.exists():
        raise ValueError("output exists; replays use fresh directories")
    stage1 = out / "stage1"
    shutil.copytree(Path(a.base) / "stage1" / "chunk", stage1 / "chunk")   # fresh caches: no trackrows/ocr reused
    base_cache = json.loads((Path(a.base) / "stage1" / "ocr_cache.json").read_text())
    record = {"schema": "pitchproof.identity-replay-swap.v1", "variant": a.variant, "window": a.window,
              "base": a.base, "other": a.other, "productionApproval": False,
              "ocrCache": "cold (empty) as in the original runs; reads are served per crop when the pipeline asks"}
    crops = ["chunk/" + p.name for p in sorted((stage1 / "chunk" / "crops").glob("*.jpg"))]
    if a.variant in ("ocr", "both"):
        with np.load(Path(a.base) / "stage1/chunk/detections.npz", allow_pickle=False) as z:
            bdets = z["dets"].copy()
        with np.load(Path(a.other) / "stage1/chunk/detections.npz", allow_pickle=False) as z:
            odets = z["dets"].copy()
        other_cache = json.loads((Path(a.other) / "stage1" / "ocr_cache.json").read_text())
        reader = ocr.shared_reader()
        lookup_by_key, record["ocrTransfer"] = transfer_ocr(bdets, base_cache, crops, odets, other_cache,
                                                            Path(a.other) / "stage1/chunk/crops", reader.read)
    else:
        lookup_by_key = {k: v for k, v in base_cache.items()}
    # The pipeline hands the reader decoded crop pixels, not keys: serve by pixel hash of the base crop file.
    by_pixels = {}
    for key in crops:
        im = cv2.imread(str(stage1 / "chunk" / "crops" / Path(key).name))
        if key in lookup_by_key:
            by_pixels.setdefault(hashlib.sha256(im.tobytes()).hexdigest(), tuple(lookup_by_key[key]))
    transferred = a.variant in ("ocr", "both")

    def serve(self, image):
        v = by_pixels.get(hashlib.sha256(image.tobytes()).hexdigest())
        if v is not None:
            served[0] += 1
            return v
        if transferred:
            raise RuntimeError("replay must not run OCR on base pixels when OCR is transferred")
        new_reads[0] += 1            # a crop the original run never selected
        if a.unseen_ocr == "blank":
            return (None, 0.0, None)
        return original_read(self, image)    # base pixels, base reader
    ocr.NumberReader.read = serve
    sightings = sightings_of(a.other_validation if a.variant in ("sightings", "both") else a.base_validation, a.window)
    record["sightings"] = len(sightings)
    meta, truth = fc.fixture_truth(a.window)
    start = fc.WINDOWS[a.window][0]
    data = load_runs([str(stage1 / "chunk")])
    _, _, local = viw.window_local_time(data, truth, [], sightings, start)
    captured: dict = {}
    if a.trace:
        import scoutx_tracker.analyze as an  # noqa: PLC0415

        orig_ct, orig_ri = an.cached_tracklets, an.resolve_identity

        def ct(*args, **kw):
            captured["T"] = orig_ct(*args, **kw)
            return captured["T"]

        def ri(*args, **kw):
            res = orig_ri(*args, **kw)
            captured.setdefault("passes", []).append(res)
            captured["summary"], captured["reads"] = args[0], {k: list(v) for k, v in args[1].items()}
            return res
        an.cached_tracklets, an.resolve_identity = ct, ri
        import scoutx_tracker.crossings as cr  # noqa: PLC0415

        orig_le = cr._link_event
        captured["linkEvents"] = []

        def le(out_, pres, posts, cost, t_end, succ=None, small=False):   # read-only spy on the contact decision
            n0 = len(out_.links)
            orig_le(out_, pres, posts, cost, t_end, succ, small)
            captured["linkEvents"].append({
                "tEnd": round(float(t_end), 2), "pres": [int(p[0]) for p in pres], "posts": [int(p[0]) for p in posts],
                "cost": np.round(np.asarray(cost, float), 3).tolist(), "small": bool(small),
                "trackerSuccessor": {str(int(k)): (None if v is None else int(v)) for k, v in (succ or {}).items()},
                "links": [dict(vars(x)) for x in out_.links[n0:]]})
        cr._link_event = le
    analyze = __import__("scoutx_tracker.analyze", fromlist=["analyze"]).analyze
    report = analyze([str(stage1 / "chunk")], str(out / "automatic"), "20", "orange", kit2="white", anchors=[], D=data,
                     sightings=local, log=lambda m: print(m, flush=True))
    record["servedReads"], record["newBaseCropReads"] = served[0], new_reads[0]
    record["unseenOcr"] = a.unseen_ocr
    record["invariantsOk"] = report["invariants"]["ok"]
    record["identity"] = report["identity"]
    (out / "replay.json").write_text(json.dumps(record, indent=2, default=str))
    if a.trace:
        (out / "trace.json").write_text(json.dumps(trace(captured, truth, a.trace, start, a.window), indent=1, default=str))
    print(json.dumps({k: v for k, v in record.items() if k != "identity"}, default=str))
    return 0 if record["invariantsOk"] else 2


if __name__ == "__main__":
    sys.exit(main())
