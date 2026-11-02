"""Compact numeric/text regression replay of the identity stage (5.3 wrong-player investigation). Bench-only.

    python bench/regression_replay.py build --run <interval dir> --validation <validation.json> --window i0225 \
        --start 225 --out <replay dir>
    python bench/regression_replay.py run --replay <replay dir> --out <fresh dir> [--expect]

`build` keeps only numeric/text inputs of a finished interval run: stage-1 `detections.npz` and `meta.json`, the list
of OCR crop NAMES (not images), the OCR results the run actually obtained (`ocr_cache.json`) and the retained
discovery sightings - plus their SHA-256 and the original timeline/result for comparison.

`run` re-executes the real stage 2 (`scoutx_tracker.analyze.analyze`: OCR crop selection, number-conflict splits,
contact/steal splits, identity solver, refinement passes, timeline) from those inputs in a fresh directory with an
EMPTY OCR cache, exactly as the original run started. Crop files are zero-byte placeholders; when the pipeline asks to
read a crop, the read the original run obtained for that crop is served (OCR models are never loaded). A crop the
original run never read is answered with no text and counted. Nothing in the pipeline is stubbed except image I/O
and the OCR model itself, so the replay exercises the actual tracking/identity logic under test.
"""
from __future__ import annotations

import argparse
import hashlib
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


def build(run: Path, validation: Path, window: str, start: float, out: Path) -> dict:
    if out.exists():
        raise ValueError("replay output exists")
    out.mkdir(parents=True)
    chunk = run / "stage1" / "chunk"
    for name in ("detections.npz", "meta.json"):
        shutil.copy2(chunk / name, out / name)
    crops = sorted(p.name for p in (chunk / "crops").glob("*.jpg"))
    (out / "crops.json").write_text(json.dumps(crops))
    shutil.copy2(run / "stage1" / "ocr_cache.json", out / "ocr_reads.json")
    v = json.loads(Path(validation).read_text())
    item = next(r for r in v["results"] if r["window"] == window)
    if item["sightings"] and "discoverySightings" not in item:
        raise ValueError("discovery sightings not retained")
    (out / "sightings.json").write_text(json.dumps(item.get("discoverySightings", [])))
    for name in ("timeline.npz", "result.json"):
        shutil.copy2(run / "automatic" / name, out / f"original_{name}")
    prov = {"schema": "pitchproof.regression-replay.v1", "window": window, "startSec": start, "sourceRun": str(run),
            "validation": str(validation), "environment": v.get("environment", {}).get("scoutxEnv"),
            "models": {k: f.get("sha256") for k, f in (v.get("models", {}).get("files") or {}).items()},
            "videoSha256": v.get("sourceSha256"),
            "files": {p.name: sha(p) for p in sorted(out.iterdir())}}
    (out / "provenance.json").write_text(json.dumps(prov, indent=1))
    return prov


def run(replay: Path, out: Path) -> dict:
    import cv2  # noqa: PLC0415

    from scoutx_tracker import analyze as an  # noqa: PLC0415
    from scoutx_tracker import ocr  # noqa: PLC0415
    from scoutx_tracker.tracklets import load_runs  # noqa: PLC0415
    import validate_identity_windows as viw  # noqa: PLC0415

    if out.exists():
        raise ValueError("output exists; replays use fresh directories")
    prov = json.loads((replay / "provenance.json").read_text())
    for name, h in prov["files"].items():
        if name != "provenance.json" and sha(replay / name) != h:
            raise ValueError(f"replay input changed: {name}")
    chunk = out / "stage1" / "chunk"
    (chunk / "crops").mkdir(parents=True)
    for name in ("detections.npz", "meta.json"):
        shutil.copy2(replay / name, chunk / name)
    for name in json.loads((replay / "crops.json").read_text()):
        (chunk / "crops" / name).touch()
    reads = json.loads((replay / "ocr_reads.json").read_text())
    stats = {"served": 0, "neverReadInOriginal": [], "imageReads": 0}
    real_imread = cv2.imread

    def imread(path, *a, **k):
        p = Path(str(path))
        if p.parent == chunk / "crops":
            stats["imageReads"] += 1
            return np.frombuffer(an.crop_key(str(p)).encode(), np.uint8).copy()   # carries the crop key only
        return real_imread(path, *a, **k)

    class ServedReader:
        def read(self, img):
            key = bytes(img).decode()
            if key in reads:
                stats["served"] += 1
                return tuple(reads[key])
            stats["neverReadInOriginal"].append(key)
            return (None, 0.0, None)

    cv2.imread = imread
    ocr.shared_reader = lambda: ServedReader()
    try:
        data = load_runs([str(chunk)])
        _, _, local = viw.window_local_time(data, {"frames": {}, "times": {}}, [], json.loads((replay / "sightings.json").read_text()),
                                            prov["startSec"])
        report = an.analyze([str(chunk)], str(out / "automatic"), "20", "orange", kit2="white", anchors=[], D=data,
                            sightings=local, log=lambda m: None)
    finally:
        cv2.imread = real_imread
    with np.load(out / "automatic" / "timeline.npz", allow_pickle=False) as a, \
            np.load(replay / "original_timeline.npz", allow_pickle=False) as b:
        same = {k: bool(np.array_equal(a[k], b[k])) for k in ("present", "states", "evidence", "segment")}
        same["boxesMaxAbs"] = float(np.abs(a["boxes"] - b["boxes"]).max())
    rec = {"replay": str(replay), "invariantsOk": report["invariants"]["ok"], "ocr": {**stats,
           "neverReadInOriginal": len(stats["neverReadInOriginal"])}, "matchesOriginal": same}
    (out / "replay_run.json").write_text(json.dumps(rec, indent=1))
    return rec


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--run", required=True)
    b.add_argument("--validation", required=True)
    b.add_argument("--window", required=True)
    b.add_argument("--start", type=float, required=True)
    b.add_argument("--out", required=True)
    r = sub.add_parser("run")
    r.add_argument("--replay", required=True)
    r.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "build":
        print(json.dumps(build(Path(a.run), Path(a.validation), a.window, a.start, Path(a.out))["files"], indent=1))
    else:
        print(json.dumps(run(Path(a.replay), Path(a.out)), indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
