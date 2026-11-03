# GPU FP32 accuracy comparison: verified preparation and approval proposal (2026-11-02)

**Status: proposal only.** There is no explicit approval for a new session. Nothing was created or uploaded, and no trial allocation was made. Approvals given for the 2026-11-01 attempts do not carry over.

## Read-only verification (2026-11-02)

**Cloud state** (`bench/results/5.3/fp32-proposal-20261102/cleanup_check.json`; gcloud, `--project=scoutx-230b0`, account clusiola4@gmail.com):

- 0 instances, 0 disks, 0 snapshots, 0 custom images.
- Bucket `gs://scoutx-230b0-benchmarks`: 111 objects (3.54 MiB), all under `results/`. No `runs/` or video objects.

**Quota:**

- `GPUS_ALL_REGIONS` 1, usage 0.
- `NVIDIA_L4_GPUS` 1, usage 0, in each of europe-west3, -west4 and -west6.

**Catalogue.** `nvidia-l4` and `g2-standard-8` are listed in europe-west3-a/b, europe-west4-a/b/c and europe-west6-b/c. Catalogue and quota do **not** prove capacity: every earlier L4 attempt (west4-a, west4-c, west6-b, west6-c, west3-a, west3-b) failed on resource availability.

**Image.** `common-cu129-ubuntu-2204-nvidia-580-v20261029` (project deeplearning-platform-release) is READY and is still the family's latest.

**Exact inputs:**

| Input | Value |
|---|---|
| Source | `git archive --format=tar 51d41c9f5f333c7e93a606b7181ba8cb1cee8eac workers/football-cv` → `308c07a4e209e7b1dbf344247ce9add9cd80f8366e37a7573e040251e795a62f` (re-verified today) |
| Video | `IMG_4809_proxy_10fps.mp4`, 1,413,632,177 bytes, `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c` |
| Models | 4 files, SHA-256 in `bench/references/model_hashes.json`; verified by `envinfo.verify_models` at build and at run time |
| Container | `Dockerfile.tracker-gpu` built on the VM from the archive, with `requirements-gpu.lock` and `GIT_COMMIT` build argument; the harness refuses a commit mismatch (`--expected-commit`) |

**Harness behaviour** (the committed startup script from the 2026-11-01 attempts, `fp32-20261101-f-51d41c9/`):

- `shutdown -h +175`, plus server-side `--max-run-duration=180m --instance-termination-action=DELETE`, with boot-disk auto-delete.
- Waits at most 20 min for the video. The video is uploaded only after the VM exists.
- Checks the source and video SHA, builds the image, then runs `fp32_comparison.py --execute --budget-sec 5400` under `timeout 5400`.
- Exports with a SHA-256 manifest and a `_DONE` marker, then the VM deletes itself.

**Per profile:**

- separate output directory and OCR cache;
- `precision_diagnostics.json` records every decoded-frame hash, the detector device/dtype/providers and the OCR devices/dtypes;
- device fallback, precision change or a CPU provider inside a GPU profile is a hard error.

**Known limitation.**

- Profile settings are applied through the harness's own environment adapter (`profile_env`).
- The decoder is OpenCV inside the GPU image. Its FFmpeg build may decode differently from both the Linux container and Windows. That is exactly why the CPU profiles must run **on the VM**, in the same image.

## What to run

**The original controlled comparison on the pinned baseline `51d41c9` only.**

- Do **not** add the exchange-split candidate (`93258f7`):
  - it is unrelated to the GPU gap mechanism;
  - it is default-off and still under validation;
  - it changed nothing on the default decoder's nine labelled intervals.
- Adding it would double the profiles and break the like-for-like comparison with the 2026-10-29 L4 run. It can be proposed separately later.
- **Keep both CPU profiles.** The existing local CPU pair ran in a different environment (different OpenCV/FFmpeg build). Decoded-pixel differences between builds are now demonstrated, so it is not comparable as a control.

**Profiles × windows:**

- 6 profiles: cpu-onnx, cpu-torch, gpu-fp16-b8, gpu-fp32-b8, gpu-fp32-b1, gpu-fp32-b8-repeat.
- 3 windows: gap1150 (1150–1180 s), 3144 (1880–1925 s), 1073 (1050–1085 s), automatic plus the recorded owner anchor for 1073, reported separately.

**Isolated pairs:**

| Pair | Isolates |
|---|---|
| cpu-onnx ↔ cpu-torch | backend |
| cpu-torch ↔ gpu-fp32-b1 | device |
| gpu-fp32-b8 ↔ gpu-fp16-b8 | precision |
| gpu-fp32-b1 ↔ gpu-fp32-b8 | batching |
| gpu-fp32-b8 ↔ repeat | repeatability |

## Proposal (needs your explicit approval)

| Item | Value |
|---|---|
| Region / primary zone | **europe-west4-b** (Netherlands; same region as the original L4 run; not tried before) |
| Fallback zones (in order; only after the previous request is confirmed failed and no VM exists) | europe-west4-c, then europe-west4-a (both stocked out on 2026-11-01). No other region or GPU type. |
| Live VMs | at most **one** |
| Commit | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` only |
| Machine / GPU / disk / image | g2-standard-8, 1× NVIDIA L4, 200 GB balanced PD (auto-delete), `common-cu129-ubuntu-2204-nvidia-580-v20261029` |
| Price (list, USD, before tax and discounts), refreshed **2026-11-03T12:25:49Z** | g2-standard-8 (8 × $0.026264 core + 32 GiB × $0.003077 RAM = $0.3086/h) + L4 $0.5886/h = **$0.8972/h compute**; 200 GiB balanced PD $0.0301/h; ephemeral external IPv4 $0.005/h. **Total $0.9323/h**, unchanged from 2026-11-02 apart from the IP, which is now included. |
| **Compute estimate** (not a measurement) | VM + GPU + disk + IP for **60–90 min: $0.93–$1.40** |
| **Compute at the maximum lifetime** | 180 min server-enforced (`--max-run-duration=180m`, then DELETE) → compute $2.69 + disk $0.09 + IP $0.02 = **$2.80** |
| Storage charges | video 1.32 GiB + source archive at $0.020/GiB-month (Standard, europe-west4): **< $0.01** if deleted the same day, **$0.03** if cleanup failed for a whole month. Operations (a few hundred Class A/B requests): < $0.01. |
| Network charges | Upload into the bucket: free (ingress). VM ↔ bucket in the same region: free. VM downloads (packages, image layers): free (ingress). **Billable:** download of the exported results from the bucket at $0.12/GiB after the free tier. ≤ 0.5 GiB expected → **≤ $0.06**. |
| **Total cost ceiling** (all of the above, worst case at the maximum lifetime) | **$2.89**. Proposed approval ceiling: **$3.00 before tax**. This is a ceiling, not an expected cost. |
| Pricing source | Cloud Billing Catalog API, read-only (`bench/results/5.3/fp32-proposal-20261102/fetch_pricing.py`). Retrieved **2026-11-03T12:25:49Z** → `pricing_20261103.json`. Compute Engine SKUs: CB1A-E671-2608 core, 8BFF-12ED-8AD9 RAM, E975-984D-BEFA L4, 5CFD-16B2-4F41 PD, C054-7F72-A02E external IP. Cloud Storage SKUs: 89D8-0CF9-9F2E storage, 22EB-AAE8-FBCD download. Assumptions: the 1.32 GiB video is stored briefly; results ≤ 0.5 GiB; no sustained-use or committed-use discount assumed; VAT not included. |
| Experiment | `fp32_comparison.py --execute --expected-commit 51d41c9… --budget-sec 5400` |
| Outputs | per profile × window: decoded-frame hashes, device/dtype/providers, detections, OCR evidence, tracklets, timelines, validation metrics, exit codes, timing; SHA-256 manifest |
| Export verification and cleanup | `_DONE` marker plus manifest check locally. Then delete the run's `runs/` objects (source + video), confirm VM and disk deletion (self-delete, with manual delete if needed), and verify by listing instances, disks and bucket. |
| Uncertain creation outcome | list instances in the zone before any retry; never a second create while one may exist |

To approve, please name the zone(s), the commit, the cost ceiling and the maximum lifetime, or change any of them. **No approval has been given.** Prices must be refreshed again if the session starts more than a few days after 2026-11-03.
