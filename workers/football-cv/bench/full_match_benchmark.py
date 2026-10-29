"""Full-recording PitchProof benchmark (5.2): discovery + every stage-1 chunk + resolve, on CPU or GPU.

    python bench/full_match_benchmark.py --video IMG_4809_proxy_10fps.mp4 --number 20 --kit orange --kit2 white \
        --out out/full_match.json --reference bench/references/img4809_proxy_10fps.json \
        --ground-truth bench/results/5.1/gt_img4809_intervals.json --gate bench/gates/balanced_5.2.json \
        [--baseline cpu/full_match.json] [--prices bench/gcp/prices_europe-west6.json] [--require-gpu --require-models]

What the JSON proves (schema pitchproof.full-match-benchmark.v2):
  * input: codec / HDR / resolution / fps / duration / frame count / SHA-256, effective processing fps, and
    whether it is byte-identical to the validated reference recording;
  * environment: Python and package versions, CUDA / driver / providers actually executing on the GPU,
    model files checked against bench/references/model_hashes.json, image provenance;
  * timing per stage (model init, discovery, every chunk, resolve) - `timingComplete` is false when
    checkpointed work was reused, so a resumed run is never presented as a full measurement;
  * accuracy against ground truth with wrong identity separated from overlap-ambiguous annotations, the
    accuracy gate verdict (exit code 3 when it fails) and, with --baseline, the comparison with the
    reference run (same recording/settings/models/ground truth required, otherwise exit code 5);
  * cost: ESTIMATES from list prices x measured durations (never an invoice).
Stage-1 chunks are checkpointed in --work-dir (scoutx_tracker.checkpoint): an interrupted run resumes,
retries are bounded, and chunks from other settings are refused, never mixed.
Not measured here: Cloud Tasks queueing, upload latency, parallel workers (single sequential worker).

Exit codes: 0 ok, 2 run failed, 3 accuracy gate failed, 4 GPU/model verification failed, 5 runs not comparable /
configuration mismatch, 6 not enough disk space.
"""
from __future__ import annotations

import argparse
import dataclasses
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import pp_bench  # noqa: E402

EXIT_FAILED, EXIT_GATE, EXIT_VERIFY, EXIT_MISMATCH, EXIT_DISK = 2, 3, 4, 5, 6
STAGE1_IMGSZ, STAGE1_STRIDE = 1280, 1


class GpuSampler:
    """Polls nvidia-smi once per second: whole-device memory in use (covers torch, ONNX Runtime and the
    OCR models, unlike torch's allocator counters) and utilisation."""

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


def vm_overheads(timestamps: dict) -> dict:
    """Durations from the VM's timestamps.json (bench/gcp/run_l4_benchmark.sh)."""
    def ts(k):
        v = timestamps.get(k)
        return datetime.fromisoformat(v.replace("Z", "+00:00")).timestamp() if v else None

    boot, gpu, built, video, end = (ts(k) for k in ("vmBooted", "gpuReady", "imageBuilt", "videoDownloaded", "end"))
    out = {}
    if boot and end:
        out["uptimeSec"] = end - boot
    if boot and gpu:
        out["driverWaitSec"] = gpu - boot
    if gpu and built:
        out["imageBuildSec"] = built - gpu
    if built and video:
        out["videoDownloadSec"] = video - built
    return out


def chunk_bounds(duration: float, chunk_sec: int) -> list[tuple[int, float, float]]:
    out = []
    for i in range(int((duration - 1e-9) // chunk_sec) + 1):
        start, end = float(i * chunk_sec), min(duration, float((i + 1) * chunk_sec))
        if start < end:
            out.append((i, start, end))
    return out


def parse_args(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--number", required=True)
    ap.add_argument("--kit", required=True)
    ap.add_argument("--kit2", default="")
    ap.add_argument("--out", required=True, help="output JSON file; claims go to <stem>_claims.json next to it")
    ap.add_argument("--chunk-sec", type=int, default=300)
    ap.add_argument("--work-dir", default=None, help="checkpoint directory (default: <out dir>/<stem>_work); reuse it to resume")
    ap.add_argument("--resume-policy", choices=("fail", "replace"), default="fail",
                    help="existing chunk/discovery from DIFFERENT settings: fail (default) or replace it")
    ap.add_argument("--retries", type=int, default=1, help="extra attempts per failed chunk")
    ap.add_argument("--min-free-gb", type=float, default=2.0)
    ap.add_argument("--keep-work", action="store_true", help="keep checkpoints after a successful run (always kept on failure)")
    ap.add_argument("--reference", default=None, help="reference recording JSON (bench/references/*.json)")
    ap.add_argument("--ground-truth", default=None)
    ap.add_argument("--gate", default=None, help="accuracy gate JSON (bench/gates/*.json)")
    ap.add_argument("--baseline", default=None, help="benchmark JSON of the reference run (normally CPU) to compare with")
    ap.add_argument("--prices", default=None, help="price list JSON (bench/gcp/prices_*.json)")
    ap.add_argument("--host-usd-per-hour", type=float, default=None, help="overrides the price list's vmUsdPerHour")
    ap.add_argument("--vm-timestamps", default=None, help="timestamps.json of the VM run (adds VM uptime/overheads to the cost)")
    ap.add_argument("--require-gpu", action="store_true", help="refuse unless torch AND ONNX Runtime really execute on the GPU")
    ap.add_argument("--require-models", action="store_true", help="refuse unless model files match bench/references/model_hashes.json")
    a = ap.parse_args(argv)
    if a.chunk_sec <= 0:
        ap.error("--chunk-sec must be positive")
    if a.retries < 0 or a.min_free_gb < 0:
        ap.error("--retries and --min-free-gb must be nonnegative")
    if a.host_usd_per_hour is not None and a.host_usd_per_hour < 0:
        ap.error("--host-usd-per-hour must be nonnegative")
    for f in ("video", "reference", "ground_truth", "gate", "baseline", "prices", "vm_timestamps"):
        v = getattr(a, f)
        if v and not Path(v).is_file():
            ap.error(f"--{f.replace('_', '-')} must be a readable file: {v}")
    return a


def main(argv=None) -> int:  # noqa: C901, PLR0912, PLR0915 - one linear benchmark script
    a = parse_args(argv)
    from scoutx_tracker.checkpoint import ConfigMismatch, DiskSpaceError, Stage1Store, fingerprint, stage1_settings  # noqa: PLC0415
    from scoutx_tracker.envinfo import environment_metadata, sha256_file, verify_gpu_providers, verify_models  # noqa: PLC0415
    from scoutx_tracker.media_info import describe, match_reference  # noqa: PLC0415
    from scoutx_tracker.modes import mode_env  # noqa: PLC0415

    mode = os.environ.get("SCOUTX_MODE", "balanced")
    mode_env(mode)  # refuses accuracy-unvalidated modes unless SCOUTX_ALLOW_UNVALIDATED_MODE=1
    out = Path(a.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    work = Path(a.work_dir).resolve() if a.work_dir else out.parent / (out.stem + "_work")
    work.mkdir(parents=True, exist_ok=True)
    record: dict = {"schema": "pitchproof.full-match-benchmark.v2", "status": "starting",
                    "timestampUtc": datetime.now(timezone.utc).isoformat(), "target": {"number": a.number, "kit": a.kit, "kit2": a.kit2},
                    "notes": ["Single sequential worker; not a Cloud Tasks / parallel-segment test.",
                              "firstPlayable = time after model initialisation, not upload-to-play latency.",
                              "No footage, crops or images are written to this JSON or the claims file."]}

    def save() -> None:
        tmp = out.with_suffix(".json.part")
        tmp.write_text(json.dumps(record, indent=2, default=str), encoding="utf-8")
        tmp.replace(out)

    # ---- environment, models, providers, input (before any heavy work)
    record["environment"] = environment_metadata()
    record["models"] = verify_models()
    cuda = bool(record["environment"].get("torch") and record["environment"]["torch"].get("cudaAvailable"))
    if cuda or a.require_gpu:
        record["gpuProviders"] = verify_gpu_providers()
    record["input"] = describe(a.video)
    if a.reference:
        record["input"]["referenceMatch"] = match_reference(record["input"], json.loads(Path(a.reference).read_text()))
    if a.ground_truth:
        record["groundTruth"] = {"file": Path(a.ground_truth).name, "sha256": sha256_file(a.ground_truth)}
    duration = float(record["input"]["durationSec"])
    settings = stage1_settings(imgsz=STAGE1_IMGSZ, stride=STAGE1_STRIDE,
                               discoveryImgsz=int(os.environ.get("SCOUTX_DISCOVERY_DET", "416")),
                               device="cuda" if cuda else "cpu")
    record["configuration"] = {"chunkSec": a.chunk_sec, "mode": mode, "stage1Settings": settings,
                               "stage1Fingerprint": fingerprint(settings), "resumePolicy": a.resume_policy, "retries": a.retries}
    save()
    if a.require_models and not record["models"]["ok"]:
        record["status"] = "refused"
        record["error"] = {"type": "ModelVerification", "message": "model files differ from bench/references/model_hashes.json"}
        save()
        return EXIT_VERIFY
    if a.require_gpu and not record["gpuProviders"]["ok"]:
        record["status"] = "refused"
        record["error"] = {"type": "GpuVerification", "message": json.dumps(record["gpuProviders"], default=str)}
        save()
        return EXIT_VERIFY
    baseline = json.loads(Path(a.baseline).read_text()) if a.baseline else None
    if baseline is not None:
        why = pp_bench.comparable(record, baseline)
        if why:
            record["status"] = "refused"
            record["error"] = {"type": "NotComparable", "message": "; ".join(why)}
            save()
            return EXIT_MISMATCH

    import torch  # noqa: PLC0415

    from scoutx_tracker.analyze import analyze  # noqa: PLC0415
    from scoutx_tracker.discovery import Sighting, discover  # noqa: PLC0415
    from scoutx_tracker.extract import Detector, extract  # noqa: PLC0415
    from scoutx_tracker.ocr import shared_reader  # noqa: PLC0415

    gpu = GpuSampler().start()
    started = time.perf_counter()
    record["status"] = "running"
    record["stages"] = {}
    store = Stage1Store(work / "stage1", record["input"]["sha256"], settings, policy=a.resume_policy,
                        min_free_bytes=int(a.min_free_gb * 2**30))
    record["stages"]["cleanupBefore"] = store.cleanup()
    rc = 0
    reused = False
    try:
        t = time.perf_counter()
        det = Detector(imgsz=settings["discoveryImgsz"])
        reader = shared_reader()
        record["stages"]["modelInitialization"] = {"wallSec": round(time.perf_counter() - t, 3), "discoveryDetector": det.name,
                                                   "discoveryDetectorOnGpu": det.on_gpu}
        save()
        # ---- discovery (checkpointed: sightings only)
        disc_fp = fingerprint({"video": record["input"]["sha256"], "number": a.number, "kit": a.kit, "settings": settings})
        disc_file = work / "discovery.json"
        prev = json.loads(disc_file.read_text()) if disc_file.exists() else None
        if prev and prev.get("fingerprint") != disc_fp:
            if a.resume_policy == "fail":
                raise ConfigMismatch(f"{disc_file} was produced with different input/settings")
            prev = None
        if prev:
            reused = True
            sightings = [Sighting(**s) for s in prev["sightings"]]
            record["stages"]["discovery"] = {**prev["record"], "status": "resumed"}
        else:
            t = time.perf_counter()
            first: list = []
            disc = discover(a.video, 0.0, duration, a.number, a.kit, lambda f: det(f)[:2], reader,
                            crops_dir=str(work / "discovery_crops"), on_sighting=lambda _s, elapsed: first.append(elapsed))
            sightings = disc.sightings
            rec = {"wallSec": round(time.perf_counter() - t, 3),
                   "firstPlayableAfterDiscoveryStartSec": round(first[0], 3) if first else None,
                   "firstPlayableAfterModelInitSec": round(record["stages"]["modelInitialization"]["wallSec"] + first[0], 3) if first else None,
                   "sightings": len(sightings), "timingsSec": disc.timings, "status": "measured",
                   "effectiveDetectFps": round(disc.timings.get("samples", 0) / duration, 3) if duration else None}
            disc_file.write_text(json.dumps({"fingerprint": disc_fp, "sightings": [dataclasses.asdict(s) for s in sightings],
                                             "record": rec}, default=str))
            shutil.rmtree(work / "discovery_crops", ignore_errors=True)   # thumbnails only - not used by resolve
            record["stages"]["discovery"] = rec
        save()
        # ---- stage 1, chunk by chunk (checkpointed)
        chunks = []
        for i, start, end in chunk_bounds(duration, a.chunk_sec):
            res = store.chunk(i, start, end, lambda d, s=start, e=end: extract(a.video, d, start=s, end=e,
                                                                                 imgsz=STAGE1_IMGSZ, stride=STAGE1_STRIDE),
                              retries=a.retries)
            reused |= res.status == "resumed"
            chunks.append({"index": i, "startSec": start, "endSec": round(end, 3), "status": res.status, "attempts": res.attempts,
                           "wallSec": round(res.wall_sec, 3), "replaced": res.replaced, "frames": res.meta.get("frames"),
                           "fps": res.meta.get("fps"), "detector": res.meta.get("detector"),
                           "stageSeconds": res.meta.get("stageSeconds") if res.status == "extracted" else None})
            tot: dict = {}
            for c in chunks:
                for k, v in (c.get("stageSeconds") or {}).items():
                    tot[k] = round(tot.get(k, 0.0) + float(v), 2)
            frames = sum(c["frames"] or 0 for c in chunks)
            record["stages"]["extraction"] = {
                "chunks": chunks, "wallSecMeasured": round(sum(c["wallSec"] for c in chunks), 3),
                "resumedChunks": sum(c["status"] == "resumed" for c in chunks), "stageSecondsTotal": tot,
                "framesProcessed": frames, "effectiveProcessingFps": round(frames / min(duration, end), 3) if end else None,
                "diskBytesPerVideoSec": round(store.bytes_per_sec or 0.0), "freeBytes": shutil.disk_usage(work).free}
            save()
        record["input"]["effectiveProcessingFps"] = record["stages"]["extraction"]["effectiveProcessingFps"]
        # ---- resolve
        t = time.perf_counter()
        report = analyze([str(store.run_dir(i)) for i, _, _ in chunk_bounds(duration, a.chunk_sec)], str(work / "report"),
                         a.number, a.kit, kit2=a.kit2, sightings=[dataclasses.asdict(s) for s in sightings], log=lambda _m: None)
        record["stages"]["resolve"] = {"wallSec": round(time.perf_counter() - t, 3), "invariantsOk": report.get("invariants", {}).get("ok"),
                                       "timingsSec": report.get("engine", {}).get("timingsSec"),
                                       "ocrDeferred": report.get("engine", {}).get("ocrDeferred"),
                                       "coverage": report.get("coverage"), "identity": report.get("identity")}
        import numpy as np  # noqa: PLC0415

        z = np.load(work / "report" / "timeline.npz", allow_pickle=False)
        claims = [[round(float(z["times"][k]), 2), str(z["states"][k]), [round(float(v), 1) for v in z["boxes"][k]]]
                  for k in range(len(z["times"])) if z["present"][k]]
        claims_file = out.parent / (out.stem + "_claims.json")
        claims_file.write_text(json.dumps(claims), encoding="utf-8")
        record["claimsFile"] = {"file": claims_file.name, "sha256": sha256_file(claims_file), "frames": len(claims)}
        if not record["stages"]["resolve"]["invariantsOk"]:
            raise RuntimeError("tracking report invariant validation failed")
        # ---- accuracy, gate, comparison
        if a.ground_truth:
            gt = json.loads(Path(a.ground_truth).read_text())
            record["accuracy"] = pp_bench.accuracy(claims, gt, (record["input"]["width"], record["input"]["height"]))
        if baseline is not None:
            bclaims_path = Path(a.baseline).parent / baseline.get("claimsFile", {}).get("file", "")
            if bclaims_path.is_file():
                record["comparison"] = {"baseline": Path(a.baseline).name,
                                        "agreement": pp_bench.claims_agreement(json.loads(bclaims_path.read_text()), claims),
                                        "baselineAccuracy": baseline.get("accuracy")}
        if a.gate:
            gate = pp_bench.load_gate(a.gate)
            if "accuracy" not in record:
                record["gate"] = {"gate": gate.get("name"), "passed": False, "failures": ["no ground truth - gate cannot be evaluated"]}
            else:
                g = pp_bench.evaluate_gate(record["accuracy"], gate, (baseline or {}).get("accuracy"))
                agr = (record.get("comparison") or {}).get("agreement")
                for field, rule in gate.get("agreementWithBaseline", {}).items():
                    if agr is None:
                        continue
                    v = agr.get(field)
                    if v is not None and v < rule["min"]:
                        g["failures"].append(f"{field} = {v} < min {rule['min']}")
                g["passed"] = not g["failures"]
                record["gate"] = g
            if not record["gate"]["passed"]:
                rc = EXIT_GATE
        record["status"] = "complete" if rc == 0 else "gate_failed"
    except ConfigMismatch as exc:
        record["status"], record["error"], rc = "refused", {"type": "ConfigMismatch", "message": str(exc)}, EXIT_MISMATCH
    except DiskSpaceError as exc:
        record["status"], record["error"], rc = "failed", {"type": "DiskSpaceError", "message": str(exc)}, EXIT_DISK
    except KeyboardInterrupt:  # time budget (timeout --signal=INT) or operator: completed chunks stay checkpointed
        record["status"], record["error"], rc = "interrupted", {"type": "Interrupted", "message": "stopped by time budget or operator"}, EXIT_FAILED
    except Exception as exc:  # noqa: BLE001 - recorded, checkpoints kept for a resume
        record["status"], record["error"], rc = "failed", {"type": type(exc).__name__, "message": str(exc)}, EXIT_FAILED
    finally:
        elapsed = time.perf_counter() - started
        record["timing"] = {"measuredTotalWallSec": round(elapsed, 3), "timingComplete": not reused,
                            "note": None if not reused else "checkpointed work was reused - this is NOT a full-run measurement",
                            "videoSecondsPerWallSecond": round(duration / elapsed, 4) if elapsed and not reused else None}
        prices = json.loads(Path(a.prices).read_text()) if a.prices else None
        if a.host_usd_per_hour is not None:
            prices = {**(prices or {}), "vmUsdPerHour": a.host_usd_per_hour, "source": (prices or {}).get("source", "operator-supplied rate")}
        vm = vm_overheads(json.loads(Path(a.vm_timestamps).read_text())) if a.vm_timestamps else None
        record["cost"] = pp_bench.cost_breakdown(prices, elapsed, vm=vm,
                                                 storage={"gb": round(record["input"]["sizeBytes"] / 1e9, 3), "days": 1},
                                                 video_sec=duration if not reused else None)
        record["gpuSampling"] = gpu.stop()
        import resource  # noqa: PLC0415

        record["peakRssMiB"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
        if cuda:
            record["peakTorchAllocatedGpuMiB"] = round(torch.cuda.max_memory_allocated() / 2**20, 2)
        save()
        if record["status"] == "complete" and not a.keep_work:
            shutil.rmtree(work, ignore_errors=True)        # success: bounded cleanup of all checkpoints
    print(json.dumps({"status": record["status"], "exitCode": rc, "timing": record.get("timing"),
                      "accuracy": {k: v for k, v in (record.get("accuracy") or {}).items() if k != "wrongIdentityTimes"},
                      "gate": record.get("gate"), "report": str(out)}, indent=2, default=str))
    return rc


if __name__ == "__main__":
    sys.exit(main())
