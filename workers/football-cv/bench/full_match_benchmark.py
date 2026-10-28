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


class GpuSampler:
    """Polls nvidia-smi once per second: whole-device memory in use (covers torch, ONNX Runtime and
    the OCR models, unlike torch's allocator counters) and utilisation."""

    def __init__(self, period: float = 1.0) -> None:
        import threading  # noqa: PLC0415

        self.period, self.samples, self._stop = period, [], threading.Event()
        self._t = threading.Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                p = subprocess.run(["nvidia-smi", "--query-gpu=memory.used,utilization.gpu", "--format=csv,noheader,nounits"],
                                   capture_output=True, text=True, timeout=5)
                mem, util = (float(x) for x in p.stdout.strip().splitlines()[0].split(","))
                self.samples.append((mem, util))
            except Exception:  # noqa: BLE001 - sampling must never break the benchmark
                pass
            self._stop.wait(self.period)

    def start(self) -> "GpuSampler":
        if shutil.which("nvidia-smi"):
            self._t.start()
        return self

    def stop(self) -> dict:
        self._stop.set()
        if self._t.is_alive():
            self._t.join(timeout=10)
        if not self.samples:
            return {"status": "not_sampled"}
        mem = [m for m, _ in self.samples]
        util = [u for _, u in self.samples]
        return {"samples": len(self.samples), "peakMemoryUsedMiB": max(mem),
                "meanUtilizationPct": round(sum(util) / len(util), 1), "p95UtilizationPct": sorted(util)[int(0.95 * (len(util) - 1))]}


def _iou(a, b) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    i = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0.0


CLAIM = ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")


def accuracy_vs_ground_truth(claims: list, gt: dict, size: tuple[int, int], gt_size: tuple[int, int] = (1920, 1080),
                             tol: float = 0.051) -> dict:
    """Frame-level identity metrics of a run's claims (t, state, box) against interval ground truth
    in the format of bench/results/5.1/gt_img4809_intervals.json (frames matched by time, boxes
    rescaled to the ground truth's resolution, hit = IoU >= 0.5). Same definitions as the 5.1/5.2
    reports: a claim on a labelled non-target is a false attribution."""
    import bisect  # noqa: PLC0415

    sx, sy = gt_size[0] / size[0], gt_size[1] / size[1]
    ts = [c[0] for c in claims]
    fps = float(gt.get("fps", 10.0))
    tgt = hit_t = wrong = conf_wrong = matched = overlap_wrong = 0
    for fs, labels in gt["frames"].items():
        t = float(gt["times"][fs])
        tgt += any(x["label"] == "T" for x in labels)
        k = bisect.bisect_left(ts, t - tol)
        c = claims[k] if k < len(claims) and abs(claims[k][0] - t) <= tol else None
        if c is None or c[1] not in CLAIM:
            continue
        box = [c[2][0] * sx, c[2][1] * sy, c[2][2] * sx, c[2][3] * sy]
        best = max(labels, key=lambda x: _iou(box, x["box"]), default=None)
        if best is None or _iou(box, best["box"]) < 0.5:
            continue
        matched += 1
        if best["label"] == "T":
            hit_t += 1
        elif best["label"] == "N":
            wrong += 1
            conf_wrong += c[1] == "CONFIRMED_VISIBLE"
            # the claimed box also overlaps the target's box (two players overlapping): reported separately
            overlap_wrong += any(x["label"] == "T" and _iou(box, x["box"]) >= 0.3 for x in labels)
    claimed_on_labelled = hit_t + wrong
    idf1 = 2 * hit_t / (2 * hit_t + wrong + (tgt - hit_t)) if tgt else None
    return {"targetLabelledSec": round(tgt / fps, 1), "claimedCorrectSec": round(hit_t / fps, 1),
            "falseAttributionSec": round(wrong / fps, 1), "confirmedWrongSec": round(conf_wrong / fps, 1),
            "falseAttributionWhileOverlappingTargetSec": round(overlap_wrong / fps, 1),
            "claimedRecall": round(hit_t / tgt, 3) if tgt else None,
            "precisionOnLabelled": round(hit_t / claimed_on_labelled, 3) if claimed_on_labelled else None,
            "IDF1": round(idf1, 3) if idf1 is not None else None,
            "note": "auto mode (no answers). Reference (CPU, 5.2 engine, experiment harness with dense OCR): IDF1 0.918, "
                    "falseAttribution 0 s - a GPU run must show 0 s false attribution; small recall differences can come "
                    "from different OCR/discovery reads and need a same-pipeline CPU run to attribute."}


def hardware() -> dict:
    import torch
    info = {"host": platform.platform(), "cpuCores": os.cpu_count(), "torch": torch.__version__,
            "cudaAvailable": torch.cuda.is_available(), "cudaVersion": torch.version.cuda}
    if torch.cuda.is_available():
        info["gpu"] = torch.cuda.get_device_name(0)
    try:
        import onnxruntime as ort  # noqa: PLC0415

        info["onnxruntime"] = ort.__version__
        info["ortProviders"] = ort.get_available_providers()
    except ImportError:
        info["onnxruntime"] = None
    try:
        import scoutx_tracker  # noqa: PLC0415

        info["engineVersion"] = scoutx_tracker.__version__
    except Exception:  # noqa: BLE001
        pass
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
    ap.add_argument("--ground-truth", default=None,
                    help="Interval ground truth JSON for THIS recording (e.g. bench/results/5.1/gt_img4809_intervals.json for IMG_4809)")
    args = ap.parse_args()
    if args.chunk_sec <= 0:
        ap.error("--chunk-sec must be positive")
    if args.host_usd_per_hour is not None and args.host_usd_per_hour < 0:
        ap.error("--host-usd-per-hour must be nonnegative")
    if args.billable_startup_sec < 0:
        ap.error("--billable-startup-sec must be nonnegative")
    if not Path(args.video).is_file():
        ap.error("--video must be a readable local file")
    if args.ground_truth and not Path(args.ground_truth).is_file():
        ap.error("--ground-truth must be a readable file")
    from scoutx_tracker.modes import mode_env  # noqa: PLC0415

    mode = os.environ.get("SCOUTX_MODE", "balanced")
    mode_env(mode)  # refuses accuracy-unvalidated modes unless SCOUTX_ALLOW_UNVALIDATED_MODE=1
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
                "decoder": os.environ.get("SCOUTX_DECODER", "auto"), "keyframeEvery": os.environ.get("SCOUTX_KEYFRAME_EVERY", "1"),
                "mode": mode, "env": {k: v for k, v in sorted(os.environ.items()) if k.startswith("SCOUTX_")}},
        "stages": {}, "notes": ["Single-worker sequential complete video benchmark; not a Cloud Tasks parallel execution test.",
                "First playable moment is time after model initialization, not upload-to-play latency.",
                "Discovery and extraction run one after the other here; production runs discovery chunks first and extraction segments in parallel workers.",
                "No source footage or crops are included in the JSON report."],
    }
    def save():
        out.write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
    save()
    gpu = GpuSampler().start()
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
                                        "timingsSec": report.get("engine", {}).get("timingsSec"),
                                        "ocrDeferred": report.get("engine", {}).get("ocrDeferred"),
                                        "coverage": report.get("coverage"), "identity": report.get("identity")}
        # stage totals across the whole run (seconds of wall time inside each step)
        tot: dict = {}
        for c in chunks:
            for k, v in (c.get("stageSeconds") or {}).items():
                tot[k] = round(tot.get(k, 0.0) + float(v), 2)
        record["stages"]["extraction"]["stageSecondsTotal"] = tot
        # claims timeline (times, states, boxes - numbers only, no images) for accuracy checks
        import numpy as np  # noqa: PLC0415

        z = np.load(work / "report" / "timeline.npz", allow_pickle=False)
        claims = [[round(float(z["times"][i]), 2), str(z["states"][i]), [round(float(v), 1) for v in z["boxes"][i]]]
                  for i in range(len(z["times"])) if z["present"][i]]
        (out.parent / (out.stem + "_claims.json")).write_text(json.dumps(claims), encoding="utf-8")
        if args.ground_truth:
            import cv2  # noqa: PLC0415

            cap = cv2.VideoCapture(args.video)
            size = (int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
            cap.release()
            gt = json.loads(Path(args.ground_truth).read_text(encoding="utf-8"))
            record["accuracy"] = accuracy_vs_ground_truth(claims, gt, size)
            record["accuracy"]["groundTruth"] = Path(args.ground_truth).name
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
        record["gpuSampling"] = gpu.stop()
        import resource  # noqa: PLC0415

        record["peakRssMiB"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
        if hw["cudaAvailable"]:
            record["peakTorchAllocatedGpuMiB"] = round(torch.cuda.max_memory_allocated() / 2**20, 2)
            record["peakTorchReservedGpuMiB"] = round(torch.cuda.max_memory_reserved() / 2**20, 2)
        save()
        if not args.keep_work:
            shutil.rmtree(work, ignore_errors=True)
    print(json.dumps({"status": record["status"], "measuredTotalWallSec": record["measuredTotalWallSec"],
                      "cost": record["cost"], "accuracy": record.get("accuracy"), "report": str(out)}, indent=2))


if __name__ == "__main__":
    main()
