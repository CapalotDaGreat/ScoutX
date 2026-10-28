# PitchProof full-match GPU benchmark setup

This kit adds a **measured** sequential end-to-end worker benchmark. It processes the whole recording, unlike `pipeline_benchmark.py`, which processes one segment. It does not claim to measure Cloud Tasks scheduling, upload time, Cloud Run cold starts, or parallel production execution. No GPU or cloud account was available during preparation, so **no actual GPU measurements are claimed**.

## 1. GPU host

Recommended initial reference: a single NVIDIA L4 GPU with sufficient CPU/RAM and SSD storage, e.g. a Google Compute Engine G2 VM in a region with available quota. Set up a billing account, a budget alert, a quota limit and a short-lived VM. Install NVIDIA drivers, Docker Engine, NVIDIA Container Toolkit, and confirm `nvidia-smi` and `docker run --rm --gpus all ... nvidia-smi` work. **Never paste credentials or service-account keys into the repository.**

Official documentation: https://cloud.google.com/compute/docs/gpus ; https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/latest/install-guide.html ; https://cloud.google.com/products/calculator

## 2. Run from repository root

```bash
git checkout feature/player-tracking-v3
# Transfer a fully downloaded, authorised match to the GPU VM, e.g. /data/IMG_4809.MOV.
# Supply the current, all-in host rate from the cloud provider's price calculator.
bash workers/football-cv/bench/run_gpu_match.sh \
  /data/IMG_4809.MOV 20 orange /data/benchmarks/IMG_4809 1.00
```

The `1.00` is **only an illustrative argument**, not a verified cloud price. Replace it with the actual host USD/hour rate including GPU, CPU and RAM. For a different match use its real number and kit. To avoid a repeat image build, set `SKIP_GPU_BUILD=1` after the image exists. The script requires a CUDA-visible GPU and refuses silent CPU fallback.

Results:

- `/data/benchmarks/IMG_4809/full_match.json`: timings, hardware, GPU memory and cost.
- `full_match_claims.json`: the per-frame claims, as times, states and boxes only. It contains no images.

**Accuracy gate (IMG_4809 only).** Add the developer ground truth that ships in the image:

```bash
GROUND_TRUTH=bench/results/5.1/gt_img4809_intervals.json \
  bash workers/football-cv/bench/run_gpu_match.sh /data/IMG_4809.MOV 20 orange /data/benchmarks/IMG_4809 <rate>
```

The JSON then has an `accuracy` block: IDF1, recall and false attribution. Boxes are rescaled when the video is not 1920×1080.

- **Pass condition:** `falseAttributionSec` must be 0 in auto mode.
- **Recall:** compare it with a CPU run of this same script on the same file. The 0.918 IDF1 in the 5.2 report comes from the experiment harness, which uses denser OCR, so it is only a reference.
- **Other recordings:** there is no ground truth yet, so the run reports `full_match_claims.json` for a side-by-side check.

**Mode.** `SCOUTX_MODE` defaults to `balanced`. The script refuses accuracy-unvalidated modes unless `SCOUTX_ALLOW_UNVALIDATED_MODE=1` is set.

**GPU memory.** `gpuSampling` polls `nvidia-smi` once per second, so its peak covers torch, ONNX Runtime and the OCR models. `peakTorch*` fields count torch allocations only.

**Smoke test (CPU, not a GPU result).** On a 60 s clip of IMG_4809 in the 2 vCPU development container, the script completed in 358 s:

| Step | Wall time |
|---|---|
| Model load | 15 s |
| Discovery | 56 s (first sighting after 30 s) |
| Extraction | 248 s (detection 187 s) |
| Resolve | 38 s (OCR 28 s) |

Report invariants passed. Output: `workers/football-cv/bench/results/5.2/full_match_benchmark_cpu_smoke.json`.

Run 34-minute, 90-minute and 140-minute recordings **separately**. Measure each real recording; never present extrapolations as actual results. Compare accuracy against the validated CPU `balanced` outputs and existing fixtures. Keep `SCOUTX_KEYFRAME_EVERY=1` and avoid the unvalidated `fast` mode.

## 3. Interpreting costs

`computeUsd_estimate = (measuredProcessingSec + additionalBillableStartupSec) × allInHostUsdPerHour / 3600`.

This is a compute estimate for one sequential worker run. It excludes VM idle time, Cloud Tasks, Firebase Functions, Cloud Storage, upload/egress, taxes, discounts and provider-specific billing granularity. Track actual VM uptime and billing export to compute **real invoice cost per match**. Shut down or delete the VM after benchmarks; a running idle GPU VM continues to incur charges.

For a production comparison also measure actual wall-clock latency from user upload through first playable moment and completed report, using real Cloud Tasks and storage, and include queue and startup overhead. Do not mark production GPU performance validated until this has been done.

## 4. GPU readiness gates

- CUDA detected in PyTorch, Docker sees GPU.
- GPU image builds and OCR/detector model weights load.
- Full match finishes, report invariants pass.
- Accuracy does not regress compared with 5.2 balanced mode.
- Report includes actual duration, stage timings, GPU hardware and operator-supplied rate.
- Cloud and device integration remain separate blocked gates until exercised.
