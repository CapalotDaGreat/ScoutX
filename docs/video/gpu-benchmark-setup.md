# PitchProof full-match GPU benchmark setup

This kit adds a **measured** sequential end-to-end worker benchmark. It does not claim to measure Cloud Tasks scheduling, upload time, Cloud Run cold starts, or parallel production execution. No GPU or cloud account was available during preparation, so **no actual GPU measurements are claimed**.

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

Results: `/data/benchmarks/IMG_4809/full_match.json`.

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
