# Production analysis device: CPU (owner decision 2026-11-21). Plan, not a release

**Decision.** The tracking worker targets CPU. It is the only configuration that has passed
`bench/gates/balanced_5.2.json`. The L4 FP16 batch-8 candidate failed it: claimed recall 0.494 vs 0.621 and IDF1
0.661 vs 0.766 (5.3 GPU benchmark report). The controlled FP32 GPU comparison never got a machine. L4 stays a V1
parity experiment. Production may point at it only after a same-image FP32-then-FP16 pair passes balanced_5.2 on the
same decoded pixels.

**Not a release.** These blockers still hold the product flags (`TRACKING_V3_ENABLED`, `CV_WORKER_APPROVED`, the
compiled approval):
- a second reviewer on the IMG_4809 label corrections;
- one independent labelled match;
- the known LIKELY wrong-player frames on the default decoder: 28 on #6, 11 on #17 and 3 at the pause-and-resume
  transfer (wrong-player-exchange §8).

Nothing below deploys anything or enables a flag.

## 1. What "CPU passed" means (corrected 2026-11-21 from the run record)

The passing reference is `bench/results/5.3/l4-20261029-netherlands/cpu/full_match.json` (7,528.287 s,
`timingComplete=true`). Its `environment` block shows that it is **the GPU tracker image run with CUDA unavailable**:
- built from `Dockerfile.tracker-gpu` at `3b8f3bb`, Ubuntu 24.04, Python 3.13.17, ffmpeg 6.1.1-3ubuntu5;
- `requirements-gpu.lock`, SHA-256 `7a7dfa96…`, which is unchanged in this repo today;
- torch 2.14.1+cu130 and onnxruntime-gpu 1.29.0 on the CPU execution provider;
- **8 vCPU** (g2-standard-8, `cpuCores: 8`), peak RSS 2,188 MiB.

So step 1 does **not** need a new `Dockerfile.tracker-cpu` with CPU wheels. CPU wheels are a different build, which
makes them a new configuration that would need its own gate pass. The shortest path to the passing configuration:
1. Build `Dockerfile.tracker-gpu` unchanged from the same lock (model hashes are checked at build time).
2. Deploy it on a **CPU-only** Cloud Run service with 8 vCPU, `SCOUTX_ORT_PROVIDERS=CPUExecutionProvider`, and a
   request timeout of at least 1,800 s.
3. Acceptance: run the full-match benchmark there, then `compare_runs.py` against the recorded run with
   balanced_5.2, exit 0. This still matters with identical packages: ONNX Runtime and oneDNN choose kernels by CPU
   instruction set, so a different Cloud Run CPU generation can change the last bits.
4. Fewer vCPUs (2 or 4) is also a different configuration, because the thread count changes. It needs its own exit
   0. It is the cheaper option (section 3).

The image is large because of the CUDA wheels. That costs storage and cold-start time, not accuracy.

## 2. Does CPU fit the existing orchestrator? (clocks aligned 2026-11-21)

Discovery, extraction, resolve and the OCR refresh now share one clock
(`functions/src/analysis/trackingDeadlines.ts`):

| Task | Function timeout | Worker HTTP client | Concurrency |
|---|---|---|---|
| `discoverTrackingTask` | 1,800 s | 1,680 s | 6 |
| `extractTrackingSegmentTask` | 1,800 s | 1,680 s | 6 |
| `resolveTrackingTask` | 1,800 s | 1,680 s | 4 |
| `refreshTrackingOcrTask` | 1,800 s | 1,680 s | 2 |
| Worker Cloud Run service | — | README example is now `--timeout 1800`. Nothing is deployed | 1 per instance |

A client abort throws `TrackingWorkerTimeout`. Resolve and the OCR refresh rethrow it while Cloud Tasks
has another attempt (`maxAttempts` 3 and 2). The last attempt of a full resolve still marks the job
`interrupted` and calls `markTrackingFailed`. A null response (HTTP error, disconnect) stays `rejected`
and is not retried. Discovery and extraction turn the same abort into their existing null-response retry.
The claim lease and the image-reaping window are 31 minutes, longer than the 1,800 s task.

The phases still run in series: extraction is queued only after every discovery chunk has finished.
`planSegments` keeps 300 s segments until the recording is longer than about 5 hours.

The rates are from the 2-vCPU audit split (discovery 2,532 s, stage 1 about 8,280 s, resolve 775 s for the
2,035 s proxy). They are not from the 7,528.287 s accuracy run. The 775 s resolve comes from a resumed run
(`timingComplete=false`). Linear scaling is assumed.

| Task | Estimate on 2 vCPU | Clock that applies | Fits? |
|---|---|---|---|
| Discovery, 600 s chunk | ~750 s | 1,680 s client | Yes |
| Extract, 300 s | ~1,220 s | 1,680 s client | Yes, about 1.4× |
| Extract, 900 s (recordings over ~5 h) | ~3,660 s | 1,680 s client | No |
| Resolve, 34-min match | 775 s, resumed | 1,680 s client | Only if a non-resumed run stays under 1,680 s. Not yet measured |
| Resolve, 90-min match | ~2,050 s if linear | 1,680 s client, 1,800 s function | No. Cloud Tasks will not extend past 30 min |

**Measured on the passing configuration (8 vCPU, non-resumed run):**

| Task | Measured | Applies to | Fits 1,680 s client? |
|---|---|---|---|
| Discovery, whole 2,035 s recording | 1,129 s (OCR 510 s, detect 318 s, decode 84 s) | ~333 s per 600 s chunk, if linear | Yes |
| Extract, 300 s chunk | 834–856 s (7 chunks; last 235 s chunk 664 s) | every football segment | Yes, ~2× margin |
| Resolve, 34-min match | **579 s** (`timingComplete=true`; numbers/OCR 339 s, identity 178 s, tracklets 58 s) | whole match | Yes (it would have fit the old 600 s client by 21 s) |
| Resolve, 90-min match | ~1,535 s if linear | whole match | Tight (about 1.09×). Measure before serving long matches |

So step 3 (resolve without resume) already exists at 8 vCPU. The 2- and 4-vCPU measurements are still open, and
they matter only if a smaller instance is chosen.

Before CPU can serve a match:
1. The pinned CPU image passes `compare_runs.py` + balanced_5.2 against the recorded 7,528.287 s CPU run (exit 0).
2. The deployed worker's request timeout is at least 1,800 s. The README example matches; no service has been deployed.
3. A non-resumed (`timingComplete=true`) resolve is measured at 2, 4 and 8 vCPU. The 775 s figure is not that measurement.
4. A resolve that cannot finish inside 1,680 s needs a different design (for example a Cloud Run job). Retrying it
   three times still cannot, because each attempt hits the same deadline.

## 3. Cost (list prices, europe-west6, instance-based billing; corrected 2026-11-21)

Prices: $0.000018 per vCPU-s, $0.000002 per GiB-s; L4 non-zonal $0.0001867/s.
- **Passing configuration, 8 vCPU / 8 GiB:** 7,528 s × $0.00016/s ≈ **$1.20 per 34-min match** in compute, before
  per-task start overhead.
- **The recorded L4 run** (8 vCPU / 32 GiB + L4, 1,854 s + 80 s) ≈ $0.76, but it failed the gate.
- So **at the passing configuration, CPU costs about 1.6× the L4 run, not half.** An earlier version of this file
  and of the speed-cost doc said "about half". That figure came from the 2-vCPU audit run (11,587 s total,
  ≈ $0.51 for 2 vCPU / 4 GiB), which is a different configuration.
- vCPU efficiency: 2 vCPU used 23,174 vCPU-s, 8 vCPU used 60,224 vCPU-s. Going from 2 to 8 cores gave only 1.54×
  more speed, so a gate-passing 2- or 4-vCPU configuration would be the cheap option, at 3+ h latency.
- The free tier (240,000 vCPU-s per month) covers about 4 matches at 8 vCPU, or about 10 at 2 vCPU.

The case for CPU is accuracy: it is the only configuration that has passed. It is not the cheaper choice at 8 vCPU.

## 4. What does not change

- Evidence contract, flags default-off, consent and kill switch.
- The INT8 detector and the E9 reader stay offline candidates. Each needs its own balanced_5.2 pass against the CPU
  FP32 reference in the pinned image before it could become the CPU default.
