# Staging verification plan and approval packet (revised 2026-11-19 late; NOT executed)

Status: **awaiting approval.** No staging project exists, no staging approval is recorded, and nothing below has been
created, deployed or dispatched. Cloud calls made while preparing this were read-only (`describe`, `list`,
`get-iam-policy`, `logging read --limit 1`, location lists) against the production project `scoutx-230b0`, plus one
`projects describe pitchproof-stg-pilot` (answer: no permission or not existing). Participant pilot: pending. User-facing
analysis: disabled. **Action awaiting approval first: STG-01** (it needs the owner's choice of billing account, §8).

Revision of the packet first prepared at `65d9868` (ledger §30). What changed: simultaneous deliveries were reproduced and
fixed (§1), the link-revocation checks were extended (§5), and the spending section was rebuilt around a worst-case bound
with an enforced runtime/attempt guard (§6).

## 1. Candidate

| | Commit | Tree |
|---|---|---|
| **Staging candidate** (runtime + drivers) | `52654050db07545053bdb808b1f10dc903c129d3` | `4f45bd542868087f8274348c338d8461b2f0a7fc` |
| Runtime fix inside it | `aa3d7a8` (claim + fencing; only `trackingCallables.ts`, `trackingOrchestrator.ts` changed vs `65d9868`) | |
| **Staging deploy artifact** = candidate + staging CV approval (2 generated files) | built at STG-03 by `scripts/pilot-staging/make-staging-overlay.sh 5265405…` | **`b4537970126e42e8d4a29f0926654ea7fd1e5d4a`** (built twice, identical; the overlay commit SHA varies with its timestamp) |
| Superseded | `65d9868` (tree `bd26af22…`) and its overlay `7d858509…` | not to be deployed |

Why `65d9868` was superseded: two deliveries of the same logical task arriving together were reproduced through the
emulators with a deterministic barrier (each delivery paused at its first transactional read of `tracking/progress`, i.e.
after every read-only pre-check, until both arrived) and with real queue delivery:

| Case (emulator) | `f9b7e2d` | `65d9868` | `5265405` |
|---|---|---|---|
| 2 extracts for segment 0, simultaneous | 2 worker calls, 2 resolves enqueued | 1 call | 1 call, 1 resolve |
| 2 full resolves, simultaneous | 2 calls, held version 2 | **2 calls**, version 1 | **1 call**, version 1 (`busy` + `held`) |
| resolve duplicate while the first executes | 2 calls, version 2 | **2 calls**, duplicate published, `resolving` cleared | **1 call**, duplicate `busy`, `resolving` kept |
| attempt 0 response lost, queue retry (attempt 1) publishes, attempt 0 returns | version 2 | version 1 | version 1, late claimant `stale` |
| extract claimant returns after stop + re-enable + segment reset | records `done`, enqueues a resolve | **same** | `stale`, segment stays `queued`, nothing enqueued |
| 2 unnamed queue tasks (real Functions + Cloud Tasks emulators), first held at the worker | extract 2 calls; resolve 2 calls | extract 1; **resolve 2** | 1 and 1 |

Evidence: `docs/release/pilot-rehearsal-2026-11-19/9-claim-repro-f9b7e2d-functions.json`, `8-claim-repro-65d9868-functions.json`,
`10-claim-fix-candidate.json`, final run `12-final-5265405.json` (phase `claim`).

The overlay is still needed: `APPROVED_CV_WORKER` is compiled in (`cvApproval.generated.ts`, null on every real build).
The overlay approves only the staging fake worker `football-cv/0.7.0-staging` (`{detector: yolox-staging, ocr:
parseq-staging}`) and is never merged or pushed to a shared branch; the release gate rejects it by design.

### Delivery semantics: what the queue guarantees and what the application guarantees

| Guarantee | Provided by | Holds for |
|---|---|---|
| A second create with the same task name is rejected (`task-already-exists`) | Cloud Tasks, named tasks only; window up to 24 h after deletion (https://cloud.google.com/tasks/docs/quotas; older text says ~1 h, so recorded, not assumed) | the server's own enqueues with an `id`; not unnamed tasks, not redeliveries |
| Delivery at least once; a task can be delivered again (retry after an error/timeout, or rarely a duplicate) | Cloud Tasks (https://docs.cloud.google.com/tasks/docs/concepts) | everything |
| Of simultaneous deliveries of the same segment attempt, one calls the worker | app: transactional claim `segments[i].claim = <attempt>:<uuid>`, lease 31 min (> 1800 s task timeout) | extract |
| Of simultaneous deliveries of the same resolve, one calls the worker | app: `progress.resolveClaim {key = revision|scope|runAuthorizedAt, attempt, token}`, lease 16 min (> 900 s) | resolve (and OCR refresh rounds, keyed per round) |
| A taken-over or reset claimant records/publishes nothing (success or failure, no notification, no enqueue) | app: outcome and publish transactions require the claim token; the publish transaction also re-checks the pilot gate and the run authorisation epoch | extract, resolve |
| A delivery after a stored report is a no-op | app: completion record (`resolveClaim.finishedAt`) + pre-check on `sameRun` | resolve |
| An interrupted claimant is recovered | app: a later queue attempt or an expired lease takes over; a failed resolve frees its key at once | extract, resolve |
| **Not guaranteed**: if the worker accepted a request and its response is lost, the retry calls the worker again | the worker contract has **no idempotency key** (`workers/football-cv/app/tracking_v3.py`) | remaining exposure: one extra worker execution per lost response. Extract is cached by the worker's stage-1 checkpoint (returns `cached`); resolve is a deterministic function of cached stage 1 + feedback (`CORRECTION_OCR_BUDGET_SEC = 0`: no new crops). Only one report version is stored (fencing). Cost: one extra GPU-minute-scale call on the real worker. |
| Discovery chunks | app: status `queued` check + merge by moment id + `extractionQueued` flag | publication single; **a duplicate discovery delivery can still call the worker twice** (no claim; recorded residual, not exercised by staging) |

## 2. Deployed handler contract (read from code and production, read-only)

- Task functions are 2nd-gen (`onTaskDispatched`, firebase-functions 6.6.0) on Cloud Run, region `europe-west6`, runtime
  identity = default compute service account. Production revision read 2026-11-19: deployed 2026-11-13, timeout 900 s,
  `TRACKING_V3_ENABLED` not set. Candidate code (what staging deploys): extract and discover 1800 s / 512 MiB / max 6
  concurrent; resolve 900 s / max 4; OCR refresh 900 s / max 2 / 2 attempts; `buildDataExport` 1800 s / 1 GiB / max 5.
- **Authentication is enforced by Cloud Run IAM, not by the handler**: the SDK handler only checks that a Bearer token is
  present and decodes it without verifying ("tq functions are guarded by IAM"). Missing, wrong-audience or unauthorised
  tokens must be rejected by the platform before the container runs (A2–A4).
- Enqueue (Admin SDK 13.10.0): `oidcToken.serviceAccountEmail` = runtime service account, no explicit audience, so the
  audience defaults to the target URI (https://docs.cloud.google.com/tasks/docs/reference/rest/v2/OidcToken). The task
  creator needs `iam.serviceAccounts.actAs` on it.
- Production queue attempt logging is off; staging enables sampling 1.0.
- Image URLs the app uses for tracking images: Firebase Storage **download tokens** (`getDownloadURL`). `getMediaPlaybackUrl`
  (V4 signed URLs) refuses every `matchFootage/<job>/(tracking|pilotHeld)/` path. A signed-URL test would cover that
  mechanism only; the checks below test the token flow.

## 3. Staging scope requested

| Item | Value |
|---|---|
| Project | new `pitchproof-stg-pilot` (if the id is taken, the next free `pitchproof-stg-pilot-<n>`, recorded at STG-01), org `clusiola4-org`, no production data. Read-only recheck 2026-11-19: not accessible (does not exist or no permission). |
| Region | `europe-west6` for functions, queues, Cloud Run, Firestore (single region) and the default bucket. Read-only location lists 2026-11-19: Cloud Tasks, Cloud Run, Cloud Functions and Firestore all offer `europe-west6`. |
| Billing | the owner's choice of one of the two open billing accounts visible to the operator (STG-01). The account id is typed in the operator's shell only and never written to evidence, logs or the repository. |
| Functions deployed | only: `startPlayerAnalysis`, `answerTrackingQuestion`, `undoTrackingAnswer`, `cancelMatchAnalysis`, `explainTrackingMoment`, `getMediaPlaybackUrl`, `requestDataExport`, `buildDataExport`, `extractTrackingSegmentTask`, `discoverTrackingTask`, `resolveTrackingTask`, `refreshTrackingOcrTask`, `onMatchJobMediaLifecycle`, `onMatchJobDeleted`, `mediaLifecycleSweep` |
| Services | `cloudfunctions`, `run`, `cloudtasks`, `cloudbuild`, `artifactregistry`, `eventarc`, `logging`, `iamcredentials`, `firestore`, `storage`, `firebase`, `identitytoolkit`, `billingbudgets` |
| Queues | the 5 created by deploy + probe queues `stg-auth-probe` (max 1 attempt) and `stg-exhaust-probe` (max 2), logging sampling 1.0 |
| Service accounts | runtime = staging default compute SA; `stg-no-invoker@…` (no roles) for A4 |
| Fake worker | private Cloud Run service `stg-fake-worker` (`scripts/pilot-staging/fake-worker/Dockerfile`), max 1 instance, IAM invoker = runtime SA + operator, held requests auto-released after 180 s (`FAKE_WORKER_HOLD_MAX_MS`) |
| Test identities and data | synthetic Auth users `<run>-owner/-other@pitchproof-staging.invalid`, synthetic 20-byte "videos"; deleted by the drivers and at STG-10 |
| Env | `TRACKING_V3_ENABLED=true`, `CV_WORKER_URL=<fake worker URL>`, `CV_WORKER_APPROVED=true`; no AI provider key; `AI_FOOTAGE_PROCESSING_APPROVED` unset |

## 4. Approval actions (stable IDs)

`$P` = project id recorded at STG-01, `$R=europe-west6`. Every command runs after `unset CLOUDSDK_AUTH_ACCESS_TOKEN` with an
explicit `--project=$P`; none names `scoutx-230b0` (the drivers and the ops script refuse it).

| ID | Action | Needs approval because | Limits | Stop if | Evidence | Cleanup |
|---|---|---|---|---|---|---|
| STG-01 | Create `$P`, link the chosen billing account, budget USD 10 with alerts at 50/90/100 % | project creation, billing change | 1 project, 1 budget | creation lands in another org/folder; any prompt naming another project | `projects describe $P` (id, parent, labels), `billing projects describe $P` (enabled only), budget listed (amount, thresholds) | STG-10 |
| STG-02 | Firebase on `$P`, Firestore `$R`, default bucket, Auth email/password, enable §3 services | resource creation | — | location not `$R` | `services list --enabled`, database location, bucket location | STG-10 |
| STG-03 | Build the overlay (tree must print `b4537970…`); deploy rules, indexes and the 15 functions from it; queue logging 1.0; probe queues; `stg-no-invoker` | deployment | 15 functions, 7 queues, 1 SA | overlay tree differs; any function not in the list deployed | tree printed, function list + revisions + env keys (no values), queue configs | STG-10 |
| STG-04 | Deploy the fake worker (private, max 1, min 1) | deployment | 1 service | allows unauthenticated | `run services describe` (ingress, IAM), `/_ctl/log` = `[]` | min 0 at STG-10a, deleted with `$P` |
| STG-05 | Preflight, read-only | — (read-only) | 0 tasks | config differs from §3 | describes, `collect-logs.mjs --dry-run`, unauthenticated `curl` to a task URL = 401/403 | — |
| STG-06 | Cloud Tasks probes (A1–A4, R1–R3, D1–D4, S1) | real task dispatch | guard: 21 tasks / 54 attempts reserved | §6 stop conditions | `probe-tasks.mjs` JSON + `collect-logs.mjs` JSON | drivers delete their data; STG-10 |
| STG-07 | Link revocation (held, released, withheld + race, export, reprocessed, discarded, legacy, cleanup) | real task dispatch | guard: 7 tasks / 21 attempts | any successful fetch or issuance after the withhold acknowledgment; any owner/other/anon access while held | `image-revocation.mjs` JSON | driver cleanup (`cleanup.run_data_removed`) |
| STG-08 | Rollback boundary: S1, the discarded case, §29 recovery commands against `$P` | real task dispatch | inside STG-06/07 reservations | publication while stopped | as above | — |
| STG-09 | Evidence: redacted JSON committed under `docs/release/staging-2026-11/` | — | — | a token or billing id in any file | `grep -rnE 'token=[A-Za-z0-9]|ya29\.|AIza|billingAccounts/' docs/release/staging-2026-11/` empty (task bodies are base64 JSON and are expected) | — |
| STG-10a | Wind-down: stop procedure (§6) with nothing queued, fake worker min 0, synthetic Auth users and data deleted | — (inside `$P`) | — | — | queue `tasks list` empty, Auth user list empty | — |
| STG-10b | **Project identity check** (read-only) | — | — | any mismatch | §7 STG-10b output: id = `$P`, label `purpose=staging-verification`, parent = recorded org, no production resources | — |
| STG-10c | Delete `$P` | project deletion | 1 project | STG-10b not passed | `lifecycleState=DELETE_REQUESTED`, billing disabled, budget removed | — |

Order: STG-01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10a → 10b → 10c. Everything outside `$P` (production
`scoutx-230b0`, other projects, the billing account itself) is preserved.

## 5. Checks and pass criteria

| Check | Pass criterion | Emulator evidence at `5265405` |
|---|---|---|
| A1 valid dispatch | 1 worker extract call, segment done, attempt log 2xx | unexecuted (emulator does not verify OIDC) |
| A2/A3/A4 missing credentials / wrong audience / unauthorised identity | 0 worker calls, segment `queued/0`; attempt + request logs 401/403, no container log | unexecuted |
| R1 retryable failure | 2 calls, gap ≥ 55 s | passed |
| R2 permanent failure | 3 calls, segment `failed`, `trackingState: failed` | passed |
| R3 queue limit below the app's | 2 calls, task gone, segment `queued/2` (finding: limits must stay equal) | unexecuted (needs the probe queue) |
| D1 named-task dedup | 2nd create `task-already-exists`; re-create after execution recorded | passed |
| D2 two unnamed extracts | 1 worker call, segment done | passed |
| D3 resolve repeated after success | resolves, held version, cleanup, notifications unchanged | passed |
| **D4** resolve duplicate during execution | 1 call, `resolving` kept during, held version 1 | passed |
| S1 task authorised before a stop, delivered after re-enable | 0 resolve calls, nothing held (staging: created before the stop, scheduled 90 s later) | passed (emulator variant: created after the re-enable; the tasks emulator once dispatched a delayed task immediately) |
| Claim phase (emulator only) | §1 table | 7/7 |
| IR held | review **and discovery** twins 403 for owner/other/anonymous; owner paths not 200; **no link issued** (token metadata read or playback callable) for owner/other/anonymous; reviewer listing works; held doc 403 | passed |
| IR released | owner 200, other/anon 403, token URLs 200 **fetched before withholding** (required: a revocation result without a successful pre-withhold fetch is invalid) | passed (4/4 URLs 200) |
| IR withheld | exact token URLs non-200 from fresh connections with caching disabled within 1 s of the acknowledgment; no link issuable on owner or held paths for anyone; owner report null | passed: 10–22 ms after the acknowledgment |
| **IR withhold race** | a loop minting and fetching new token links throughout: 0 issued and 0 fetched successfully after the acknowledgment; last success before it | passed: 1431 iterations, 296 successes before, last success ended 683 ms **before** the acknowledgment (objects are moved before the withhold transaction) |
| IR export | no tracking report or image path in the archive while withheld | passed |
| IR reprocessed + released | new names; every old URL non-200; new links work for the owner only (other/anon 403) | passed; discovery sightings stay contained after a withhold (discovery is not re-run by reprocessing) |
| IR discarded | no images, no link issuable | passed |
| IR legacy | pre-R2 owner-path image contained by prune, repeat no-op | passed |
| IR cleanup | the run's objects and job documents removed | passed |
| Rollback boundary | in-flight save completes held or is discarded, never owner-readable | rehearsal `race.*` passed |

Server access vs copies already downloaded: revocation ends live access to the object (token URL, direct read, new
issuance). Bytes a browser or the app already downloaded (`cacheControl: private, max-age=3600`) stay on that device and
are outside server control.

Full emulator rehearsal at `5265405`: **86/86** (`12-final-5265405.json`). Drivers: `13-…probe-tasks…json` 7 passed /
5 unexecuted; `14-…image-revocation…json` 13/13. Unit 860/860, typecheck, functions `tsc`, eslint (9 files) exit 0,
rules 266/266 — run in the owner PC's Linux VM on a checkout verified file-by-file against `5265405` (1824 non-doc,
non-benchmark files, sha256 manifest).

## 6. Cost, limits, runtime and stop procedure

### Prices (official pages, searched 2026-11-19; europe-west6 is a Tier 2 region whose rates were not visible in the
excerpts read, so every compute figure below uses 1.5 × the Tier 1 rate as an upper bound, and no free tier is assumed
because the billing account may share it with production)

| Service | Rate used | Source |
|---|---|---|
| Cloud Run / Cloud Run functions, request-based billing | Tier 1 $0.000024 per vCPU-s, $0.0000025 per GiB-s, $0.40 per million requests; requests denied by IAM are not billed → bound $0.000036 and $0.00000375 | https://cloud.google.com/run/pricing ; functions 2nd gen are billed as Cloud Run (https://cloud.google.com/functions/pricing-summary) |
| Cloud Tasks | first 1 million billable operations per month free, then $0.40 per million; an operation is an API call or a push delivery attempt | https://cloud.google.com/tasks/pricing |
| Cloud Build | 2,500 free build-minutes per month per billing account, e2-standard-2 $0.006 per minute | https://cloud.google.com/build/pricing |
| Artifact Registry | 0.5 GB free, then $0.10 per GB-month | https://cloud.google.com/artifact-registry/pricing |
| Cloud Logging | $0.50 per GiB ingested, first 50 GiB per project per month free | https://cloud.google.com/logging/pricing |
| Cloud Storage, network | Standard regional storage and operations at cents per GB / per 10,000 operations; internet egress not re-verified (bound $0.12/GB) | https://cloud.google.com/storage/pricing |

### Limits reconciled with retries, in-flight work and failures

Each case reserves its worst case before it starts (`scripts/pilot-staging/limits.mjs`, `CASE_BUDGET`): tasks it creates,
including the app's own fan-out, times the maximum attempts of their queue (3; probe queues 1 and 2; app-level outcomes
`busy`/`stale` end a delivery without a queue retry, so the reservation is an upper bound).

| Case | Tasks | Max attempts | Why |
|---|---|---|---|
| A1 | 2 | 4 | probe task (1) + resolve it triggers (3) |
| A2, A3, A4 | 1 each | 1 each | rejected; probe queue max 1 |
| R1 | 2 | 6 | extract failing once (≤ 3) + resolve (3) |
| R2 | 1 | 3 | extract failing 3 times, no resolve |
| R3 | 1 | 2 | exhaust probe queue max 2 |
| D1 | 2 | 6 | named task + re-create after execution |
| D2 | 3 | 9 | 2 unnamed extracts + 1 resolve |
| D3 | 4 | 12 | start (extract + resolve) + 2 repeated resolves |
| D4 | 2 | 6 | 2 resolves for the same work |
| S1 | 1 | 3 | delayed resolve |
| IR (image driver) | 7 | 21 | discover + extract + resolve, export, reprocess resolve, discarded extract + resolve |
| **Full matrix** | **28** | **75** | fits 60 / 150; one complete re-run would also fit (56 / 150), a third would be refused |

Observed against the emulators at `5265405`: 24 task executions in total (17 + 7), all within the reservations. OCR
refresh rounds: 0 (the fake worker reports no deferred reads); a worker that did would add ≤ 3 rounds × 2 attempts per
resolve and is not deployed.

### Worst permitted combination

Attempts are not the binding control: 150 attempts at their 1800 s timeouts would be 270,000 instance-seconds (≈ USD 10.7
at the bound rates, above the budget). The binding control is the driver **runtime limit of 90 minutes** (STG-06…08,
deployment excluded), enforced by the guard's watchdog. In the worst case every queue dispatches at its maximum
concurrency (6 + 6 + 4 + 2 + 5 = 23) for 90 minutes and every running delivery then runs on to its timeout after the stop
(23 × 1800 s):

| Item | Worst case | USD |
|---|---|---|
| Task functions | (23 × 5400 s + 23 × 1800 s) = 165,600 instance-s at 1 vCPU + 1 GiB each (actual 512/256 MiB) | 6.58 |
| Fake worker, min 1 instance | 4 h including deployment and wind-down, 1 vCPU + 0.5 GiB | 0.55 |
| Cloud Build | 2 full deployments ≈ 96 build-minutes, free tier assumed used | 0.58 |
| Artifact Registry | ≤ 5 GB for a month if deletion were delayed | 0.45 |
| Logging | ≤ 1 GiB, free tier assumed used | 0.50 |
| Cloud Tasks, Storage, Firestore, egress | ≤ a few thousand operations, < 100 MB | 0.15 |
| **Total worst permitted** | | **≈ 8.8 (< USD 10 budget)** |
| Expected | ≈ 25 minutes of probes, ≈ 10 minutes of image checks, mostly idle instances | well under 1 |

The budget (USD 10, alerts 50/90/100 %) is a **monitoring** control: budget alerts do not stop spending and can arrive
hours late. The guard is the preventive control. Reaching the 50 % alert is a stop condition regardless.

### Stop procedure and running work

Tested locally (`tests/unit/pilotStagingLimits.test.ts`, 6 tests: matrix totals, task/attempt/unknown-case/observed-overrun
trips, runtime limit and watchdog, shared state across both drivers, command order). A trip runs, once:

1. `tracking-pilot-ops.mjs stop --project $P --production-authorized` — kill switch first: a delivery already running can
   no longer publish (the publish and outcome transactions re-check the gate) and new deliveries end as stopped;
2. every queue `--max-attempts=1` — retries off, so a failing in-flight delivery is not redelivered;
3. every queue `pause` — no new dispatches; deliveries already running finish or reach their timeout (≤ 1800 s) and
   their results are discarded by step 1;
4. every queue `purge --quiet` (synthetic tasks only), fake worker `/_ctl/release-all` (held requests end at once),
   fake worker `--min-instances=0`.

Against the emulators the gcloud steps are recorded, not executed. After a trip nothing restarts without a new approval.

**Stop conditions** (any one): a reservation that would exceed 60 tasks or 150 attempts; 90 minutes of driver runtime;
observed deliveries above the reservation; the 50 % budget alert; any owner/other/anonymous access to held or withheld
media or reports, or a link issued or fetched after a withhold acknowledgment; any publication while stopped; a probe
accepted by the handler without valid authentication; any request to a project other than `$P`.

**Alerts and authority.** Budget alerts go to the billing account's administrators and users (Cloud Billing default
recipients) — the owner. The guard's trips are printed to the operator's terminal and recorded in the evidence. **Who can
stop the run:** the owner, and the operator running the drivers (Claude, acting only inside `$P`); either may run the
stop procedure at any time without further approval. Restarting after a stop, and STG-10c, need the owner.

## 7. Commands (exact, in order)

```
unset CLOUDSDK_AUTH_ACCESS_TOKEN; P=pitchproof-stg-pilot; R=europe-west6; C=52654050db07545053bdb808b1f10dc903c129d3
# STG-01 (ORG_ID read with `gcloud organizations list`; BILLING_ACCOUNT typed by the owner, never logged)
gcloud projects create $P --organization=$ORG_ID --labels=purpose=staging-verification,owner=pitchproof
gcloud billing projects link $P --billing-account=$BILLING_ACCOUNT > /dev/null
gcloud billing budgets create --billing-account=$BILLING_ACCOUNT --display-name="$P verification" --budget-amount=10USD \
  --filter-projects=projects/$P --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0 > /dev/null
# STG-02
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com cloudtasks.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com eventarc.googleapis.com logging.googleapis.com iamcredentials.googleapis.com \
  firestore.googleapis.com storage.googleapis.com firebase.googleapis.com identitytoolkit.googleapis.com \
  billingbudgets.googleapis.com --project=$P
firebase projects:addfirebase $P
gcloud firestore databases create --location=$R --project=$P
# STG-03
scripts/pilot-staging/make-staging-overlay.sh $C /tmp/stg-overlay        # must print overlay_tree=b4537970126e42e8d4a29f0926654ea7fd1e5d4a
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
# STG-04 (build context: repository root at $C)
gcloud run deploy stg-fake-worker --source . --region=$R --no-allow-unauthenticated --max-instances=1 --min-instances=1 --project=$P
gcloud run services add-iam-policy-binding stg-fake-worker --region=$R --member=serviceAccount:<runtime SA> --role=roles/run.invoker --project=$P
# STG-06..08 (one shared guard state for both drivers)
cp scripts/pilot-staging/staging.config.example.json scripts/pilot-staging/staging.config.json   # fill in; git-ignored
export STAGING_CONFIG=scripts/pilot-staging/staging.config.json STAGING_LIMITS_STATE=/tmp/stg-limits-$P.json REHEARSAL_COMMIT=$C
START=$(date -u +%FT%TZ)
node scripts/pilot-staging/probe-tasks.mjs ev-tasks.json
node scripts/pilot-staging/image-revocation.mjs ev-images.json
node scripts/pilot-staging/collect-logs.mjs --since $START ev-logs.json
# STG-10a
node -e 'import("./scripts/pilot-staging/limits.mjs").then(m=>console.log(m.stopCommands(process.argv[1]).map(c=>c.join(" ")).join("\n")))' $P   # run the gcloud lines printed
# STG-10b project identity check (all must match, else stop)
gcloud projects describe $P --format='value(projectId,labels.purpose,parent.id)'      # $P  staging-verification  <ORG_ID>
test "$P" != scoutx-230b0 && gcloud functions list --project=$P --format='value(name)' | wc -l   # 15
# STG-10c
gcloud projects delete $P --quiet && gcloud projects describe $P --format='value(lifecycleState)'   # DELETE_REQUESTED
gcloud billing projects describe $P --format='value(billingEnabled)'                              # False
```

## 8. Awaiting approval / still needed

- **Exact action awaiting approval: STG-01** (project creation + billing link + budget), then STG-02…STG-10c as written.
- **Billing account choice**: two open billing accounts are visible to the operator (read-only, 2026-11-19). The owner
  chooses one; it is entered at STG-01 only.
- Firebase CLI logged in as the operator for `projects:addfirebase` and deploy.
- Approval of the overlay (approves a fake worker in staging only), the fake worker service, the probe set and the limits.
- Not part of staging: R3 decision (blocks the participant pilot only), owner identity answers Q1–Q4, the coach review,
  shadow footage.
