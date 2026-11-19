# Staging verification plan and approval request (prepared 2026-11-19; NOT executed)

Status: **awaiting approval.** No staging project exists, no staging approval is recorded, and nothing below has been
created, deployed or dispatched. The only cloud calls made while preparing this were read-only (`list`, `describe`,
`get-iam-policy`, `logging read --limit 1`) against the production project `scoutx-230b0`, to learn the deployed handler
contract and confirm operator access. Participant pilot: pending. User-facing analysis: disabled.

## 1. Candidate

| | Commit | Tree |
|---|---|---|
| Ledger §29 candidate | `f9b7e2d2ef541cecd05d3944beacd15b836a8321` | `4e4fdf9ede851f51fc1bd8453bf9a4318ad09102` |
| **Proposed staging candidate** (runtime) | `65d9868dab5bf8b3c2fd31fabff79ad2ac33ea08` | `bd26af2282108f38aabe70d1878dd99726d93d75` |
| Tooling pin (overlay builder fix only; runtime files identical to `65d9868`) | `ff149fd6f04753779e3ba2e1d0dfecc78ee7b1cb` | `ff6de9f17d020695a93990c7472e934c12d2ab56` |
| **Staging deploy artifact** = `ff149fd` + staging CV approval (2 generated files) | built at execution by `scripts/pilot-staging/make-staging-overlay.sh ff149fd` | **`7d858509f510feff37b67485630c80bc1c571c4b`** (deterministic; the overlay commit SHA varies with its timestamp) |

Why not `f9b7e2d` itself: designing the checks showed two pass criteria it would fail, both demonstrated locally —
(a) a repeated full resolve called the worker again and re-versioned the held report (emulator evidence at f9b7e2d:
`r1.duplicate_callbacks_after_completion_safe` held 1→3); (b) constant image names (`reference.jpg`) let a signed URL
issued before withholding address the re-released image. `65d9868` fixes both (resolve idempotency by feedback revision
+ run authorisation, attempt-aware extract lease, per-attempt image names, no signed URLs for tracking images). Later
commits on the branch (`b5c964c`, docs) do not affect runtime code or the runbook; §29's recovery procedure is unchanged
except that it is now pinned to `65d9868`/`ff149fd`.

Why an overlay: `APPROVED_CV_WORKER` is compiled in (`cvApproval.generated.ts`, null on every real build). The real
queue → handler → worker → report path cannot run in staging without approving *some* worker; the overlay approves only
the staging fake worker `football-cv/0.7.0-staging` (`{detector: yolox-staging, ocr: parseq-staging}`) and is never
merged or pushed to a shared branch. The release gate would reject it by design.

Local evidence on the candidate (emulators, no cloud): full rehearsal 79/79 at `65d9868`
(`docs/release/pilot-rehearsal-2026-11-19/5-final-65d9868.json`); unit 846/846; typecheck, functions `tsc`, eslint exit 0;
rules 266/266; worker identity safeguards 159/159; staging drivers checked against the emulators:
`image-revocation.mjs` 8/8, `probe-tasks.mjs` 6 passed + 5 unexecuted (the emulator cannot authenticate dispatch or host
the probe queues).

## 2. Deployed handler contract (read from code and production, read-only)

- Task functions are 2nd-gen (`onTaskDispatched`, firebase-functions 6.6.0) on Cloud Run, region `europe-west6`, timeout
  900 s, runtime identity = default compute service account (production revision e.g. `resolvetrackingtask-00001-vaz`,
  deployed 2026-11-13; `TRACKING_V3_ENABLED` not set there).
- **Authentication is enforced by Cloud Run IAM, not by the handler**: the SDK handler only checks that a Bearer token is
  present and decodes it without verifying ("tq functions are guarded by IAM"). Missing, wrong-audience or unauthorised
  tokens must therefore be rejected by the platform before the container runs.
- Enqueue (Admin SDK 13.10.0): `oidcToken.serviceAccountEmail` = runtime service account and no explicit audience, so the
  token audience defaults to the target URI (Cloud Tasks `OidcToken` reference,
  https://docs.cloud.google.com/tasks/docs/reference/rest/v2/OidcToken) — the `https://<region>-<project>.cloudfunctions.net/<fn>`
  URL. The service account must be in the queue's project and the task creator needs `iam.serviceAccounts.actAs` on it.
- Production runtime SA holds `roles/editor`, `roles/run.invoker`, `roles/eventarc.eventReceiver` (project level); task
  services have no service-level invoker bindings.
- Production queue settings (from code, confirmed read-only): extract min backoff 60 s, resolve/discover 30 s, max
  backoff 3600 s, max doublings 16, `maxAttempts` 3, `maxConcurrentDispatches` 4. **Queue attempt logging is off**
  (no `stackdriverLoggingConfig`), so staging must enable sampling 1.0 to see per-attempt evidence.
- De-duplication: Admin SDK `enqueue(…, {id})` maps to a named task; a duplicate fails with `task-already-exists`. Cloud
  Tasks documents a de-duplication window of up to 24 hours after a task is deleted (https://cloud.google.com/tasks/docs/quotas);
  older API reference text says about 1 hour, so the observed behaviour is recorded, not assumed. Delivery is "at least
  once" (https://docs.cloud.google.com/tasks/docs/concepts), so application idempotency is tested separately.
- Image URLs the app actually uses for tracking images: Firebase Storage **download tokens** (`getDownloadURL` via
  `useStorageUrls` → `resolveFrameUrl`). `getMediaPlaybackUrl` (V4 signed URLs) is used for videos/frames and, from
  `65d9868`, refuses tracking paths. No server image endpoint exists.

## 3. Staging scope requested

| Item | Value |
|---|---|
| Project | new `pitchproof-stg-pilot` (any free id; recorded at STG-01), org `clusiola4-org`, no production data |
| Region | `europe-west6` (functions, queues, Cloud Run, Firestore `eur3`? → use `europe-west6` single-region) |
| Functions deployed | only: `startPlayerAnalysis`, `answerTrackingQuestion`, `undoTrackingAnswer`, `cancelMatchAnalysis`, `explainTrackingMoment`, `getMediaPlaybackUrl`, `requestDataExport`, `buildDataExport`, `extractTrackingSegmentTask`, `discoverTrackingTask`, `resolveTrackingTask`, `refreshTrackingOcrTask`, `onMatchJobMediaLifecycle`, `onMatchJobDeleted`, `mediaLifecycleSweep` |
| Queues | the 5 created by deploy (above task functions) + probe queues `stg-auth-probe` (maxAttempts 1) and `stg-exhaust-probe` (maxAttempts 2), logging sampling 1.0 on all |
| Bucket | default Firebase bucket of the staging project; synthetic objects only |
| Service accounts | runtime = staging default compute SA; `stg-no-invoker@…` (no roles) for the unauthorised-identity probe |
| Fake worker | private Cloud Run service `stg-fake-worker` (`scripts/pilot-staging/fake-worker/Dockerfile`), max 1 instance, IAM invoker = runtime SA + operator |
| Test identities | synthetic Auth users `<run>-owner/-other@pitchproof-staging.invalid`, created and deleted by the drivers' run |
| Env | `TRACKING_V3_ENABLED=true`, `CV_WORKER_URL=<fake worker URL>`, `CV_WORKER_APPROVED=true`; no AI provider key; `AI_FOOTAGE_PROCESSING_APPROVED` unset |

## 4. Approval actions

Each action names its permissions, expected changes, pass criteria and evidence. `$P=pitchproof-stg-pilot`, `$R=europe-west6`.
All commands run with `unset CLOUDSDK_AUTH_ACCESS_TOKEN` and explicit `--project=$P`; none ever names `scoutx-230b0`
(the drivers refuse it).

| ID | Action | Commands (abridged; full in §7) | Permissions | Expected change | Pass / evidence |
|---|---|---|---|---|---|
| STG-01 | Create project, link billing, budget USD 10 with 50/90/100 % alerts | `gcloud projects create $P --organization=<clusiola4-org id>`; `gcloud billing projects link $P --billing-account=<acct>`; `gcloud billing budgets create …` | resourcemanager.projectCreator, billing.user | 1 project, 1 budget | `projects describe`, budget listed |
| STG-02 | Add Firebase, Firestore (`$R`), Storage default bucket, Auth email/password; enable APIs (cloudfunctions, run, cloudtasks, cloudbuild, artifactregistry, eventarc, logging, iamcredentials, firestore, storage) | `firebase projects:addfirebase $P`; `gcloud firestore databases create --location=$R`; `gcloud services enable …` | owner on $P | APIs on, DB, bucket | `services list`, bucket exists |
| STG-03 | Build overlay; deploy rules, indexes and the listed functions from tree `7d858509…`; enable queue logging; create probe queues and `stg-no-invoker` | `make-staging-overlay.sh ff149fd`; `firebase deploy --project $P --only firestore,storage,functions:<list>` (from the overlay worktree); `gcloud tasks queues update <q> --log-sampling-ratio=1.0`; `gcloud tasks queues create stg-auth-probe --max-attempts=1 …`; `gcloud iam service-accounts create stg-no-invoker` | owner on $P | functions + 7 queues + 1 SA | overlay tree printed = `7d858509…`; every function `ACTIVE`; revision names recorded |
| STG-04 | Deploy fake worker | `gcloud run deploy stg-fake-worker --source . --region $R --no-allow-unauthenticated --max-instances 1 --min-instances 1` (Dockerfile above); grant runtime SA + operator `run.invoker` | owner on $P | 1 Cloud Run service | `/_ctl/log` returns `[]` with operator token |
| STG-05 | Preflight (read-only) | `gcloud functions describe <fn> --v2` (revision, SA, env keys), `gcloud tasks queues describe`, `collect-logs.mjs --dry-run`, `curl -o /dev/null -w %{http_code}` to a task URL without token (expect 401/403) | viewer + logging.viewer | none | operator reads logs; all configs match §3 |
| STG-06 | Cloud Tasks probes | `STAGING_CONFIG=… node scripts/pilot-staging/probe-tasks.mjs ev-tasks.json` then `collect-logs.mjs --since <start> ev-logs.json` | cloudtasks.enqueuer, actAs on runtime SA and `stg-no-invoker`, datastore.user, storage.objectAdmin | ≤ 40 tasks, synthetic docs | table §5 |
| STG-07 | Image revocation | `STAGING_CONFIG=… node scripts/pilot-staging/image-revocation.mjs ev-images.json` | as STG-06 + firebaseauth.admin | ≤ 15 tasks, ≤ 30 objects | table §5 |
| STG-08 | Rollback boundary | `probe-tasks.mjs --only S1` + image driver's discarded case + §29 recovery commands against `$P` (`tracking-pilot-ops.mjs … --project $P --production-authorized --bucket <b>`) | as STG-06 | synthetic state | table §5 |
| STG-09 | Evidence copy | `gsutil cp` nothing out; evidence JSONs stay local and are committed redacted under `docs/release/staging-2026-11/` | — | — | files committed, tokens absent (`grep -E 'eyJ|ya29|token='` empty) |
| STG-10 | Cleanup | delete synthetic Auth users, objects, docs; `gcloud run services delete stg-fake-worker`; then `gcloud projects delete $P` | owner on $P | project in DELETE_REQUESTED | `projects describe` state `DELETE_REQUESTED`; billing unlinked; budget removed |

Dependencies: STG-01 → 02 → 03 → 04 → 05 → (06, 07, 08) → 09 → 10. Pre-existing resources to preserve: everything
outside `$P` (production `scoutx-230b0`, other projects, the billing account). Temporary resources deleted at STG-10:
the whole `$P` project and everything in it.

## 5. Checks, prior evidence and pass criteria

| Check | Question it answers | Prior evidence | Pass criterion | Rejection-layer evidence |
|---|---|---|---|---|
| A1 valid dispatch | Does the configured SA token reach the handler exactly once? | emulator (no auth) | 1 worker extract call, segment done, Cloud Tasks attempt log 2xx, 1 request log 204 on the overlay revision | — |
| A2 missing credentials | Rejected before the handler? | none | 0 worker calls, segment unchanged | attempt log + request log 401/403, no container log line for the request |
| A3 wrong audience (`https://wrong-audience.pitchproof-staging.invalid`) | Platform audience check | none | as A2 | as A2 |
| A4 unauthorised identity (`stg-no-invoker`) | IAM invoker check | none | as A2 (expect 403) | as A2 |
| R1 retryable failure | Backoff and retry | emulator 60.05 s | 2 worker calls, gap ≥ 55 s, attempt logs 500 then 2xx | attempt logs with dispatch counts |
| R2 permanent failure | App-level terminal at attempt 3 | emulator 60/120 s | 3 calls (≈ 0/60/180 s), segment `failed`, `trackingState: failed`, 3rd attempt 2xx | attempt logs |
| R3 queue attempt limit below the app's (probe queue max 2) | What happens when the queue gives up first | none | 2 calls, task gone, segment left `queued/2` (recorded as a finding: queue and handler limits must stay equal) | attempt logs, `tasks describe` NOT_FOUND |
| D1 duplicate creation (named task) | Queue-level dedup | emulator `task-already-exists` | 2nd create rejected; re-create after execution recorded (not asserted) | create responses |
| D2 redelivery of the same work (2 unnamed tasks) | App idempotency (extract lease) | emulator 1 call | 1 worker call, segment done | — |
| D3 repeated resolve after success | App idempotency (resolve) | emulator unchanged | resolves, held version, cleanup attempts, notifications all unchanged | — |
| S1 task authorised before a stop, delivered after re-enable | Stale authorisation | emulator 0 calls | 0 resolve calls, nothing held | — |
| IR held | Reviewer-only while held | emulator | twins 403 owner/other/anon; owner paths not 200; playback URL refused; reviewer listing works; held doc 403 | storage responses |
| IR released | Owner-only after release | emulator | owner 200; other/anon 403; token URLs 200; playback URL refused | |
| IR withheld | When does access end? | emulator ≤ 0.8 s from command start | exact token URLs non-200 from a fresh connection with caching disabled within 1 s of the withhold command returning; owner paths not 200; twins 403; owner report `null` | polling timestamps |
| IR export | Archive contains no tracking report/images | emulator | no `/tracking/` or `/pilotHeld/` image paths, no `reviewQuestions` | archive bytes inspected |
| IR reprocessed | Old URLs stay dead, new access works | emulator | new names; old URLs non-200; new images 200 | |
| IR discarded | No images from a result discarded by the stop | emulator | no tracking/pilotHeld objects for the job | object listing |
| IR legacy | Pre-R2 layout contained | emulator | owner 200 before, non-200 after prune; prune repeat no-op | |
| Rollback boundary | In-flight save completes held, stays inaccessible; later saves refused | emulator race 0.5–4.4 ms | about-to-publish result `stopped`/held only; never readable by owner through report, image, export | |

Not testable in staging with these tools: concurrent duplicate resolves arriving within the same milliseconds (a second
worker resolve call is possible; publication is still single — recorded residual); browser/app image caches (bytes
already downloaded stay on the device; `cacheControl: private, max-age=3600`); real GPU worker caching.

## 6. Cost, limits and stop conditions

- Tasks: ≤ 60 task creations and ≤ 150 delivery attempts in total (probe queues capped at 1–2 attempts). Cloud Tasks:
  first 1 million billable operations per month are free (https://cloud.google.com/tasks/pricing), so expected USD 0.
- Runtime: deployment ≈ 20 min; probes ≈ 25 min (R2 alone ≈ 4 min, S1 ≈ 3 min); image driver ≈ 10 min; cleanup 10 min.
  Fake worker min-instances 1 for at most 2 h.
- Expected spend: below USD 2 (Cloud Build minutes, Artifact Registry storage for function images, one small always-on
  Cloud Run instance for ≤ 2 h, Firestore/Storage operations in the hundreds). Hard cap: budget USD 10; stop at the
  50 % alert.
- Stop immediately, contain with `tracking-pilot-ops.mjs stop` and `withhold`, keep evidence: any unauthorised access to
  held or withheld media or reports; any publication while stopped; a probe accepted by the handler without valid
  authentication; any request to a project other than `$P`; spend alert ≥ 50 %; more than 150 attempts.

## 7. Commands (exact, in order)

```
unset CLOUDSDK_AUTH_ACCESS_TOKEN; P=pitchproof-stg-pilot; R=europe-west6
# STG-01/02 (org id and billing account recorded at execution)
gcloud projects create $P --organization=<ORG_ID> --labels=purpose=staging-verification,owner=pitchproof
gcloud billing projects link $P --billing-account=<BILLING_ACCOUNT>
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudtasks.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com logging.googleapis.com iamcredentials.googleapis.com \
  firestore.googleapis.com storage.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com --project=$P
firebase projects:addfirebase $P
gcloud firestore databases create --location=$R --project=$P
# STG-03
scripts/pilot-staging/make-staging-overlay.sh ff149fd6f04753779e3ba2e1d0dfecc78ee7b1cb /tmp/stg-overlay   # must print overlay_tree=7d858509…
cd /tmp/stg-overlay && printf 'TRACKING_V3_ENABLED=true\nCV_WORKER_URL=<fake worker URL>\nCV_WORKER_APPROVED=true\n' > functions/.env.$P
firebase deploy --project $P --only firestore:rules,firestore:indexes,storage,functions:startPlayerAnalysis,functions:answerTrackingQuestion,\
functions:undoTrackingAnswer,functions:cancelMatchAnalysis,functions:explainTrackingMoment,functions:getMediaPlaybackUrl,functions:requestDataExport,\
functions:buildDataExport,functions:extractTrackingSegmentTask,functions:discoverTrackingTask,functions:resolveTrackingTask,\
functions:refreshTrackingOcrTask,functions:onMatchJobMediaLifecycle,functions:onMatchJobDeleted,functions:mediaLifecycleSweep
for q in extractTrackingSegmentTask discoverTrackingTask resolveTrackingTask refreshTrackingOcrTask buildDataExport; do
  gcloud tasks queues update $q --location=$R --log-sampling-ratio=1.0 --project=$P; done
gcloud tasks queues create stg-auth-probe --location=$R --max-attempts=1 --log-sampling-ratio=1.0 --project=$P
gcloud tasks queues create stg-exhaust-probe --location=$R --max-attempts=2 --min-backoff=30s --log-sampling-ratio=1.0 --project=$P
gcloud iam service-accounts create stg-no-invoker --project=$P
gcloud iam service-accounts add-iam-policy-binding stg-no-invoker@$P.iam.gserviceaccount.com --member=user:<operator> \
  --role=roles/iam.serviceAccountUser --project=$P
# STG-04
gcloud run deploy stg-fake-worker --source . --region=$R --no-allow-unauthenticated --max-instances=1 --min-instances=1 --project=$P
gcloud run services add-iam-policy-binding stg-fake-worker --region=$R --member=serviceAccount:<runtime SA> --role=roles/run.invoker --project=$P
# STG-06..08
cp scripts/pilot-staging/staging.config.example.json scripts/pilot-staging/staging.config.json   # fill in; git-ignored
START=$(date -u +%FT%TZ)
STAGING_CONFIG=scripts/pilot-staging/staging.config.json node scripts/pilot-staging/probe-tasks.mjs ev-tasks.json
STAGING_CONFIG=scripts/pilot-staging/staging.config.json node scripts/pilot-staging/image-revocation.mjs ev-images.json
STAGING_CONFIG=scripts/pilot-staging/staging.config.json node scripts/pilot-staging/collect-logs.mjs --since $START ev-logs.json
# STG-10
gcloud run services update stg-fake-worker --min-instances=0 --region=$R --project=$P
gcloud projects delete $P --quiet && gcloud projects describe $P --format='value(lifecycleState)'   # DELETE_REQUESTED
gcloud billing projects describe $P --format='value(billingEnabled)'                              # False
```

## 8. What the operator still needs before execution

- Choice of billing account: the operator sees two open billing accounts (`gcloud billing accounts list`, read-only,
  2026-11-19 after one HTTP 429) and the organisation `clusiola4-org`; project-creation permission there cannot be
  confirmed without creating a project (STG-01).
- Firebase CLI logged in as the operator for `projects:addfirebase` and deploy.
- Approval of: the new project and budget (STG-01), the staging overlay (a build that approves a fake worker in staging
  only), the fake worker service, and the probe set and limits above.
