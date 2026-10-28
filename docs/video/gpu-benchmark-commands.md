# GPU benchmark: exact commands (5.2 pre-benchmark hardening)

None of this has run on a GPU yet. Every command that creates or uses billed cloud resources needs separate approval. That means the VM, the bucket upload and the quota request.

## 0. Prerequisites (project `scoutx-230b0`)

| Item | Status 2026-10-29 |
|---|---|
| Billing | enabled |
| Compute Engine API | enabled |
| L4 GPUs offered in europe-west6 (Zurich) | yes (zones b and c) |
| `NVIDIA_L4_GPUS` quota, europe-west6 | 1 |
| **`GPUS_ALL_REGIONS` quota** | **0 — blocks every GPU VM; request 1 (IAM & Admin → Quotas)** |
| List price, g2-standard-8 + L4 + 200 GB disk | USD 1.2036 per hour (`workers/football-cv/bench/gcp/prices_europe-west6.json`) |

**Input video.** Use `IMG_4809_proxy_10fps.mp4`, the validated reference. It is on the owner's computer in `Downloads/Mobile Devices/`. The benchmark checks it byte for byte against `bench/references/img4809_proxy_10fps.json` (SHA-256 `b1077af3…679c`, H.264 High 10, HLG HDR, 1920×1080, 10 fps, 20 350 frames, 2035 s).

## 1. One-shot run on Google Cloud (Cloud Shell)

```bash
gcloud config set project scoutx-230b0
gcloud storage buckets create gs://scoutx-230b0-benchmarks --location=europe-west6 \
  --uniform-bucket-level-access --public-access-prevention                 # billed storage (~USD 0.04/month for 1.4 GB)
gcloud storage cp IMG_4809_proxy_10fps.mp4 gs://scoutx-230b0-benchmarks/videos/   # or upload in the console
git clone --depth 1 -b feature/player-tracking-v3 https://github.com/CapalotDaGreat/ScoutX.git
bash ScoutX/workers/football-cv/bench/gcp/run_l4_benchmark.sh \
  gs://scoutx-230b0-benchmarks/videos/IMG_4809_proxy_10fps.mp4 gs://scoutx-230b0-benchmarks/results
# optional: MATRIX=1 (GPU option matrix) | BASELINE_GS=gs://.../cpu/full_match.json (skip the CPU reference)
```

**What one VM session does.** It is a `g2-standard-8` + L4 in `europe-west6-b`, capped at 5 h (`MAX_RUN`), with deletion at the cap.

1. **Boot and driver.** The Google Deep Learning VM image installs the NVIDIA driver. The script refuses a driver below 580.
2. **Image build.** It builds the pinned image (`Dockerfile.tracker-gpu`), then verifies that torch and ONNX Runtime really run on the GPU and that the model hashes match.
3. **CPU reference run.** Same image, same file and same settings.
4. **GPU run, gated against the CPU reference.**
5. **Optional option matrix.**
6. **Cost summary, upload and self-delete.** Partial results are also uploaded every 10 minutes to `…/<run id>/partial/`.

**Results** go to `~/pitchproof-benchmarks/<run id>/`:

- `cpu/` and `gpu/`, each with `full_match.json`, `full_match_claims.json`, `envinfo.json` and `image.json`;
- `timestamps.json` and `cost_summary.json`;
- `nvidia-smi.txt`, `commit.txt` and `run.log`.

**Expected spend.** At most 5 h × USD 1.20 = USD 6.02, plus about USD 0.04 of storage. The CPU reference is the longest part. Its 8-vCPU duration is not measured yet; on 2 vCPU here, stage 1 ran at about 6 s per video second.

## 2. Any CUDA host with Docker and the NVIDIA Container Toolkit

Run from the repository root:

```bash
CPU_REFERENCE=1 bash workers/football-cv/bench/run_gpu_match.sh /data/IMG_4809_proxy_10fps.mp4 /data/bench/cpu
BASELINE=/data/bench/cpu/full_match.json SKIP_GPU_BUILD=1 \
  bash workers/football-cv/bench/run_gpu_match.sh /data/IMG_4809_proxy_10fps.mp4 /data/bench/gpu
docker run --rm --gpus all -v /data:/data pitchproof-tracker-gpu:5.2 \
  python bench/gpu_matrix.py --video /data/IMG_4809_proxy_10fps.mp4 --out-dir /data/bench/matrix \
  --baseline /data/bench/cpu/full_match.json --prices bench/gcp/prices_europe-west6.json
```

If a run is interrupted, re-run the identical command. Valid stage-1 chunks in `<out>/work` are reused, and the JSON then says `timingComplete: false`. Re-run with a fresh output directory to get a full timing.

## 3. Exit codes (all scripts)

| Code | Meaning |
|---|---|
| 0 | ok |
| 2 | run failed (checkpoints kept for resume) |
| 3 | **accuracy gate failed**: the configuration is rejected |
| 4 | GPU provider or model-hash verification failed (no CPU fallback) |
| 5 | runs not comparable, or a checkpoint from other settings (never mixed) |
| 6 | not enough disk space |

## 4. Accuracy gate `bench/gates/balanced_5.2.json` (fixed before any GPU result)

**Absolute rules, for every run:**

- **Wrong identity = 0 s.** A claimed box on a labelled other player that does not also overlap the target.
- **Confirmed wrong identity = 0 s.**
- **Overlap-ambiguous ≤ 1.0 s.** A box between the target and an overlapping team-mate; it is reported separately and not counted as wrong identity.

**Rules against the CPU reference:**

| Measure | Allowed change |
|---|---|
| IDF1 | drop ≤ 0.01 |
| claimed recall | drop ≤ 0.02 |
| confirmed-correct time | drop ≤ 0.5 s |
| overlap-ambiguous time | rise ≤ 0.3 s |
| per-frame state agreement | ≥ 0.97 |
| box agreement | ≥ 0.97 |

**Comparable only when all of these are the same:**

- input SHA-256;
- target;
- chunk length and mode;
- engine version;
- model file hashes;
- ground-truth hash;
- stage-1 settings.

Device and backend are allowed to differ.
