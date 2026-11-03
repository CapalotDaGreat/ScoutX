"""Whole-match numeric/text replay of the identity stage (5.3 full-match identity investigation). Bench-only.

    python bench/full_match_replay.py build --work WORK_DIR [--extra-reads OCR_CACHE ...] --out REPLAY_DIR
    python bench/full_match_replay.py run --replay REPLAY_DIR --out FRESH_DIR [--warm-cache OCR_CACHE] \
        [--dump-identity DUMP.json] [--compare TIMELINE.npz]

`build` keeps the numeric/text inputs of a finished bench/full_match_benchmark.py run (its --work-dir):
  * every stage-1 chunk's detections.npz and meta.json (whole match, all chunks, in order);
  * the crop NAMES per chunk (no images);
  * the OCR reads the run(s) obtained (ocr_cache.json, plus optional extra caches, e.g. the candidate run's), merged;
    conflicting reads for the same crop are refused;
  * the discovery sightings (discovery.json) and the original report timeline/result;
  * SHA-256 of every input in provenance.json.
No footage, crops or images.

`run` calls the real stage 2 exactly as full_match_benchmark.py does
(`analyze(chunk_dirs, out, "20", "orange", kit2="white", sightings=...)`) in a fresh directory:
  * the OCR cache starts EMPTY (as the original baseline run started), or as a copy of --warm-cache (the candidate
    run started from the baseline's final cache);
  * crop files are zero-byte placeholders; each crop the pipeline reads is answered with the read the original run(s)
    obtained for it; a crop never read before is answered with no text and counted (it would have needed real OCR);
  * tracking rows, contact/steal/exchange splits, the appearance model, the chain solver and the timeline all run
    unchanged on the whole match, so whole-match training membership, normalisation and solver constraints are real.
Boundary: OCR model inference and image decoding are not exercised; a behaviour change that needs new crops is only
approximated (those crops read as empty) - full-match runs with real OCR settle such cases.

--dump-identity records, for every identity-solver iteration: mode, positive/negative membership (by tracklet id),
per-candidate appearance score, reliability, duration, unary term and chain membership - for nonlocal analysis.
"""
from __future__ import annotations

import argparse
import hashlib
import inspect
import json
import shutil
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent))


def sha(p: Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def build(work: Path, extra_reads: list[Path], out: Path) -> dict:
    if out.exists():
        raise ValueError("replay output exists")
    chunks = sorted(p for p in (work / "stage1").iterdir() if p.is_dir() and p.name.startswith("c_") and ".tmp" not in p.name)
    (out / "chunks").mkdir(parents=True)
    crops = {}
    for c in chunks:
        d = out / "chunks" / c.name
        d.mkdir()
        for name in ("detections.npz", "meta.json"):
            shutil.copy2(c / name, d / name)
        crops[c.name] = sorted(p.name for p in (c / "crops").glob("*.jpg"))
    (out / "crops.json").write_text(json.dumps(crops))
    reads = json.loads((work / "stage1" / "ocr_cache.json").read_text())
    for extra in extra_reads:
        for k, v in json.loads(Path(extra).read_text()).items():
            if k in reads and reads[k] != v:
                raise ValueError(f"conflicting OCR reads for {k}")
            reads[k] = v
    (out / "ocr_reads.json").write_text(json.dumps(reads, sort_keys=True))
    disc = json.loads((work / "discovery.json").read_text())
    (out / "sightings.json").write_text(json.dumps(disc["sightings"]))
    for name in ("timeline.npz", "result.json"):
        if (work / "report" / name).exists():
            shutil.copy2(work / "report" / name, out / f"original_{name}")
    prov = {"schema": "pitchproof.full-match-replay.v1", "sourceWork": str(work),
            "extraReads": [str(p) for p in extra_reads], "discoveryFingerprint": disc.get("fingerprint"),
            "chunks": [c.name for c in chunks],
            "files": {str(p.relative_to(out)): sha(p) for p in sorted(out.rglob("*")) if p.is_file()}}
    (out / "provenance.json").write_text(json.dumps(prov, indent=1))
    return prov


def run(replay: Path, out: Path, warm_cache: Path | None = None, dump: Path | None = None,
        compare: Path | None = None) -> dict:
    import cv2  # noqa: PLC0415

    from scoutx_tracker import analyze as an  # noqa: PLC0415
    from scoutx_tracker import identity, ocr  # noqa: PLC0415

    if out.exists():
        raise ValueError("output exists; replays use fresh directories")
    prov = json.loads((replay / "provenance.json").read_text())
    for name, h in prov["files"].items():
        if sha(replay / name) != h:
            raise ValueError(f"replay input changed: {name}")
    stage = out / "stage1"
    crops = json.loads((replay / "crops.json").read_text())
    dirs = []
    for c in prov["chunks"]:
        d = stage / c
        (d / "crops").mkdir(parents=True)
        for name in ("detections.npz", "meta.json"):
            shutil.copy2(replay / "chunks" / c / name, d / name)
        for n in crops[c]:
            (d / "crops" / n).touch()
        dirs.append(str(d))
    if warm_cache:
        shutil.copy2(warm_cache, stage / "ocr_cache.json")
    reads = json.loads((replay / "ocr_reads.json").read_text())
    stats = {"served": 0, "neverReadInOriginal": [], "imageReads": 0}
    real_imread = cv2.imread

    def imread(path, *a, **k):
        p = Path(str(path))
        if p.parent.name == "crops" and p.parent.parent.parent == stage:
            stats["imageReads"] += 1
            return np.frombuffer(an.crop_key(str(p)).encode(), np.uint8).copy()
        return real_imread(path, *a, **k)

    class ServedReader:
        def read(self, img):
            key = bytes(img).decode()
            if key in reads:
                stats["served"] += 1
                return tuple(reads[key])
            stats["neverReadInOriginal"].append(key)
            return (None, 0.0, None)

    iters = []
    real_chain = identity._best_chain

    def chain(cands, unary, t0, t1, *a, **k):
        res = real_chain(cands, unary, t0, t1, *a, **k)
        if dump is not None:
            L = inspect.currentframe().f_back.f_locals
            tid = lambda i: int(L["summary"][i]["tid"])  # noqa: E731
            chosen = set(int(i) for i in res[0])
            iters.append({"mode": L.get("mode"), "positives": sorted(tid(i) for i in L["positives"]),
                          "negatives": sorted(tid(i) for i in L.get("negs", set())),
                          "candidates": {tid(i): {"t0": round(float(t0[i]), 2), "t1": round(float(t1[i]), 2),
                                                  "app": round(float(L["app"][i]), 4), "rel": round(float(L["rel"][i]), 4),
                                                  "dur": round(float(L["dur"][i]), 3), "unary": round(float(unary[i]), 4),
                                                  "chosen": int(i) in chosen} for i in cands}})
        return res

    cv2.imread = imread
    ocr.shared_reader = lambda: ServedReader()
    identity._best_chain = chain
    try:
        report = an.analyze(dirs, str(out / "report"), "20", "orange", kit2="white",
                            sightings=json.loads((replay / "sightings.json").read_text()), log=lambda m: None)
    finally:
        cv2.imread = real_imread
        identity._best_chain = real_chain
    rec = {"replay": str(replay), "warmCache": str(warm_cache) if warm_cache else None,
           "invariantsOk": report["invariants"]["ok"], "identityIterations": report.get("identity", {}).get("iterations"),
           "ocr": {**stats, "neverReadInOriginal": len(stats["neverReadInOriginal"])},
           "timelineSha256": sha(out / "report" / "timeline.npz")}
    if compare:
        with np.load(out / "report" / "timeline.npz", allow_pickle=False) as a, np.load(compare, allow_pickle=False) as b:
            rec["matches"] = {k: bool(np.array_equal(a[k], b[k])) for k in ("present", "states", "evidence")}
            rec["matches"]["boxesMaxAbs"] = float(np.abs(a["boxes"] - b["boxes"]).max())
            rec["matches"]["framesDiffering"] = int((a["states"] != b["states"]).sum() + (a["present"] != b["present"]).sum())
    if dump is not None:
        Path(dump).write_text(json.dumps(iters))
    (out / "replay_run.json").write_text(json.dumps(rec, indent=1))
    return rec


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--work", required=True)
    b.add_argument("--extra-reads", nargs="*", default=[])
    b.add_argument("--out", required=True)
    r = sub.add_parser("run")
    r.add_argument("--replay", required=True)
    r.add_argument("--out", required=True)
    r.add_argument("--warm-cache")
    r.add_argument("--dump-identity")
    r.add_argument("--compare")
    a = ap.parse_args(argv)
    if a.cmd == "build":
        print(json.dumps(build(Path(a.work), [Path(p) for p in a.extra_reads], Path(a.out))["chunks"]))
    else:
        print(json.dumps(run(Path(a.replay), Path(a.out), Path(a.warm_cache) if a.warm_cache else None,
                             Path(a.dump_identity) if a.dump_identity else None,
                             Path(a.compare) if a.compare else None), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
