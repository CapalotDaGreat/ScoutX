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

## 1. "CPU passed" applies to one environment only

The passing reference is the recorded CPU run: 7,528.287 s for the 2,035 s IMG_4809 proxy, with its `environment`
block in `full_match.json` (packages, decoder cv2, ffmpeg, model hashes). A different CPU stack is a new
configuration. Today's workspace (torch 2.15, onnxruntime 1.32, OpenCV 5.1) is one example; it is newer than the
reference.

There is **no CPU tracker image** in the repo: `Dockerfile.tracker-gpu` installs CUDA wheels, and the old
`Dockerfile` is the 2.x reference worker. Required:
1. `Dockerfile.tracker-cpu`, pinned to the reference CPU package set (CPU wheels, same model files per
   `bench/references/model_hashes.json`, same decoder path).
2. Acceptance: inside that image, run `bench/full_match_benchmark.py` on the IMG_4809 proxy, then run
   `bench/compare_runs.py` against the recorded CPU reference with balanced_5.2. Exit 0 is required. Identical
   stage-1 arrays on the three labelled windows (1150, 1880, 1073) are the cheaper first check.
3. If the pinned set cannot be installed any more, the image becomes a new reference and needs the full-match run
   plus the label-based gate again. It must not silently inherit the old pass.

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

Before CPU can serve a match:
1. The pinned CPU image passes `compare_runs.py` + balanced_5.2 against the recorded 7,528.287 s CPU run (exit 0).
2. The deployed worker's request timeout is at least 1,800 s. The README example matches; no service has been deployed.
3. A non-resumed (`timingComplete=true`) resolve is measured at 2, 4 and 8 vCPU. The 775 s figure is not that measurement.
4. A resolve that cannot finish inside 1,680 s needs a different design (for example a Cloud Run job). Retrying it
   three times still cannot, because each attempt hits the same deadline.

## 3. Cost (list prices, europe-west6, instance-based billing)

$0.000018 per vCPU-s and $0.000002 per GiB-s, checked 2026-11-21.
- 2 vCPU / 4 GiB costs $0.000044/s, so the 7,528 s reference costs about **$0.33** in compute.
- A 47-min match is about $0.51 with assumed start overhead and 5 % retries (speed-cost doc §4).
- The free tier is 240,000 vCPU-s per month.

The recorded L4 run is $0.46–$0.93 per orchestration, depending on assumptions, and it failed the gate.

## 4. What does not change

- Evidence contract, flags default-off, consent and kill switch.
- The INT8 detector and the E9 reader stay offline candidates. Each needs its own balanced_5.2 pass against the CPU
  FP32 reference in the pinned image before it could become the CPU default.
