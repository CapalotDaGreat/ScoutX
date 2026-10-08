# Video Intelligence Accuracy Report

Evaluation status: NOT RUN

Release state: **PRODUCTION LIMITED**. Not validated on real footage. The gate does not read this
line: it verifies `docs/video/evaluation/approval.json` (absent) with `scripts/lib/cvApproval.mjs`.

## What has been measured

Nothing on real footage. No annotated real-footage dataset exists, and the computer-vision worker is
not deployed. No accuracy figure for PitchProof may be quoted anywhere.

## What automated tests cover (behaviour, not accuracy)

- Still-frame pipeline with mocked models (`tests/rules/analysisPipeline.test.mjs`,
  `tests/rules/aiCallables.test.mjs`): claims cite existing frames, events stay `needs_review`,
  statistics stay null, coaching waits for identity confirmation.
- Worker logic with fake detector, tracker and OCR (`workers/football-cv/tests`, 25 tests).
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
