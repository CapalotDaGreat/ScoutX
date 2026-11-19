"""Audit the controlled flag matrix from frame-level artifacts (2026-11-19).

For each run: exit code, effective SCOUTX_* environment, engine tree, video, stage-1 provenance (hard-link
inodes), fresh-cache evidence, and IMG_4809 label outcomes split by whether the frame has a target box.
Usage: python bench/matrix_audit.py OUT.json RUN_DIR...
"""
from __future__ import annotations

import json
import os
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from compare_frames import outcomes  # noqa: E402
from trackeval_export import load_labels  # noqa: E402


def audit(run: Path, gt: dict | None) -> dict:
    fm = json.loads((run / "out/full_match.json").read_text())
    env = fm["environment"]["scoutxEnv"]
    prov = (run / "provenance.txt").read_text().strip() if (run / "provenance.txt").exists() else None
    rc = (run / "rc.txt").read_text().strip() if (run / "rc.txt").exists() else None
    st = run / "work/stage1"
    chunks = sorted(p for p in st.iterdir() if p.name.startswith("c_"))
    links = {c.name: os.stat(c / "detections.npz").st_nlink for c in chunks}
    rec = {"run": str(run), "rc": rc, "status": fm.get("status"), "provenance": prov,
           "experimentFlags": {k: v for k, v in env.items() if k in (
               "SCOUTX_TELEPORT_SPLIT", "SCOUTX_APPEARANCE_ONLY_LIKELY", "SCOUTX_OCR_VARIANT", "SCOUTX_INTERP_NO_UPGRADE",
               "SCOUTX_OCR_CONSULTED_ONLY")},
           "runtime": {k: env.get(k) for k in ("SCOUTX_BACKEND", "SCOUTX_BATCH", "SCOUTX_DECODER", "SCOUTX_DETECTOR",
                                                "SCOUTX_ORT_PROVIDERS", "SCOUTX_MODE", "SCOUTX_KEYFRAME_EVERY")},
           "video": fm.get("video", {}).get("path") if isinstance(fm.get("video"), dict) else fm.get("video"),
           "stage1Chunks": len(chunks), "stage1HardLinked": all(n > 1 for n in links.values()),
           "attempts": sorted(p.name for p in run.glob("run.attempt*.log")),
           "ocrCaches": sorted(p.name for p in st.glob("ocr_cache*.json"))}
    if gt is not None:
        oc = outcomes(run / "work/report/timeline.npz", gt)
        tgt = {k for k, labs in gt["frames"].items() if any(lab["label"] == "T" for lab in labs) and k in oc}
        rec["labelled"] = {
            "scoredFrames": len(oc), "targetFrames": len(tgt),
            "onTargetFrames": dict(Counter(oc[k][0] for k in tgt)),
            "onNonTargetFrames": dict(Counter(oc[k][0] for k in oc if k not in tgt)),
            "byState": dict(Counter(f"{v[0]}:{v[1]}" for v in oc.values() if v[0] != "abstain"))}
    return rec


if __name__ == "__main__":
    out, runs = sys.argv[1], [Path(p) for p in sys.argv[2:]]
    gt = load_labels(False)
    res = [audit(r, gt if "4809" in r.name or "e6" in r.name or "e0" in r.name else None) for r in runs]
    Path(out).write_text(json.dumps(res, indent=1))
    for r in res:
        print(Path(r["run"]).name, r["rc"], r["experimentFlags"], "s1-linked", r["stage1HardLinked"], r["attempts"],
              r.get("labelled", {}).get("onTargetFrames"), r.get("labelled", {}).get("onNonTargetFrames"))
