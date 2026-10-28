"""5.2 GPU option matrix: run existing GPU-compatible options as separate full-match benchmarks and
accept an option only when it is faster AND passes the accuracy gate against the reference run.

    python bench/gpu_matrix.py --video /data/IMG_4809_proxy_10fps.mp4 --out-dir /out/matrix \
        --baseline /out/cpu/full_match.json [--variants gpu-balanced batch-4 batch-16 ort-cuda nvdec]

Every variant is a separate process (the engine reads SCOUTX_* knobs at import time) with its own
checkpoint directory (different settings never share chunks). The baseline is the CPU run of the same
script on the same file (or, without --baseline, the gpu-balanced variant). Nothing here changes the
production defaults: the result is a recommendation list in matrix.json.
NOT RUN in the development environment (no GPU).
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

# name -> (env overrides, what it tests). gpu-balanced = the validated balanced mode on CUDA (torch fp16,
# batched detection, OpenCV decode) and is the GPU reference for the others.
VARIANTS: dict[str, tuple[dict, str]] = {
    "gpu-balanced": ({}, "validated balanced mode on CUDA: torch fp16, batch 8, OpenCV decode"),
    "batch-4": ({"SCOUTX_BATCH": "4"}, "smaller detector batch"),
    "batch-16": ({"SCOUTX_BATCH": "16"}, "larger detector batch"),
    "ort-cuda": ({"SCOUTX_BACKEND": "onnx", "SCOUTX_ORT_PROVIDERS": "CUDAExecutionProvider,CPUExecutionProvider"},
                 "ONNX Runtime CUDA execution provider instead of torch (fp32)"),
    "nvdec": ({"SCOUTX_DECODER": "ffmpeg", "SCOUTX_HWACCEL": "cuda"},
              "ffmpeg + NVDEC decoding; for HDR sources (the IMG_4809 proxy is HLG) this is also a different colour path"),
}


def run_variant(name: str, a, baseline: str | None) -> dict:
    env_over, what = VARIANTS[name]
    out = Path(a.out_dir) / name / "full_match.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [sys.executable, str(HERE / "full_match_benchmark.py"), "--video", a.video, "--number", a.number, "--kit", a.kit,
           "--kit2", a.kit2, "--out", str(out), "--chunk-sec", str(a.chunk_sec), "--require-gpu", "--require-models",
           "--reference", a.reference, "--ground-truth", a.ground_truth, "--gate", a.gate]
    if a.prices:
        cmd += ["--prices", a.prices]
    if baseline:
        cmd += ["--baseline", baseline]
    env = {**os.environ, **env_over, "SCOUTX_MODE": "balanced"}
    p = subprocess.run(cmd, env=env, cwd=ROOT)
    rec = json.loads(out.read_text()) if out.exists() else {}
    return {"variant": name, "what": what, "env": env_over, "exitCode": p.returncode, "status": rec.get("status"),
            "wallSec": (rec.get("timing") or {}).get("measuredTotalWallSec"),
            "timingComplete": (rec.get("timing") or {}).get("timingComplete"),
            "gate": rec.get("gate"), "accuracy": {k: v for k, v in (rec.get("accuracy") or {}).items() if k != "wrongIdentityTimes"},
            "agreement": (rec.get("comparison") or {}).get("agreement"), "gpuSampling": rec.get("gpuSampling"),
            "gpuProviders": rec.get("gpuProviders"), "result": str(out)}


def decide(rows: list[dict]) -> list[dict]:
    """Accepted = exit 0, gate passed, full timing, and faster than gpu-balanced. Never auto-applied."""
    ref = next((r for r in rows if r["variant"] == "gpu-balanced"), None)
    for r in rows:
        ok = r["exitCode"] == 0 and (r["gate"] or {}).get("passed") and r["timingComplete"]
        if r["variant"] == "gpu-balanced":
            r["decision"] = "reference" if ok else "REJECTED (the validated mode itself failed - stop and investigate)"
        elif not ok:
            r["decision"] = "REJECTED (accuracy gate / run failed)"
        elif ref and ref["wallSec"] and r["wallSec"] and r["wallSec"] < ref["wallSec"]:
            r["decision"] = f"candidate ({ref['wallSec'] / r['wallSec']:.2f}x faster, gate passed) - needs review before any default change"
        else:
            r["decision"] = "no gain"
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--baseline", default=None, help="CPU reference benchmark JSON (same script, same file)")
    ap.add_argument("--variants", nargs="+", default=list(VARIANTS), choices=list(VARIANTS))
    ap.add_argument("--number", default="20")
    ap.add_argument("--kit", default="orange")
    ap.add_argument("--kit2", default="white")
    ap.add_argument("--chunk-sec", type=int, default=300)
    ap.add_argument("--reference", default=str(HERE / "references" / "img4809_proxy_10fps.json"))
    ap.add_argument("--ground-truth", default=str(HERE / "results" / "5.1" / "gt_img4809_intervals.json"))
    ap.add_argument("--gate", default=str(HERE / "gates" / "balanced_5.2.json"))
    ap.add_argument("--prices", default=None)
    a = ap.parse_args(argv)
    names = ["gpu-balanced"] + [v for v in a.variants if v != "gpu-balanced"]
    rows = []
    gpu_ref = None
    for n in names:
        base = a.baseline or (gpu_ref if n != "gpu-balanced" else None)
        rows.append(run_variant(n, a, base))
        if n == "gpu-balanced":
            gpu_ref = rows[-1]["result"]
        Path(a.out_dir, "matrix.json").write_text(json.dumps({"baseline": a.baseline or "gpu-balanced", "rows": decide(rows)}, indent=2))
    print(json.dumps([{k: r[k] for k in ("variant", "exitCode", "wallSec", "decision")} for r in rows], indent=2))
    return 0 if rows and rows[0]["decision"] == "reference" else 3


if __name__ == "__main__":
    sys.exit(main())
