# football-cv — reference GPU worker

Status: **REFERENCE IMPLEMENTATION — NOT DEPLOYED — NOT VALIDATED ON REAL FOOTAGE.**

This service tracks people in one segment of a match video, follows the target player by
jersey number and kit colour, and reports per-second availability (`CONFIRMED_VISIBLE`,
`LIKELY_ACTIVE_OFF_CAMERA`, `UNKNOWN`) plus coverage. It does **not** detect football events
or map the pitch yet: those stages always report `unavailable`, and the Cloud Functions side
refuses to count events unless `CV_EVENTS_VALIDATED=true` is set after evaluation.

## Privacy by construction

- No facial recognition. Identity comes from jersey-number OCR and kit colour only.
- Request privacy flags (`retainNonTargetIdentities`, `faceRecognition`, `persistMedia`) must be
  `false`; anything else is rejected with HTTP 422.
- Frames are decoded in memory from a short-lived signed URL. Nothing is written to disk and
  tracks of other people are discarded when the request ends.
- `/docs` and `/openapi.json` are disabled.

## Contract

`POST /v2/segments:analyze` — see `app/contract.py` (mirrored by
`functions/src/analysis/cvContract.ts`, `CV_CONTRACT_VERSION = 2`). The Functions client
validates every response again and drops anything inconsistent.

## Local tests (no GPU needed)

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

## Evaluation on real footage (required before enabling)

1. Collect footage with written permission from the players (and guardians for minors).
   Keep footage and annotations **outside this repository** (`eval/data/` is gitignored).
2. Annotate each video following `eval/annotation.schema.json`.
3. Run the deployed worker over each video and save the segment results to
   `eval/data/predictions/<videoId>.json`.
4. `python -m eval.evaluate --annotations eval/data/annotations --predictions eval/data/predictions --out eval/report.json`
5. Compare with `eval/thresholds.json`. Those values are a **proposal awaiting a product-owner
   decision** (see `docs/video/acceptance-thresholds.md`).

## Deployment (not done — every value below is CONFIG_REQUIRED)

```powershell
# Build and push (Artifact Registry repository: CONFIG_REQUIRED)
gcloud builds submit --tag europe-west6-docker.pkg.dev/scoutx-230b0/CONFIG_REQUIRED/football-cv:CONFIG_REQUIRED

# Private Cloud Run service with a GPU (GPU region availability: CONFIG_REQUIRED)
gcloud run deploy football-cv `
  --image europe-west6-docker.pkg.dev/scoutx-230b0/CONFIG_REQUIRED/football-cv:CONFIG_REQUIRED `
  --region CONFIG_REQUIRED --gpu 1 --gpu-type nvidia-l4 --cpu 4 --memory 16Gi `
  --no-allow-unauthenticated --concurrency 1 --max-instances CONFIG_REQUIRED --timeout 900

# Only the Functions runtime service account may invoke it
gcloud run services add-iam-policy-binding football-cv --region CONFIG_REQUIRED `
  --member serviceAccount:CONFIG_REQUIRED --role roles/run.invoker
```

Then, in the Functions environment:

| Variable | Meaning | Default |
| --- | --- | --- |
| `CV_WORKER_URL` | HTTPS URL of the private service | unset → worker unavailable |
| `CV_WORKER_APPROVED` | `true` only after the evaluation passed and the owner approved | unset → unavailable |
| `CV_EVENTS_VALIDATED` | `true` only after an event stage exists and passed evaluation | unset → events never counted |

With any of the first two unset, every CV stage reports `unavailable` and the app falls back to
the frame review, which is labelled as such in the report.
