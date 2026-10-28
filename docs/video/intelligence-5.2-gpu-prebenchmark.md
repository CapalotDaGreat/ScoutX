# Video Intelligence 5.2 — GPU pre-benchmark hardening (2026-10-29)

Branch `feature/player-tracking-v3`. No cloud resources were created, no quota was requested, no flag was changed and nothing was spent. The identity solver, box-steal safeguards, deterministic corrections, deferred OCR and the disabled night OCR are unchanged.

Status labels used below:

- **Implemented**: in the repository.
- **Tested**: an automated test passes here.
- **Verified**: run end to end on CPU here.
- **Blocked**: needs GPU hardware.

## Audit findings (fixed)

1. **The GPU image did not match the validated environment.**
   - It used Python 3.11 with open version ranges. Every 5.x result was measured on Python 3.13.17 with specific package versions.
   - torch 2.14.1 ships CUDA 13.0, so the host needs **NVIDIA driver ≥ 580**. The Deep Learning VM family `common-cu129-ubuntu-2204-nvidia-580` has it; the scripts now refuse older drivers.
2. **The OCR models were not hash-pinned.** Only YOLOX was. EasyOCR and docTR downloaded whatever their libraries served.
3. **The worker's segment cache trusted any existing `detections.npz`.**
   - A crashed extraction left crops in the segment directory, and the retry wrote into the same directory, so stale crops could be read alongside new detections.
   - A segment from other settings, or from an older worker, would be reused.
4. **The benchmark recorded no input identity.** It had no hash, frame count or HDR flag. It mixed wrong identity with overlapping annotations, had no executable pass/fail, and estimated cost only as runtime × rate.
5. **The validated reference proxy is HLG HDR (10-bit H.264).** The NVDEC/ffmpeg decode path uses a different colour conversion from the validated OpenCV path, so it must pass the accuracy gate before it can be used.

## Implemented and tested

| # | Change | Where | Status |
|---|---|---|---|
| 1 | **Accuracy gates.** Wrong identity is separated from overlap-ambiguous frames. Absolute rules plus rules against the baseline give exit code 3 on failure. A comparability check gives exit code 5 when the input, target, settings, model hashes or ground truth differ. Per-frame claims agreement is reported. | `bench/pp_bench.py`, `bench/gates/balanced_5.2.json`, `full_match_benchmark.py` | Tested; Verified (CPU rerun vs baseline: state and box agreement 1.000; gate passes) |
| 2 | **Reproducible CUDA image.** Ubuntu 24.04 with the same ffmpeg as the validated environment (6.1.1-3ubuntu5), uv-managed Python 3.13.17, and `requirements-gpu.lock` (89 packages, `--require-hashes`, versions identical to the CPU environment except `onnxruntime-gpu` and the uvicorn extras). Model files are verified against `bench/references/model_hashes.json`, and the build fails on mismatch. ONNX exports are made at build time. Provenance (commit, lock hash, build time, base image) is recorded. `python -m scoutx_tracker.envinfo --require-gpu` proves torch and ONNX Runtime really execute on CUDA. | `Dockerfile.tracker-gpu`, `requirements-gpu.{in,lock}`, `scoutx_tracker/envinfo.py` | Model check Verified (4 of 4 hashes match here); image **not built** (no Docker here) |
| 3 | **Input metadata:** container, codec, profile, pixel format, colour transfer and HDR, resolution, rotation, fps, frame count, duration, size, SHA-256 and effective processing fps, plus a byte-identity check against the reference proxy. | `scoutx_tracker/media_info.py`, `bench/references/img4809_proxy_10fps.json` | Tested; Verified |
| 4 | **Checkpoints.** Each chunk is written to a temporary directory and only renamed into place with a checkpoint (input hash, bounds, settings fingerprint, file hashes). On a rerun: valid chunks are reused, corrupt or interrupted chunks are redone, and chunks from other settings are refused (or replaced on request). Retries are bounded, with no half chunk left behind. There is a disk-space check per chunk, and cleanup is bounded to the store. Discovery is checkpointed too. A resumed run is marked `timingComplete: false`. The **production `/v3/tracking:extract` uses the same store**. | `scoutx_tracker/checkpoint.py`, `app/tracking_v3.py` | Tested; Verified |
| 5 | **Cost** split into: measured compute, VM uptime, overheads (driver wait, image build, video download), storage, transfer, and a recurring per-match estimate for 34, 90 and 140 minutes, from Zurich list prices fetched from Google's billing catalog. Every figure is labelled an ESTIMATE, never an invoice. | `bench/pp_bench.py`, `bench/vm_cost.py`, `bench/gcp/prices_europe-west6.json` | Tested |
| 6 | **GPU option matrix**, each option gated against the reference; nothing is auto-applied. Options: batch 4 / 8 / 16, ONNX Runtime CUDA instead of torch fp16, and NVDEC. Model reuse (persistent worker) is covered by `pipeline_benchmark.py` (cold vs warm resolve). | `bench/gpu_matrix.py` | Implemented; **Blocked** (no GPU) |
| 7 | **Regression tests**: checkpoint resume, corrupt and interrupted chunks, configuration mismatches, retries, disk space, accuracy separation, gates, comparability, agreement, cost, VM overheads, refusal on model or comparability failure, unvalidated mode, and the production extract endpoint never mixing attempts. | `tests/test_full_match_benchmark.py`, `tests/test_52.py` | 16 new tests pass |

**CPU verification (60 s IMG_4809 clip, 2 vCPU):**

1. **First run: refused by the disk check.** Only 0.8 GB was free; the check correctly asked for 2.2 GB. It wrote no partial output, and the discovery checkpoint was kept.
2. **Resume: completed and gate passed.** Discovery was reused. Measured **326 KB of checkpoint data per video-second**, so a 34-minute match needs about 0.7 GB and a 140-minute match about 2.7 GB.
3. **Full resume compared with the first run as baseline: identical claims.**
4. **A run with `SCOUTX_KEYFRAME_EVERY=2` against the same work directory: refused with exit code 5.**

On the clip, the one frame previously counted as false attribution is now classified as **overlap-ambiguous**: the box overlaps the target at 0.44 and a team-mate at 0.51. Wrong identity is 0 s.

Records: `workers/football-cv/bench/results/5.2/prebench_*.json`.

## Tests run here

| Suite | Result |
|---|---|
| Worker `pytest` | **542 passed** |
| `npm run test:unit` | **718 passed**, 0 failed |
| `npm run typecheck`, `npm run lint`, Functions build | passed |
| GPU, Docker build, cloud | **Blocked** |

## Blocked

- **GPU execution:** no hardware here. `GPUS_ALL_REGIONS` quota is 0 in `scoutx-230b0`.
- **Docker image build:** no daemon here, and Docker Hub is not reachable from this workspace.
- **Cloud Tasks, upload latency and parallel segments:** the benchmark is a single sequential worker.
- **CPU reference on the full 34-minute recording with this script:** it runs as step 3 of the VM session, in the same image.

## What the first GPU run should measure

Run it on the IMG_4809 10 fps proxy, in balanced mode, with one L4 in europe-west6:

1. **Environment proof.** `envinfo.json` must show torch and ONNX Runtime executing on CUDA, model hashes OK, driver ≥ 580, and the image commit and lock hash.
2. **Same-image CPU reference.** Full timing per stage, and accuracy against ground truth: this is the baseline.
3. **GPU run against it.**
   - **Gate:** wrong identity 0 s; IDF1 within 0.01 of the CPU reference; state and box agreement ≥ 0.97.
   - **Timings:** model load, discovery (time to first sighting), detection / decode / OCR / tracking / identity per stage, and total.
   - **Resources:** peak GPU memory (`nvidia-smi`), utilisation, and peak RAM.
4. **Cost.** Measured compute × USD 1.2036 per hour, and VM uptime with build, driver and download overheads separated. The recurring per-match estimate for 34, 90 and 140 minutes comes from the measured seconds per video second and is labelled an estimate.
5. **Option matrix (optional, `MATRIX=1`).** Batch 4/16, ONNX Runtime CUDA and NVDEC; keep only options that are faster and pass the gate.
6. **Next, not first:** the original 30 fps HEVC `IMG_4809.MOV`. It has 3× the stage-1 frames and its accuracy has not been validated.
