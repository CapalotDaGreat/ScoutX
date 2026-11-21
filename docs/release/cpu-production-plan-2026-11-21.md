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

## 2. Does CPU fit the existing orchestrator?

`functions/src/analysis/trackingOrchestrator.ts` already fans out:
- discovery in 600 s chunks;
- extraction in a 120 s first segment, then 300 s segments (up to 900 s for very long recordings);
- one resolve.

Each runs as a Cloud Task with a **1,800 s deadline**. Segments run in parallel on separate instances
(concurrency 1), so a CPU fleet shortens latency without new code.

Rates from the 2-vCPU reference: discovery 2,532 s, stage 1 about 8,280 s, resolve 775 s for 2,035 s of proxy.
Linear scaling is an assumption until measured.

| Task | Input | Estimated wall on 2 vCPU | Fits 1,800 s? |
|---|---|---|---|
| Discovery chunk | 600 s | ~750 s | Yes |
| Extract segment | 300 s | ~1,220 s | Yes, with ~1.5× margin; a 900 s segment (~3,660 s) does **not** fit |
| Resolve, 34-min match | whole match | 775 s | Yes |
| Resolve, 90-min match | whole match | ~2,050 s if linear | **No.** Needs measurement, more vCPU, or a resolve that runs as a Cloud Run job |

Open items, in order:
1. Measure segment extract and resolve on 4 and 8 vCPU in the pinned image. More vCPU only pays if
   wall time falls faster than the vCPU count rises.
2. Cap segments at 300 s on CPU (or derive the cap from measured throughput), so no extract task can exceed its
   deadline.
3. Decide the resolve path for matches over ~60 min, after it is measured.

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
