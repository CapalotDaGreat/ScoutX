# Video Intelligence Accuracy Report

Evaluation status: NOT RUN

Release state: **PRODUCTION LIMITED** — not validated on real footage.

## What has been measured

Nothing on real footage. No annotated real-footage dataset exists in this project yet, and the
computer-vision worker is not deployed.

## What is covered by automated tests (behaviour, not accuracy)

- Still-frame pipeline with mocked models (`tests/rules/analysisPipeline.test.mjs`,
  `tests/rules/aiCallables.test.mjs`): claims must cite existing frames, events stay
  `needs_review`, statistics stay null, coaching is held back until identity is confirmed.
- Worker logic with fake detector / tracker / OCR (`workers/football-cv/tests`): jersey reads
  confirm identity, colour alone never does, gaps become unknown, a broken stream fails honestly.
- Evaluation harness (`workers/football-cv/eval/evaluate.py`) on synthetic fixtures.

## How to complete this report

1. Annotate ≥ 20 real videos with permission (`workers/football-cv/eval/annotation.schema.json`).
2. Deploy the worker privately and run it over them.
3. Run `python -m eval.evaluate ...` and paste the gate output here.
4. Only if every proposed (or owner-approved) threshold passes, change the first line to
   `Evaluation status: PASSED`, with date, worker version and dataset description.

The release gate keeps "Video intelligence validated on real footage" at NOT VALIDATED until then,
and fails if `CV_WORKER_APPROVED` or `CV_EVENTS_VALIDATED` is set before it.
