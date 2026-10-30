# Video Intelligence 5.3b: benchmark reconciliation and accuracy decision

Date: 2026-10-30. Branch: `codex/gpu-benchmark-5-3`; starting commit `883229e`.
Engine version remains 5.2.0, worker football-cv/0.9.0. **5.3 is not accepted.**
The completed L4 candidate fails its CPU-relative accuracy gate. Local acquisition
and crop-format experiments cannot substitute for that gate or independent validation.
No deployment, release flag, confidence threshold or gate threshold was changed.

## Branch and environment reconciliation

After fetching the remote, `feature/player-tracking-v3` was still at
`3b8f3bbded2b12c5fe020d95ef8b1270df107aa7`. It is an ancestor of this branch:
`git rev-list --left-right --count HEAD...<remote>/feature/player-tracking-v3`
returned `4 0`. The feature branch has no unique commits. The four additional
commits are `0bc339e` (pricing/comparison), `699c0c7` (decoder lifecycle and OCR
budgets), `0afde9e` (reliability documentation), and `883229e` (compiler runtime).
`git merge --ff-only <remote>/feature/player-tracking-v3` reported already up to date.
Existing acquisition and evaluation work was retained; no tests were dropped.

Windows evaluation uses the isolated Python 3.12.10 overlay described in
[runtime_restored_20261030.json](../../workers/football-cv/bench/results/5.3/runtime_restored_20261030.json):
Torch 2.8.0+cpu, ONNX Runtime 1.29.0, docTR 1.1.0, EasyOCR 1.7.2,
OpenCV 5.0.0, NumPy 2.5.3, SciPy 1.18.1, FFmpeg 9.0.2.
This differs from the cloud image and is not a CUDA equivalence test.

Immutable archive collection in the restored Python environment found **544 tests
at 3b8f3bb** and **555 at 883229e**. The latter matches the previously reported
550 passed plus five skipped. The four intervening commits account for 11 new
collected cases; local evaluation/guard/report changes add 24 further cases.
The earlier 543-passed report still lacks its original command and skip summary,
so its exact outcome cannot be reconstructed from a collection count alone.
See [collection reconciliation](../../workers/football-cv/bench/results/5.3/test_collection_reconciliation_20261030.json).
A run without model/tool
environment variables gave 571 passed/4 skipped; it is superseded by the restored
environment run recorded below. No missing tests are inferred from totals alone.

## What actually ran on L4

Raw evidence is in
[l4-20261029-netherlands](../../workers/football-cv/bench/results/5.3/l4-20261029-netherlands/).
There was one Netherlands VM session in europe-west4-c on 2026-10-29.
Recorded boot/end: 14:56:37–17:50:02 UTC, 2.89028 hours. This work created no VM.
The earlier progress report's claim that no GPU instance launched was incorrect.

The original image records source commit `3b8f3bb`, not a build of every subsequent
local change. Recovery image ID is
`sha256:03ebec3941e727f60ea8f45f69c45164587ef78b268233415ae1b9f441a99b8e`;
both completed runs have identical image metadata and a `runtime-patch=883229e`
label. That label identifies the compiler patch; it does not establish that all
source from 883229e was copied into the image.

The first GPU run exited 2: `Failed to find C compiler`. The first CPU run exited
2 after an operator/time-budget interruption. Recovery stopped that CPU container,
archived both first attempts, and built `Dockerfile.compiler` FROM the original
image with `apt-get install --no-install-recommends build-essential`. It did not
run pip, replace model weights or edit identity settings. Both retries exited 0.
The build log records 54 newly installed system packages, zero upgraded packages,
including GCC 13.3.0 and libc6 development headers 2.39-0ubuntu8.9.
GPU retry: 15:12:32–15:43:54 UTC; CPU retry: 15:43:56–17:49:51 UTC.
The original runner subsequently could not write `/out/comparison.json` or
`/out/cost_summary.json` because of permissions; the missing comparison did not
mean that inference had not completed.

Recorded Python is 3.13.17, Torch 2.14.1+cu130, CUDA 13.0, driver 580.178.04,
docTR 1.1.0, EasyOCR 1.7.2, ONNX Runtime GPU 1.29.0, FFmpeg 6.1.1.
The image lock SHA is `7a7dfa9601658ffe0c00fb403f95e60c46d2badd482bc41bfdaf6824f3e96389`.
All recorded package versions match between completed runs; all four model hashes
match their pins. Full post-recovery `pip freeze` was not retained, so equality of
unreported packages is supported by image identity/build recipe rather than a new
exhaustive installed-file audit.

Both runs used the same 2035 s, 20,350-frame HLG proxy and the same labels
`gt_img4809_intervals.json` (SHA `36b16fbae5091ca524f1c47c697e56db6da2d191e79dc0ab4f880815dc995078`).
The cloud container-file SHA is `007cd4e55f918b934f20401f3fa7621a51d5a44156cda03a62f72588195bf9aa`,
whereas the local file SHA is `b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c`.
Both have the pinned video-stream SHA
`c0a4850861e118cc3b4753dc23ddab56729f5f1cdead26aaa3cbd5d3b6f3a66b`.
These are the same validated video stream, not byte-identical containers.

Both used balanced mode, 300 s chunks, YOLOX-s at 1280, stride 1,
discovery at 416, backend auto, resume policy fail, and seven fresh chunks with
no resumed chunks. GPU/CPU stage1 fingerprints intentionally differ by device:
`2306a457eecc16b027699132a15d0165a9567807078ca09044f340402db07952` /
`4d56ec05559190ec7c1ad5e2321865f7a003299282788fb8f21fa47893fd1c06`.
Unspecified environment values use image defaults. CUDA uses Torch FP16 and
batch 8; CPU auto selects ONNX Runtime CPU FP32 and batch 1. This is a comparison
of the actual default pipelines, not a precision/backend-controlled experiment.

## Offline gate and accuracy scope

Reproduction from `workers/football-cv`:

```powershell
python bench/compare_runs.py --reference bench/results/5.3/l4-20261029-netherlands/cpu/full_match.json --candidate bench/results/5.3/l4-20261029-netherlands/gpu/full_match.json --gate bench/gates/balanced_5.2.json --out bench/results/5.3/l4-20261029-netherlands/comparison.json
python bench/reconcile_l4.py --root bench/results/5.3/l4-20261029-netherlands --out bench/results/5.3/l4_reconciliation_20261030.json
```

Comparison exits 3 (expected gate failure); comparability checks pass.
Evaluation fixes require finite numeric gate inputs, reject incomplete candidates,
require configured baseline agreement and match timestamps one-to-one. Missing
samples count against state agreement over the timeline union. These repairs make
evidence requirements stricter; threshold files are unchanged. The benchmark also
records peak process memory on Windows without depending on Unix `resource`.
Accuracy refers to **50.4 seconds of target-visible developer interval labels**
within this 2035 s recording, not densely labelled full-recording identity truth.
This is a development set, not an independent holdout.

| Measure | CPU | L4 GPU |
| --- | ---: | ---: |
| Complete measured wall seconds | 7528.287 | 1853.860 |
| Correct claimed labelled seconds | 31.3 | 24.9 |
| Correct confirmed labelled seconds | 10.5 | 10.0 |
| Labelled wrong identity / confirmed wrong / ambiguous overlap seconds | 0 / 0 / 0 | 0 / 0 / 0 |
| Claimed recall | 0.621 | 0.494 |
| IDF1 | 0.766 | 0.661 |
| Absolute safety gate | Pass | Pass |
| GPU relative to CPU gate | Reference | **Fail** |

Measured wall speedup is 4.06×. Relative failures are IDF1 drop >0.01,
recall drop >0.02, and state agreement below 0.97. The 0.5 s confirmed-correct
drop is reported; it is not an additional failure under the current gate's
allowed confirmed-time tolerance. Gates were not relaxed.

Agreement: 11,631 paired samples, 13,933 union samples; 1,013 CPU-only and 1,289
GPU-only samples. State agreement including missing samples is 0.7912; box
agreement when both claim is 0.9731. There are 310 CPU-only claims and
416 GPU-only claims, including unpaired timestamps. These differences are not automatically wrong
identities. Unlabelled/unmatched predictions do not acquire correct-identity
labels by agreeing with another run.

The explicit interval-label outcome audit finds CPU: 313 correct, 160 abstained
and 31 unmatched on the 504 target-visible labelled frames; GPU: 249 correct,
229 abstained and 26 unmatched. Across all 2,652 labelled frame samples, CPU has
88 unmatched claims and 131 claims matching indeterminate labels; GPU has 80
and 136 respectively. Neither has a matched wrong-player claim in those labels.
These unresolved outcomes limit what the absolute safety pass establishes.
See [l4_claim_outcomes_20261030.json](../../workers/football-cv/bench/results/5.3/l4_claim_outcomes_20261030.json).

## Accuracy-gap diagnosis

[l4_reconciliation_20261030.json](../../workers/football-cv/bench/results/5.3/l4_reconciliation_20261030.json)
contains each divergent state sample and counts by 300 s source interval.
Divergence occurs throughout the recording, not only at 31:44. Discovery has
1,916 CPU versus 1,915 GPU candidates, 2,961 versus 2,954 reads and 10 versus 11
sightings. Final identity selection has 427 versus 418 pieces, with seven number
sightings in each. Equal sighting counts do not establish equal reads or pieces.

The bucket does **not** contain per-chunk detections, embeddings, tracklet caches
or OCR caches. It retains aggregate per-chunk stage timers and claims, not the
inputs needed to attribute the gap to individual number reads. Consequently:

- Detector precision/backend and batch differ and can change boxes, NMS and crops.
- PARSeq/EasyOCR execute on different devices and can change borderline reads.
- Both inputs have identical encoded video streams and no configured hardware
  decoder override, but decoded-pixel equivalence was not captured.
- No repeated identical GPU runs were retained; nondeterminism is unmeasured.

**Root cause remains unresolved.** No claim that FP16 caused the loss is justified.
The first controlled GPU candidate should use the existing YOLOX constructor's
`half=False`, first holding batch at 8, then isolating batch/backend and OCR using
retained identical crops. Capture boxes, scores, crop pixel hashes and all reader
outputs so that GPU cannot silently lose a CPU number read. No CUDA hardware is
available locally, and no new GPU session has been started or authorised.

## Owner-anchor contact entry

Fresh local development window: 1050–1085 s (350 frames, 31 target-labelled
frames/3.1 s, 83 labelled frame samples overall). Before the patch, the recorded
owner anchor at 1073.4 s produced five wrong-LIKELY frames, 1072.7–1073.1 s.
The four correctly confirmed target frames at 1073.3–1073.6 s remained correct.

Trace: wrong piece tid244 spans 1072.7–1073.2, then a proximity-only handoff enters
owner-bearing contact piece tid214 at 1073.3–1073.6. The latter's actual
tracker predecessor is tid213, not tid244 (also verified in the fresh rerun).
Backward anchored propagation crossed this
unrelated entry, assigning `anchored` evidence/confidence >=0.8 to tid244 and an
earlier tid83 piece. There was no verified clear contact link from tid244 to tid214.
This is an anchored-continuity boundary failure, not evidence that confirmation
thresholds should fall. The existing negative labels and body crop comparison
support treating it as wrong attribution rather than relabelling the teammate.

The narrow guard prevents hard evidence propagating through a contact entry from
any piece other than its recorded predecessor. Actual predecessor transitions and
existing explicit pre/post contact rules keep their safeguards. It applies to
number evidence and owner evidence in both propagation directions. Box-steal
splits, contact splits, deterministic corrections, deferred OCR and disabled
night OCR remain intact. Two synthetic tests distinguish actual and unrelated
predecessors; existing 5.1/5.2 failure-reproduction tests also remain valid.

Body-only crop sheet (local, not committed as footage):
`C:\ZLI\M335\ScoutX\.local\5.3b-owner-crops\owner-transition-bodies.png`.
The full trace is retained as numerical evidence in the results directory.

Archived-feature replays after the patch: 1880–1925 s automatic 53/54 correct,
1050–1085 s automatic abstains on 31/31 target labels, owner-assisted 28/31
correct; zero labelled wrong identity or ambiguous overlap. These are archived
developer regressions, not fresh inference or independent holdout accuracy.

Fresh decoding/detection/discovery/OCR rerun completed in 698.197 s for these two
windows combined (80 s of source footage; not extrapolated to a match).
At 1880–1925 s, automatic remains 0/54 correct and abstains on all target labels.
At 1050–1085 s, automatic remains 0/31; owner-assisted retains 4/31 correct,
all four confirmed, with **zero wrong attribution**, zero ambiguous overlap and
27 target-labelled abstentions. Across all 83 labelled frame samples the owner
condition has four correct and 79 abstentions, with no unmatched claims.
The five formerly wrong-LIKELY frames are now unclaimed. The 31:44 automatic
condition abstains on all 248 labelled samples. This fixes the demonstrated
boundary failure without increasing recall or establishing general tracking quality.
Source/model/engine/label hashes were checked before and after the run. Results:
[fresh manifest](../../workers/football-cv/bench/results/5.3/fresh_jpeg_windows_5.3b_20261030.json),
[explicit outcomes](../../workers/football-cv/bench/results/5.3/fresh_claim_outcomes_5.3b_20261030.json).
The earlier held-out audit windows 129–159, 819–849, 893–923 and 1988–2018 s have
historical claim-sheet audits, but reusable dense boxes/stage inputs for a current
paired rerun were not retained here. The 1050–1080 s window became a regression
and is no longer held out. Historical audits are not claimed as new validation;
independent current-engine audit remains a release blocker.

## Crop format: experimental, not promoted

Original retained-stage experiment on the same two development windows:
PNG at 1880–1925 s gives 40/54 correct target-labelled frames, 26 confirmed,
IDF1 0.851, no matched wrong identity or ambiguous overlap. It has **12 unmatched
target-visible-frame claims and 125 unmatched claims across all labelled samples**.
Automatic 1050–1085 s still abstains on all 31 target labels; PNG alone did not
remove the original owner-assisted 0.5 s wrong interval.

All 12 unmatched target-visible samples were inspected side-by-side using
same-source claim and target body crops (upper 35% removed). Clothing/body
continuity appears consistent, but annotation geometry mismatch is suspected.
The existing labels already say target-visible; no new independent identity
label was established and no ground-truth box was replaced with a prediction.
All 12 remain unmatched. The other 113 unmatched samples have not been resolved.
See [crop_review_5.3b_20261030.json](../../workers/football-cv/bench/results/5.3/crop_review_5.3b_20261030.json).

| Retained crop storage only | JPEG | PNG |
| --- | ---: | ---: |
| 1880–1925 s, 1153 crops | 208,593 bytes/video-s | 838,307 bytes/video-s |
| 1050–1085 s, 1182 crops | 340,098 bytes/video-s | 1,391,782 bytes/video-s |

PNG is 4.02×/4.09× JPEG bytes for these same retained crops. The earlier measured
326 KB/video-s JPEG baseline includes a different run/scope; it is not a PNG
full-match measurement. Cloud total stage1 disk rates are also different scopes.
Initial PNG number-stage times were 62.4 s / 81.2 s; reconstructed JPEG reports
used warm caches (0.2 s) and cannot establish OCR speedup or regression. The fresh
JPEG rerun supplies cold numbers-stage timing separately. No crop-window timing
is extrapolated to a match. Fresh full-match PNG accuracy and controlled cold
OCR timing are **not established**. Fresh JPEG numbers-stage timings were
40.3 s / 59.2 s, separately measured from the earlier PNG experiment and not a
controlled codec-only comparison. Unresolved unmatched claims and missing
full-match/independent/GPU validation prevent adoption; production stays JPEG.

After the fresh JPEG rerun, every retained crop was regenerated again as PNG from
the same verified source, with new independent OCR caches and current code. This
again yields 40/54 correct and 26 confirmed at 31:44 with zero matched wrong
identity and the same 12/125 unmatched claims. At 17:53 automatic abstains on
all 31 target labels; owner assistance retains four confirmed correct frames,
79 abstentions across 83 labelled samples and no unmatched or wrong claim.
New-cache PNG numbers stages took 66.7 s / 83.8 s; the two PNG windows ran
concurrently, so these are observed stage times, not a controlled codec-only
speed comparison with sequential JPEG. Detection/features were retained, so these
are not new full end-to-end or full-match measurements. See
[fresh-baseline PNG outcomes](../../workers/football-cv/bench/results/5.3/fresh_png_claim_outcomes_5.3b_20261030.json)
and the two `lossless_fresh_*_5.3b_20261030.json` manifests.

The current guard was also rerun with retained PNG detections and partial OCR
caches, allowing all additional reads to complete. It preserves 40/54 correct,
26 confirmed and the same 12/125 unmatched claims at 31:44, with zero matched
wrong identity; 17:53 automatic abstains and owner-assisted retains four confirmed
correct frames with zero matched wrong identity. `ocrDeferred=0` in all three.
This is a retained-data recheck, not fresh detector inference or complete timing.
See [PNG recheck](../../workers/football-cv/bench/results/5.3/png_guard_recheck_20261030.json).

A separate zero-new-OCR probe at 31:44 deferred 10 newly requested reads and
produced 25 wrong-LIKELY labelled frames (2.5 s). It is explicitly not the
complete PNG comparison, and its failure is preserved in
[png_zero_budget_probe_20261030.json](../../workers/football-cv/bench/results/5.3/png_zero_budget_probe_20261030.json).
Completing the additional OCR removed those wrong claims. This is further
evidence against promoting PNG or assuming warm/deferred OCR runs are equivalent;
deferred-evidence safety needs an independent follow-up before any such adoption.

## Timing bottlenecks

Component seconds below combine discovery and extraction decode/detect, discovery
OCR and resolve numbers. Tracking means resolve tracklet construction; camera
motion is separate. Timers are not exhaustive and do not sum exactly to wall time.

| Component | CPU seconds | GPU seconds | GPU wall share |
| --- | ---: | ---: | ---: |
| Decode | 793.06 | 311.91 | 16.8% |
| Detect | 4751.01 | 352.45 | 19.0% |
| OCR / numbers | 849.28 | 214.59 | 11.6% |
| Tracklets | 58.4 | 58.2 | 3.1% |
| Identity | 177.5 | 58.4 | 3.2% |
| Timeline, metrics, events/report | 2.2 | 2.2 | 0.1% |
| Camera motion / scene | 370.26 | 347.90 | 18.8% |
| Colour signatures | 153.74 | 143.87 | 7.8% |
| Embeddings | 48.09 | 45.33 | 2.4% |
| Crop I/O | 14.57 | 13.85 | 0.7% |

Top-level GPU: model init 10.371 s, discovery 507.753 s, extraction 1051.349 s,
resolve 218.069 s. The remaining wall time includes input probing/hashing,
evaluation and other overhead. Discovery's component timers also leave substantial
unattributed work; instrument that before assigning a cause. GPU utilisation over
1,788 samples: mean 8.3%, p95 37%; peak device memory 1074 MiB. Low aggregate
utilisation does not identify one bottleneck or prove batching is safe.

## Estimated costs

All values below are **USD estimates, not invoices**. The retained 2026-10-29
Billing Catalog snapshot prices g2-standard-8/L4 plus 200 GB balanced disk in
europe-west4 at $0.9273387923/hour. This CPU reference ran on the same L4 VM,
so its estimate includes the allocated GPU even while CPU-only inference ran.
Taxes, discounts, bucket storage and cross-region egress are excluded.

- Recorded 2.89028 h session: **$2.68**, including build/recovery/idle time.
- Measured GPU compute 1853.86 s: **$0.48**; CPU compute 7528.287 s: **$1.94**.
- These compute estimates are subsets of session cost, not additional charges.

| Hypothetical duration | GPU estimated wall / cost | CPU on same VM estimated wall / cost |
| --- | --- | --- |
| 34 minutes | 30.97 min / $0.48 | 125.78 min / $1.94 |
| 90 minutes | 81.99 min / $1.27 | 332.95 min / $5.15 |
| 140 minutes | 127.54 min / $1.97 | 517.92 min / $8.00 |

Duration estimates scale the **complete 2035-second run**, not short windows.
They assume unchanged footage/content complexity and are not measured longer
matches. A CHF 15 budget alert is not a spending cap. Zurich capacity was not
retested and no new capacity or quota was consumed.

## Cleanup and evidence integrity

Authenticated CLI access succeeded using the user's existing authorised-user
grant and the official credential-file override. The portable CLI required the
Windows trusted CA bundle. TLS verification stayed enabled; no credentials are
stored in the repository. Transient TLS EOF failures were retried; failed output
was not accepted as proof of an empty resource list.

All 77 non-media bucket objects were downloaded, checked for presence and hashed;
both completed reports, claims hashes, images, timings, prices, recovery scripts
and first-attempt reports are retained. No video/crop files are committed.
The requested bucket video was deleted **after** this verification; a subsequent
lookup reports no matching object. Result objects were retained. Successful
project-wide instance, disk and snapshot lists each returned `[]`.
See [cloud_cleanup_20261030.json](../../workers/football-cv/bench/results/5.3/cloud_cleanup_20261030.json)
and [download manifest](../../workers/football-cv/bench/results/5.3/l4_download_verification_20261030.json).

## Priorities and acceptance

Final checks on this working tree: **579 worker tests passed, zero skipped**
(`python -m pytest -q -rs`, restored overlay, model directory and FFmpeg PATH,
OMP/MKL threads 2; three existing ONNX deprecation warnings). **718 app tests
passed, zero skipped** (`npm run test:unit`). `npm run typecheck` and
the source/docs whitespace check (CRLF allowed, immutable raw artifacts excluded)
passed. The earlier 575 count preceded two contact-entry and two audit-report
tests; it does not indicate removed tests. An initial `npm test` invocation failed
because the repository uses the `test:unit` script; the correct full script passed.

| Priority | Recommendation | Expected benefit | Difficulty | Accuracy risk |
| --- | --- | --- | --- | --- |
| P0 | Controlled CUDA FP32 and identical-crop OCR parity, retain intermediate evidence | Explain/recover 0.105 IDF1 and 0.127 recall loss | Medium | Low for experiment; promotion requires gate |
| P0 | Validate contact-entry guard on fresh/independent labelled windows | Remove demonstrated wrong owner propagation | Medium | Lost safe continuity; must audit |
| P0 | Resolve unmatched boxes and expand independent labels | Trustworthy attribution/abstention denominator | High | Label leakage if predictions become truth |
| P1 | Keep PNG experimental; controlled cold OCR and full-match evaluation before adoption | Recover compression-sensitive reads | Medium/high | More false reads and 4× crop bytes |
| P2 | Instrument discovery residual and camera-motion loop (18.8% GPU wall) | Identify real CPU-side idle share | Medium | Low for instrumentation |
| P2 | Profile decode (16.8%) and detector (19.0%) after parity is restored | Largest measured speed candidates | Medium/high | Colour/box drift; accuracy gate required |
| P3 | OCR batching/caching after exact-read parity (11.6%) | Reduce recognition wall time | Medium | Missing reads if scheduling changes |
| P4 | Report or crop-I/O micro-optimisation | At most small measured share | Low | Low, but low priority |

The existing GPU candidate is **rejected for promotion** by the relative gate.
The overall 5.3 milestone is **blocked**, pending parity diagnosis and independent
fresh/full-match validation. PNG remains experimental. A second L4 session must
be requested separately with the exact pushed commit, Zurich if available or
europe-west4 (~$0.93/h), maximum three hours (~$2.79 plus excluded charges), and
must receive explicit approval. No new session was started by this work.
