# Video Intelligence Accuracy Report

Evaluation status: NOT RUN

Independent orange #8 workflow (2026-10-24): implemented in
`workers/football-cv/eval/full_match_validation.py`; protocol and exact commands
are in `docs/video/full-match-validation.md`. It prepares fixed full-recording
review samples, re-verifies reviewed source/PTS/RGB anchors, seals independently
attested labels and emits source-bound sampled identity/visibility reports with
raw counts, exclusions, wrong-player/localization distinctions and segment slices.
No real orange #8 recording or completed independent review is available here;
therefore no measured accuracy report or performance percentage is claimed.
Production gates, immutable CV approval and release requirements are unchanged.
No footage was uploaded and no model training was performed.

Subsequent product-audit verification on 2026-10-24 reran the expanded worker
suite: 323 tests passed. It additionally enforces separate anchor/ground-truth
reviewers and rejects missing/malformed traces instead of scoring them as
abstention. The earlier workflow test counts below are historical. This still
provides no real-footage accuracy measurement and does not grant approval.

Workflow verification: 26 dedicated deterministic tests cover the fixed
140-minute schedule, reviewed/source-bound anchors, metric denominators,
wrong-player versus localization errors, incomplete/mismatched runs, review
sealing, blinding attestations, explicit authorization and exclusive CLI outputs.
The full worker suite passed 317 tests (one existing Starlette/httpx deprecation
warning); log: `.local/full-match-worker-final.log`. Synthetic test outcomes are
not real-footage accuracy measurements. No mobile/Functions/runtime code changed
in this workflow follow-up, so those unrelated suites were not rerun.

Release state: **PRODUCTION LIMITED**. Not validated on real footage. The gate does not read this
line: it verifies `docs/video/evaluation/approval.json` (absent) with `scripts/lib/cvApproval.mjs`.

## What has been measured

Nothing on real footage. No annotated real-footage dataset exists, and the computer-vision worker is
not deployed. No accuracy figure for PitchProof may be quoted anywhere.

## What automated tests cover (behaviour, not accuracy)

- Still-frame pipeline with mocked models (`tests/rules/analysisPipeline.test.mjs`,
  `tests/rules/aiCallables.test.mjs`): claims cite existing frames, events stay `needs_review`,
  statistics stay null, coaching waits for identity confirmation.
- Worker logic with fake detector, tracker and OCR, contract/HTTP and evaluation fixtures
  (`workers/football-cv/tests`, 56 tests as of 2026-10-23). These are not real-model accuracy tests.
- Evaluation harness and approval verifier on synthetic fixtures (`test_evaluate.py`,
  `tests/unit/cvApproval.test.ts`).

## Exact evidence required before the worker may run

1. **Dataset.** ≥ 30 real videos the project may use, with documented written permission from each
   filmed player (and a guardian for minors), covering every required difficulty slice
   (`acceptance-thresholds.md`). List them in a manifest (`workers/football-cv/eval/manifest.schema.json`)
   with the SHA-256 of each file. Footage stays outside the repository.
2. **Annotations.** ≥ 2 annotators, one JSON per video (`annotation.schema.json`): visible intervals,
   on-pitch intervals, target keyframes with boxes at least every 5 s, difficulty tags, events.
3. **Predictions.** Run `python -m eval.predict` with the exact image that will be deployed (same
   `workerVersion` and model versions).
4. **Report.** `python -m eval.evaluate --manifest … --annotations … --predictions … --out report.json`.
5. **Owner decision.** Set `thresholds.json` to `"status": "approved"` (values decided by the owner).
6. **Security and privacy review** of the deployed worker (private Cloud Run, IAM invoker only),
   with a reference and date.
7. **Approval record.** Commit the manifest, the report and `docs/video/evaluation/approval.json`
   (format in `docs/video/evaluation/README.md`), then run `node scripts/cv-approval.mjs --write`
   and deploy Functions.
8. **Operator switches.** Only then set `CV_WORKER_URL` and `CV_WORKER_APPROVED=true`.

The release gate recomputes every metric from the per-video data in the report, checks every hash,
the threshold status, the review fields and the dates, and fails if the generated runtime approval
differs. At runtime, every worker response must carry exactly the approved worker version and model
set or it is discarded.

What the gate cannot detect: a fully fabricated but internally consistent dataset. The controls are
the footage hashes (an independent reviewer can re-run steps 3–4 on the same files) and the named
security review recorded outside the repository.

## Local Footage Preparation (2026-10-23)

Authorized footage and orange/white target 20 were supplied, with a user-identified anchor at
242 seconds. Manual inspection finds a readable 20 on the shorts. Source metadata passes server
preflight: approximately 33:55, 2.23 GB, 1080p HEVC 10-bit HLG. A local-only PyAV test decoded
all 10 requested samples over seconds 240-245 at 2 fps. Samples and provenance remain ignored,
private local artifacts. No provider upload occurred.

This is not an independently annotated accuracy dataset. The torso-only OCR crop may exclude
a number visible on shorts, and HLG-to-RGB normalization requires evaluation. These observations
do not justify approving identity, full-match continuity, events, calibrated pitch maps or metrics.
The Python behavior suite now passes 61 tests (one dependency deprecation warning); behavior
tests are not measured model accuracy. See `intelligence-v2-delivery.md` for local smoke results.

The real five-second CPU smoke completed: 10 frames, 20.261 seconds processing plus 7.975
seconds cached model loading. It returned UNKNOWN identity and zero confirmed target-visible
seconds. No number-20 target trace was emitted. This is a failed anchor-confirmation baseline,
not a successful tracking validation. Events and pitch stages stayed unavailable. The local
evaluator's combined-runtime decoder stall was resolved by single-thread slice decoding;
production network decoding and approval gates were not changed.
