"""Full-recording PitchProof GPU benchmark: discovery + all extraction chunks + resolve.

Run from workers/football-cv with the repository's tracking dependencies installed.
This script does NOT emulate Cloud Tasks or measure Cloud Run queue latency. Cost is
an estimate based on *measured wall time* and the operator-supplied all-in host rate.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def probe_duration(video: str) -> float:
    p = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", video],
                       capture_output=True, text=True, check=True)
    duration = float(p.stdout.strip())
    if duration <= 0:
        raise ValueError("Video has no valid positive duration")
    return duration


def price_breakdown(wall_sec: float, host_hourly_usd: float | None, startup_sec: float) -> dict:
    """Explicit cost model: instance compute only; startup is an optional billed allowance."""
    if host_hourly_usd is None:
        return {"status": "not_calculated", "reason": "--host-usd-per-hour not supplied"}
    if host_hourly_usd < 0 or startup_sec < 0:
        raise ValueError("Price and startup allowance must be nonnegative")
    billed_sec = wall_sec + startup_sec
    return {
        "status": "estimated_from_measured_runtime",
        "currency": "USD",
        "hostUsdPerHour": host_hourly_usd,
        "measuredProcessingSec": round(wall_sec, 3),
        "additionalBillableStartupSec_assumption": startup_sec,
        "billableSec_assumption": round(billed_sec, 3),
        "computeUsd_estimate": round(billed_sec * host_hourly_usd / 3600, 5),
        "excluded": ["Cloud Tasks/queue", "storage", "data transfer", "Firebase/Functions", "idle minimum instances", "taxes", "discounts"],
        "warning": "Not a provider invoice; validate billing granularity and effective rates before publishing costs.",
    }


def hardware() -> dict:
    import torch
    info = {"host": platform.platform(), "cpuCores": os.cpu_count(), "torch": torch.__version__,
            "cudaAvailable": torch.cuda.is_available(), "cudaVersion": torch.version.cuda}
    if torch.cuda.is_available():
        info["gpu"] = torch.cuda.get_device_name(0)
    if shutil.which("nvidia-smi"):
        p = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], capture_output=True, text=True)
        info["nvidiaSmi"] = p.stdout.strip() if p.returncode == 0 else None
    return info


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--video", required=True)
    ap.add_argument("--number", required=True)
    ap.add_argument("--kit", required=True)
    ap.add_argument("--kit2", default="")
    ap.add_argument("--out", required=True, help="Output JSON file")
    ap.add_argument("--chunk-sec", type=int, default=300)
    ap.add_argument("--host-usd-per-hour", type=float, default=None, help="ALL-IN GPU host rate including CPU/RAM; operator-supplied")
    ap.add_argument("--billable-startup-sec", type=float, default=0.0, help="Additional billed startup allowance, not measured by this script")
    ap.add_argument("--require-gpu", action="store_true", help="Refuse CPU-only execution")
    ap.add_argument("--keep-work", action="store_true", help="Preserve large intermediate artifacts next to JSON")
    args = ap.parse_args()
    if args.chunk_sec <= 0:
        ap.error("--chunk-sec must be positive")
    if args.host_usd_per_hour is not None and args.host_usd_per_hour < 0:
        ap.error("--host-usd-per-hour must be nonnegative")
    if args.billable_startup_sec < 0:
        ap.error("--billable-startup-sec must be nonnegative")
    if not Path(args.video).is_file():
        ap.error("--video must be a readable local file")
    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    hw = hardware()
    if args.require_gpu and not hw["cudaAvailable"]:
        raise RuntimeError("GPU required but torch.cuda.is_available() is false; refusing misleading CPU benchmark")
    duration = probe_duration(args.video)
    import torch
    from scoutx_tracker.discovery import discover
    from scoutx_tracker.extract import Detector, extract
    from scoutx_tracker.ocr import shared_reader
    from scoutx_tracker.analyze import analyze

    record = {
        "schema": "pitchproof.gpu.full-match-benchmark.v1", "status": "running",
        "timestampUtc": datetime.now(timezone.utc).isoformat(),
        "video": {"basename": Path(args.video).name, "durationSec": round(duration, 3), "sizeBytes": Path(args.video).stat().st_size},
        "target": {"number": args.number, "kit": args.kit, "kit2": args.kit2},
        "hardware": hw, "configuration": {"chunkSec": args.chunk_sec, "backend": os.environ.get("SCOUTX_BACKEND", "auto"),
                "decoder": os.environ.get("SCOUTX_DECODER", "auto"), "keyframeEvery": os.environ.get("SCOUTX_KEYFRAME_EVERY", "1")},
        "stages": {}, "notes": ["Single-worker sequential complete video benchmark; not a Cloud Tasks parallel execution test.",
                "First playable moment is time after model initialization, not upload-to-play latency.",
                "No source footage or crops are included in the JSON report."],
    }
    def save():
        out.write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
    save()
    started = time.perf_counter()
    work = out.parent / (out.stem + "_work") if args.keep_work else Path(tempfile.mkdtemp(prefix="pitchproof_full_bench_"))
    work.mkdir(parents=True, exist_ok=True)
    try:
        t = time.perf_counter()
        det = Detector(imgsz=int(os.environ.get("SCOUTX_DISCOVERY_DET", "416")))
        reader = shared_reader()
        record["stages"]["modelInitialization"] = {"wallSec": round(time.perf_counter() - t, 3)}
        save()
        t = time.perf_counter()
        first = []
        discovery = discover(args.video, 0.0, duration, args.number, args.kit, lambda f: det(f)[:2], reader,
                             crops_dir=str(work / "discovery"), on_sighting=lambda _s, elapsed: first.append(elapsed))
        record["stages"]["discovery"] = {"wallSec": round(time.perf_counter() - t, 3),
                 "firstPlayableAfterDiscoveryStartSec": round(first[0], 3) if first else None,
                 "firstPlayableAfterModelInitSec": round(record["stages"]["modelInitialization"]["wallSec"] + first[0], 3) if first else None,
                 "sightings": len(discovery.sightings), "timingsSec": discovery.timings}
        save()
        run_dirs = []
        chunks = []
        for i in range(int((duration - 1e-9) // args.chunk_sec) + 1):
            start = i * args.chunk_sec
            end = min(duration, start + args.chunk_sec)
            if start >= end:
                continue
            run = work / "stage1" / f"c_{i:05d}"
            t = time.perf_counter()
            meta = extract(args.video, str(run), start=start, end=end)
            chunks.append({"startSec": start, "endSec": round(end, 3), "wallSec": round(time.perf_counter() - t, 3),
                           "frames": meta.get("frames"), "stageSeconds": meta.get("stageSeconds")})
            run_dirs.append(str(run))
            record["stages"]["extraction"] = {"chunks": chunks, "wallSec": round(sum(x["wallSec"] for x in chunks), 3)}
            save()
        t = time.perf_counter()
        report = analyze(run_dirs, str(work / "report"), args.number, args.kit, kit2=args.kit2,
                         sightings=[dataclasses.asdict(s) for s in discovery.sightings], log=lambda _msg: None)
        record["stages"]["resolve"] = {"wallSec": round(time.perf_counter() - t, 3),
                                        "invariantsOk": report.get("invariants", {}).get("ok"),
                                        "coverage": report.get("coverage"), "identity": report.get("identity")}
        if not record["stages"]["resolve"]["invariantsOk"]:
            raise RuntimeError("Tracking report invariant validation failed")
        record["status"] = "complete"
    except Exception as exc:
        record["status"] = "failed"
        record["error"] = {"type": type(exc).__name__, "message": str(exc)}
        raise
    finally:
        elapsed = time.perf_counter() - started
        record["measuredTotalWallSec"] = round(elapsed, 3)
        record["videoSecondsPerWallSecond"] = round(duration / elapsed, 4) if elapsed else None
        record["cost"] = price_breakdown(elapsed, args.host_usd_per_hour, args.billable_startup_sec)
        if hw["cudaAvailable"]:
            record["peakTorchAllocatedGpuMiB"] = round(torch.cuda.max_memory_allocated() / 2**20, 2)
            record["peakTorchReservedGpuMiB"] = round(torch.cuda.max_memory_reserved() / 2**20, 2)
        save()
        if not args.keep_work:
            shutil.rmtree(work, ignore_errors=True)
    print(json.dumps({"status": record["status"], "measuredTotalWallSec": record["measuredTotalWallSec"],
                      "cost": record["cost"], "report": str(out)}, indent=2))


if __name__ == "__main__":
    main()
