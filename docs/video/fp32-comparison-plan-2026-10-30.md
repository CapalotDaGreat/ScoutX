# FP32 accuracy-gap investigation: prepared, awaiting VM approval

Preparation began 2026-10-30; final review 2026-11-01 (Europe/Zurich).

Base: `c6c4320651d68add786d7f2eb58bb66f36df97bf`. The approval request supplies
the exact new pushed commit containing this harness. No VM, disk, snapshot or
bucket video was created during preparation. This is an accuracy investigation,
not an optimisation phase or production release.

## Proposed allocation and estimate

- Project: `scoutx-230b0`.
- Region/zone: **europe-west4 / europe-west4-c**, repeating the original L4 region.
- One `g2-standard-8`: 8 vCPU, 32 GiB, one NVIDIA L4; 200 GB balanced disk.
- Planning allowance: **60–90 minutes**, not a measured runtime prediction.
- **Maximum VM lifetime: three hours**, enforced with `--max-run-duration=180m
  --instance-termination-action=DELETE`, plus early teardown on completion/error.
- Retained 2026-10-29 regional price snapshot: **$0.9273387923/hour**, including
  the stated disk. Expected compute estimate **$0.93–$1.39**; three-hour compute
  estimate **$2.78**. Taxes, network transfers and bucket storage are additional.
  This is an estimate, not a billing cap. The CHF 15 alert remains an alert.
- Present capacity is unverified. Historical Zurich unavailability does not prove
  current unavailability; neither quota nor an accelerator catalog proves stock.
  Do not silently change region if the approved zone cannot allocate a VM.

No creation or upload command will run before explicit approval of the region,
exact commit and cost. The original bucket video was deleted; after approval the
exact local reference must be uploaded temporarily for this session, then deleted
again after result verification. Keep results, remove the VM/disk, and verify
project-wide instances/disks/snapshots after teardown.

## Controlled matrix

All six profiles run the same three previously examined **development** windows:
1150–1180 s (287 target-visible labelled frames), 1880–1925 s (54) and
1050–1085 s (31). Automatic
and recorded-owner-anchor conditions stay separate. These 110 seconds are not
independent held-out or full-match validation, and their timings are not scaled
to a match.

The historical full-match labels isolate **65 CPU-correct/GPU-missed frames in
1150–1180 s** (6.5 s): 233 CPU-correct versus 168 GPU-correct target-labelled
frames. Another interval has one GPU-only correct frame, accounting for the net
6.4 s coverage loss. Selection uses authoritative `gt.times` values, which
can differ by 0.1 s from `frameIndex / fps`. The new `gap1150` fixture copies
existing boxes/labels with that mapping; it adds no new annotation.
See [gap-window selection](../../workers/football-cv/bench/results/5.3/fp32_gap_window_selection_20261030.json).
This is diagnostic selection from known failures, not a new holdout.
A standalone window can have different identity context from a full recording;
per-layer parity is the primary causal evidence if the identity gap does not recur.

1. CPU ONNX FP32, batch 1: current default CPU backend, explicitly CPU provider.
2. CPU Torch FP32, batch 1: isolates the ONNX/Torch backend difference.
3. CUDA Torch FP16, batch 8: controlled GPU reference.
4. CUDA Torch **FP32, batch 8**: first precision candidate; batch and OCR unchanged.
5. CUDA Torch FP32, batch 1: isolates batching.
6. Repeat CUDA FP32 batch 8 with fresh caches: tests repeatability.

GPU OCR retains FP32 model weights on CUDA in all GPU profiles. CPU profiles use FP32 CPU OCR.
Both actual recogniser devices/dtypes are checked; silent fallback aborts. A fixed
96-crop JPEG corpus from the CPU ONNX output, including retained crops at 1155.4,
1902.6 and 1073.4 s, is replayed unchanged through each OCR device. File and decoded-pixel
hashes bind each crop, and its box/time/quality/padding metadata allows recreation.
CPU-pipeline accepted two-digit reads are mandatory corpus entries, including
the four retained “20” crops found in the local gap-window baseline. This is a
diagnostic enrichment, not an unbiased estimate of OCR accuracy.
CPU-accepted numbers missing or different on GPU are explicitly listed.

Every profile has its own process/output directory/OCR cache. Common controls:
balanced mode; same pinned model files and image; OpenCV BGR decoding; YOLOX-s
1280 (discovery 416); stride/keyframe 1; existing quality-92 JPEG; seed 0; TF32
disabled; deterministic Torch algorithms. Frame pixel hashes must match where
the profiles decode the same source frame. Configured nondeterministic operations
raise rather than silently changing controls. All existing identity thresholds,
box-steal/contact guards, deferred-OCR rules and disabled night OCR remain intact.

The harness changes YOLOX constructor arguments and adds logging **within the
benchmark child process only**. Production tracking modules/defaults/flags are unchanged.
The benchmark Dockerfile now includes the three numeric JSON label fixtures the
harness needs; it adds no footage/crops, models or package changes.
The runtime adapter's source hash and effective detector dtype/device are recorded
alongside the ordinary engine/evaluator hashes. No resumed extraction is used.
The ordinary engine checkpoint settings do not encode this process-local precision
override: interpret them together with the adapter SHA and explicit profile.
Profiles never reuse one another's checkpoints or caches.

Explicit cv2 and deterministic controls differ from the historical full-match
run, as does the new contact-entry guard. That run is context, not a controlled
reference for attributing a change here. This first session will not establish
full-match parity or justify deployment, even if its development gates pass.

## Evidence and interpretation

Keep each profile's discovery evidence, `detections.npz`, tracklet arrays, OCR
caches, result/timeline JSON/NPZ, effective environment/model hashes and logs.
`precision_diagnostics.json` records decoded-frame pixel hashes, PARSeq patch
hashes/text/confidences, EasyOCR outputs, final read decisions and devices/dtypes.
`comparison.json` includes detector counts/one-to-one box agreement, changed
frames, state/box agreement, existing gate results and explicit unmatched claims.

Export only numeric/text JSON, NPZ, NPY and logs to the private results folder;
exclude video and every crop/image. Media exists only on the temporary VM disk.
Footage is evaluation-only; no external AI provider or model training is added.

Interpretation order:

- FP16 versus FP32 at batch 8 isolates detector precision with GPU OCR fixed.
- FP32 batch 8 versus batch 1 isolates batching.
- CPU ONNX versus CPU Torch isolates CPU backend effects.
- Identical-crop CPU/GPU OCR identifies lost number reads independently of boxes.
- Identical decoded-pixel hashes rule out the controlled decode/colour path for
  that comparison. A mismatch invalidates its causal interpretation.
- Fresh FP32 repeat exposes residual nondeterminism; failures are retained.

The fixed corpus and these labels do not prove that all CPU reads survive on all
footage. The output always has `productionApproval=false`. An all-abstaining
result can satisfy a safety gate without establishing useful identification.

## Reproduction on the approved host

First build the pinned Docker image from the **approved exact commit**, passing
that SHA via `GIT_COMMIT`; verify image labels, lock/model hashes, GCC, driver
>=580, Torch CUDA and ONNX GPU execution before starting the matrix. Use the same
image for all profiles. Set Docker's output mount to the invoking UID/GID to avoid
the previous `/out/comparison.json` permissions failure.

The following starts inference inside an existing approved VM; it does not create
the VM. `APPROVED_COMMIT` must be the full SHA in the approval request.

```bash
mkdir -p "$OUT"
docker run --rm --gpus all --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$VIDEO_DIR:/videos:ro" -v "$OUT:/out" pitchproof-tracker-gpu:5.2 \
  python bench/fp32_comparison.py --execute --expected-commit "$APPROVED_COMMIT" \
  --video /videos/IMG_4809_proxy_10fps.mp4 --out-dir /out/fp32 --budget-sec 5400
```

The matrix refuses a different image commit, different reference-file bytes,
missing model hashes or missing GPU providers. It allows 90 minutes of inference
within the three-hour VM deadline, leaving time for provisioning/build, export,
verification and teardown. A timeout produces an incomplete session; it cannot
be presented as a complete measurement. Export partial numeric evidence on any
failure, then tear down rather than launching speculative retries.

Plan-only command (no GPU/inference/cloud operations):

```powershell
python bench/fp32_comparison.py --out-dir NEW_PLAN_DIRECTORY
```

Prepared machine-readable plan:
[plan.json](../../workers/football-cv/bench/results/5.3/fp32-comparison-preparation/plan.json).
CPU adapter smoke evidence:
[fp32_prepare_cpu_smoke_20261030.json](../../workers/football-cv/bench/results/5.3/fp32_prepare_cpu_smoke_20261030.json).
CUDA execution remains unverified until the approved session runs.

Local preparation checks: 589 worker tests passed, zero skipped (three existing
ONNX deprecation warnings). A full fresh CPU ONNX run on `gap1150` completed in
332.039 seconds, with CPU providers and FP32 recogniser weights verified. On its
287 target-visible development labels it correctly claims 152 frames (132
confirmed), abstains on 128, and has **seven unmatched target-visible claims**.
Across all 300 labelled samples there are eight unmatched claims. Matched wrong
identity and ambiguous overlap are zero; unmatched claims remain unresolved.
These are
standalone-window results, not the historical full-match numbers or CUDA parity.
Full local frame/reader logging is retained in
[local CPU diagnostics](../../workers/football-cv/bench/results/5.3/fp32-comparison-preparation/local-cpu-gap1150/precision_diagnostics.json)
and [validation manifest](../../workers/football-cv/bench/results/5.3/fp32-comparison-preparation/local-cpu-gap1150/validation.json).
The new derived label fixture and its time mapping are covered by regression tests.
The final enriched 96-crop CPU replay retained all four pipeline “20” reads
(zero CPU replay losses). Earlier uniform-corpus diagnostics are kept as a
labelled preparation artifact, not used as the proposed corpus. The full local
window predates only the corpus-selection refinement; the final enriched replay
and final tests bind the updated harness hash. No production engine code changed.
Linux Docker image execution and CUDA profiles remain unverified locally; the
Dockerfile now explicitly copies the required numeric label fixtures.

## Local CPU half of the matrix (2026-11-01): profiles 1–2 run, GPU profiles 3–6 not run

L4 capacity was unavailable in every approved zone, so only the two CPU profiles were run. They used the pinned harness unchanged, in the Linux development container:

- Python 3.13.17, torch 2.14.1 (CPU), ONNX Runtime 1.29.0, OpenCV 4.14.0;
- 2 vCPU with `OMP_NUM_THREADS=2`;
- the code from `51d41c9`, unchanged up to `95cf3a8`;
- all three windows, using `profile_env`;
- the exact reference bytes `b1077af3…`.

**Reference bytes.** The container's own remux differed from the reference file only in the 13-byte MP4 encoder tag (`Lavf60.16.100` vs `Lavf58.76.100`). Restoring that tag reproduced SHA `b1077af3…`, and the harness then accepted the file.

**Run times:**

| Profile | Wall time |
|---|---|
| cpu-onnx | 781.7 s |
| cpu-onnx, OCR corpus only | 20.4 s |
| cpu-torch | 903.2 s |

Model loading is included and the work runs sequentially. These are development-window timings and are not scaled to a match.

**CPU ONNX vs CPU Torch: no backend effect at any layer.**

- **Decoding:** 1,103 common frames, 0 pixel-hash mismatches.
- **Detection:** person detections are the same count in every window (6,407 / 9,026 / 5,838). All match one to one, with mean IoU 1.0 and at most 0.0016 px coordinate difference. They are not bit-identical.
- **OCR:** the fixed 96-crop corpus is identical, and no CPU-accepted read was lost.
- **Identity:** timelines are identical in every window and mode (state agreement 1.0).

Accuracy, the same for both profiles:

| Window | Mode | Correct | Abstained | Unmatched claims | Wrong identity | Overlap-ambiguous | IDF1 |
|---|---|---|---|---|---|---|---|
| 1150–1180 (287 target frames) | automatic | 228 | 46 | 13 | 0 s | 0 s | 0.885 |
| 1880–1925 (54) | automatic | 0 | 54 | 0 | 0 s | 0 s | 0 |
| 1050–1085 (31) | automatic | 0 | 31 | 0 | 0 s | 0 s | 0 |
| 1050–1085 (31) | owner anchor 1073.4 s | 26 | 5 | 0 | 0 s | 0 s | 0.912 |

The 13 unmatched target-frame claims in 1150–1180 still need review; they are not counted as correct.

**Evaluation fix (`pp_bench.agreement_failures`).**

- **Problem:** the gate had marked the two all-abstaining automatic windows as failed with "boxAgreementWhenBothClaim: missing", although both runs were identical.
- **Fix:** box agreement is now treated as not applicable **only** when frames were compared and neither run claimed any of them.
- **Kept as failures:** one-sided claims, zero compared frames and a missing comparison. State agreement is still required.
- **Result:** with the fix, all four CPU-pair conditions pass. A regression test covers both the fixed case and the failure cases.
- **Inference unchanged:** this changes evaluation tooling only. The approved GPU source stays `51d41c9`, and its comparison can be re-evaluated offline with the fixed tooling.

**Cross-environment observation (not a controlled comparison).** On the same 1150–1180 window and harness, this Linux run claims 228/287 correct with 46 abstentions. The earlier Windows CPU ONNX run reported 152 correct, 128 abstentions and 7 unmatched. That run used Python 3.12, torch 2.8 and OpenCV 5.0.

- **What it shows:** environment and package differences alone can move window recall a lot, with no GPU involved.
- **What is unknown:** this pair was not controlled, so the layer responsible (decode, OCR or detector numerics) is not established. Comparing the two runs' `precision_diagnostics` (pixel hashes, corpus reads) is the cheapest next diagnostic.
- **Why it matters for the GPU:** it makes "different numerics/libraries change OCR acceptance" a plausible explanation for the L4 gap. That explanation is a hypothesis, not a finding.

**Still unknown:** the FP16, batching and CUDA-device effects. The GPU accuracy gap remains unexplained.

Evidence: [fp32-local-cpu-pair-20261101/](../../workers/football-cv/bench/results/5.3/fp32-local-cpu-pair-20261101/). It contains JSON only, with no footage, crops or images.
