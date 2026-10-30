# Current-engine evaluation baseline, 2026-10-30

Follow-up: [5.3 acquisition and fresh-model validation](identity-acquisition-5.3-progress-2026-10-30.md)
restored the missing runtime, executed fresh model inference and exposed an
owner-assisted wrong-player case. This document records the earlier archived
baseline phase; its missing-runtime/cloud-CLI status has since changed.

The test-count discrepancy is reconciled. A reproducible archived-evidence identity
baseline is available, but a fresh full-recording detector/OCR baseline is **not
established**. No L4 instance was launched, no production flag changed, and no
tracking algorithm or identity threshold was changed.

## Version and test environment

Active checkout: `C:\ZLI\M335\ScoutX-gpu-benchmark`, branch
`codex/gpu-benchmark-5-3`, base commit
`883229e86edb2fe8d49aceec8aea7b62e0119b33`. The current identity engine reports
`5.2.0`; the separate legacy worker in the older checkout reports `football-cv/0.7.0`.
The evaluation fixes described below are uncommitted changes on this base.
The existing Dockerfile comment edit was preserved.

Python: `3.12.10`, executable
`C:\ZLI\M335\ScoutX\workers\football-cv\.venv\Scripts\python.exe`.
Tests and imports execute from the **newer checkout**, despite the environment's
location in the older one. Platform: Windows 11. PyTorch: `2.8.0+cpu`;
OpenCV: `5.0.0`; pytest: `8.4.2`; NumPy: `2.5.3`; SciPy: `1.18.1`.
This is not the pinned Linux/Python 3.13.17 GPU image.

Count reconciliation:

- Older `main`, `c7349d5`: 446 worker tests before the previous two CLI tests,
  448 after them; 650 app tests. These describe the older implementation.
- Commit `941f019` records 543 worker passes in its commit message. An isolated
  archive of that exact revision collected **543 tests** in the current Python
  environment. This verifies the historical inventory, not a new claim of 543 passes.
- Current `883229e`, before this evaluation patch: **550 passed, 5 skipped**
  (555 collected). Later commits added tests; none disappeared to produce 448.
- After this patch: **560 passed, 5 skipped** (565 total), including ten new
  evaluator/replay regression cases. Four skips need FFmpeg; one needs ONNX
  Runtime. One existing FastAPI/Starlette test-client deprecation warning remains.
- Current app suite: **718 passed, zero failed/skipped**, Node `v22.23.4`,
  npm `10.9.9`. Initial failures in this checkout were missing dependencies.
  Root and Functions dependency locks match the older checkout byte-for-byte;
  ignored directory junctions reuse those installed dependencies.
- App and test TypeScript checks passed after the existing preview-preparation
  script regenerated its ignored JSON from committed, server-validated fixtures.
  The initial missing-artifact failure was not suppressed.

Commands, from the current checkout (worker commands from `workers/football-cv`):

```powershell
$python = 'C:\ZLI\M335\ScoutX\workers\football-cv\.venv\Scripts\python.exe'
& $python -m pytest --collect-only -q
& $python -m pytest -q -rs
npm run test:unit
# Prepare the ignored screenshot-preview input from committed, server-validated fixtures:
node --import ./tests/unit/support/register.mjs scripts/review-preview/prepare.ts
npm run typecheck
```

## Footage and evidence binding

The local reference is
`C:\Users\masap\Downloads\Mobile Devices\IMG_4809_proxy_10fps.mp4`,
1,413,632,177 bytes. Its freshly measured SHA-256 is
`b1077af3c975e0e1b5d15a9f0dc3895ac87fa296cad4f41d267368c260fb679c`,
exactly matching `bench/references/img4809_proxy_10fps.json`. This is the 10 fps
proxy, not the 30 fps HEVC original used in the earlier legacy smoke test.
No new footage was uploaded or model weights downloaded.

`bench/replay_identity_baseline.py` executes current tracking assembly, identity
resolution and state assignment on the two committed crossing fixtures. It pins
fixture hashes, source-code hashes, commit, dirty status, runtime and actual
contact/steal-split settings in its output. It rejects changed inputs/code during
the replay and never overwrites an existing result file.

Result: `workers/football-cv/bench/results/5.3/identity_replay_20261030_final.json`.
Environment, model availability, test counts and log hashes are recorded separately
in `workers/football-cv/bench/results/5.3/environment_baseline_20261030.json`.

```powershell
& $python bench/replay_identity_baseline.py --out 'C:\path\new-result.json'
```

The inputs are archived detections, appearance features and OCR reads. The 31:44
fixture explicitly contains legacy YOLO11n stage-1 data. Replay therefore does
**not** validate the current YOLOX detector, current OCR models, decoding, live
discovery, fresh full-match accuracy or full-pipeline processing time. Labels are
developer annotations from one annotator and were used during development. The
17:53 fixture was already inspected and used to design a fix; it is not an
untouched holdout. Four original held-out windows remain unevaluated here.

## Fresh replay findings

- **31:44 fixture, automatic:** 54 target-labelled frames (5.4 s); 53 correctly
  claimed (5.3 s), including 38 confirmed frames (3.8 s). Claimed recall 0.981;
  confirmed recall 0.704; sampled IDF1 0.991. No measured wrong identity or
  overlap-ambiguous attribution. One visible-labelled frame was abstained.
- **17:53 fixture, automatic:** 31 target-labelled frames (3.1 s); no correct
  claims, recall 0 and sampled IDF1 0. All 31 frames were abstained. Retained
  detections and assembled tracks overlap the target in all 31 frames, but the
  fixture has **zero retained target-number reads** and no anchor was supplied.
  This localises this replay's failure to missing target-identification evidence,
  rather than absence of a retained detection. It does not establish why fresh
  OCR/discovery would miss or find the target in the complete recording.
- **Same 17:53 fixture, recorded owner anchor:** 28 correctly claimed frames
  (2.8 s), including 16 confirmed frames (1.6 s). Claimed recall 0.903;
  confirmed recall 0.516; sampled IDF1 0.949. Three visible-labelled frames were
  abstained. No measured wrong identity or overlap-ambiguous attribution.

Automatic and owner-assisted results are separate conditions. Their labels must
not be pooled as independent samples. These are only 8.5 seconds of target-visible
labels across two previously examined windows. Unlabelled claims remain unscored;
zero measured false attribution does not establish a zero population error rate.
Reported IDF1 is the existing single-target labelled-frame benchmark definition.

## Evaluation reliability fixes

- Accuracy gates now reject missing, nonnumeric and non-finite metric values.
  Previously NaN could pass a maximum constraint.
- Timeline agreement matches timestamps once and uses the nearest available
  timestamp within tolerance. Unmatched frames now reduce state agreement over
  the union. Previously one retained frame out of ten could report 100% agreement;
  it now reports 10%.
- Offline comparison refuses an incomplete candidate even if stale accuracy
  fields are present. Live and offline gates both reject missing/non-finite
  required baseline agreement instead of silently skipping it.

The thresholds in `bench/gates/balanced_5.2.json` are unchanged. Passing its
absolute false-attribution limits alone does not prove useful recall. These checks
cannot promote an all-abstaining result into a reliable tracking milestone.

## Remaining baseline and cloud blockers

Historical snapshot: the blockers below describe the first local baseline phase.
The model environment was subsequently restored and authenticated cloud results
were collected. See [the 5.3b reconciliation](intelligence-5.3-gpu-benchmark-report.md)
for current evidence; these earlier statements do not describe current cloud status.

Model preflight (`python -m scoutx_tracker.envinfo --require-models`) exited 3:
the hash-pinned YOLOX-s detector and docTR PARSeq weights are missing. EasyOCR's
two cached model hashes match. ONNX Runtime, docTR, FFmpeg and ffprobe are absent
locally. Fresh current-model/full-recording inference was not run.

`gcloud` is not installed/on PATH. Neither standard gcloud credentials nor
application-default credentials exist in the usual Windows gcloud directory;
no alternate credential/config environment variable was present. No authenticated
Compute, Storage, operations, quota or billing query ran. Historical quota approval
is not treated as current availability or benchmark completion.

Once an authenticated CLI is available, inspect without changing its default project:

```powershell
gcloud compute instances list --project=scoutx-230b0
gcloud storage buckets list --project=scoutx-230b0
gcloud compute operations list --project=scoutx-230b0 --limit=20
gcloud storage ls gs://scoutx-230b0-benchmarks/results/
```

Before an L4 run, restore the pinned model/runtime prerequisites, run the current
engine on the verified proxy against the bound labels with automatic and assisted
conditions separated, audit remaining negative-case coverage, and obtain a
complete same-task baseline. Preserve accuracy gates and production flags. No
GPU speed, VM status, actual cloud cost or full-match accuracy is established by
this local work.
