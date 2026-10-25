# Match evaluation and identity hardening

## Scope

Implemented on 2026-10-24. No Veo footage was retrieved, no orange-8 real-footage
benchmark was run, and no model was trained. Existing consent, ownership, CV
approval, experimental-feature and release gates are unchanged.

## Source/PTS Integration Update

The local adapter and gated coordinator integration are implemented for worker
`football-cv/0.4.0`. This is a new worker build requiring its own immutable CV
approval; the generated production approval remains null. No deployment, model
training, external footage upload or protected Veo retrieval was performed.

The adapter verifies the actual local file SHA-256 before and after decoding,
enumerates source frames rather than multiplying seconds by nominal FPS, and
matches exact rational PTS plus raw RGB24 SHA-256. Variable-rate video, source
clock origin, recording-relative time and global decoded frame index are distinct.
An explicit rational origin maps raw source PTS to the recording clock. Rounded,
ambiguous, stale or mismatched claims fail closed. The inference pass verifies
sample pixels against that proof and checks the file hash again before completion.

`eval.prepare_anchor` exports a genuine local PNG and an incomplete manifest
draft. The draft deliberately has no player box and cannot pass validation until
a human reviews that exact frame and adds a normalized selection. It initializes
no inference model. Old JPEG frame IDs and rounded seconds are not silently
converted into cryptographic provenance.

`eval.coordinated` joins the verified adapter, transient pipeline observer and
match coordinator. The observer is enabled only when both existing switches are
exactly `true`. Competitor tracklets remain in memory. Saved `identity.json`
contains an allowlisted target summary; optional `artifact.json` contains only
independently supported target samples and source proof, never competitor IDs or
jersey descriptions. All completion/decode-audit safeguards still apply.

The private worker endpoint is `POST /v2/matches:resolve-identity`, with strict
`{evidence, sourceProof}` metadata. Its response pins worker/models and source
proof digest, with no sightings or tracklet IDs. Invalid HTTP bodies return a
generic 422 without echoing rejected inputs. Remote metadata is trusted only from
the IAM-authorized producer; the endpoint does not claim to rehash remote media.

The exported `coordinateAnalysisTarget` callable accepts only job ID, expected
generation and expected anchor revision. It reads a server-only private evidence
artifact, checks owner/canonical source, current AI and guardian permissions,
unrevoked video consent naming the CV worker, feature switches and immutable CV
approval. The identical transaction guards run again after the private worker
call. Changed anchors, evidence, consent or approval defeat stale commits.
Results do not confirm identity, release coaching, count events or bypass quota.
The target-anchor panel exposes a gated `Check identity` action through the shared
callable service/hook. It sends no footage or client evidence and displays an
unavailable state when proof or approval is missing. Its status is not an
identity confirmation. The action is localized in all seven existing locales.

Metadata records live under `matchAnalysisJobs/{jobId}/identityEvidence`; clients
cannot read or write them under existing rules. Long records are split by the
producer helper into hash-bound bounded chunks, with a 16 MiB total match budget.
The result is written to private `identityCoordination/current`, with only a small
marker on the parent job. Withdrawal removes both private collections. Anchor
edits and identity rejection clear the summary and current evidence/chunks transactionally. The regular
CV segment persistence path also drops all candidates.

There is deliberately no public client artifact-import endpoint or automatic
historical backfill. A trusted producer must stage the verified target-only
artifact; legacy rounded app frames without proof remain unavailable. Local
artifact export does not publish anything to Firebase. This preserves the trust
boundary rather than treating an arbitrary client hash as server verification.

### Local Reviewed-Anchor Commands

From `C:\ZLI\M335\ScoutX\workers\football-cv`, with `$video` and `$reference`
set to the authorized path and recording-relative seconds:

```powershell
$reviewOut = Join-Path '..\..\.local' ('orange8-review-' + [guid]::NewGuid().ToString('N'))
.\.venv\Scripts\python.exe -m eval.prepare_anchor --input "$video" --out "$reviewOut" --reference-sec $reference --job-id local-orange8 --generation 0 --authorize-local-evaluation
```

Review `frame.png` and add only the selected player's normalized `box` to the
anchor in `manifest.draft.json`; do not change PTS, hashes, scope or model digest.
For a cloud-linked run, the job/frame IDs, generation and revision must instead
match the actual current server job and reviewed frame. A local-only ID is not a
substitute for ownership of a cloud job.

The following switches affect this local shell only, not production approval.
Do not copy them into EAS or production configuration to bypass evaluation:

```powershell
$env:EXPERIMENTAL_TARGET_ANCHORS = 'true'
$env:CV_WORKER_APPROVED = 'true'
$runOut = Join-Path '..\..\.local' ('orange8-coordinated-' + [guid]::NewGuid().ToString('N'))
.\.venv\Scripts\python.exe -m eval.match --input "$video" --out "$runOut" --jersey-number 8 --kit-primary-color orange --reference-sec $reference --anchor-manifest "$reviewOut\manifest.draft.json" --authorize-local-evaluation --run
```

Use the cached-weight environment paths in the original command section below.
Optional `--source-path profiles/OWNER/matchFootage/JOB/video.mp4 --anchor-revision N`
adds a local target-only artifact for the trusted producer; it sends no media or
metadata to a remote service.

### Mobile Failure Diagnosis

The earlier combined browser run shared one seed across projects. Mobile then
inherited desktop's accepted upload policy, existing export and accepted trial.
The runner now uses a separate emulator lifecycle and fresh seed for every
project, with regression-tested project/filter validation. This does not skip
acknowledgements, weaken consent, change product state or increase timeouts.
An intermediate run passed all 27 desktop functional tests but its second seed
timed out in reused emulators; process isolation addresses that queued-trigger
boundary as well. Current final results are recorded below when complete.

### Files In This Update

- `workers/football-cv/app/source_pts.py`, `contract.py`, `main.py`, `pipeline.py`:
  exact source proofs, strict metadata envelope, private endpoint and gated observer.
- `workers/football-cv/eval/prepare_anchor.py`, `coordinated.py`, `match.py`,
  `predict.py`: human-review preparation, origin-aware decode and local integration.
- Worker tests `test_source_pts.py`, `test_prepare_anchor.py`,
  `test_coordinated_evaluation.py`, `test_identity_coordinator.py`, and
  `test_local_decode.py`: source, clock, privacy, gate and command regressions.
- `functions/src/analysis/identityCoordinator.ts`, `cvWorker.ts`, `cvContract.ts`,
  `segmentPipeline.ts`, `identityCallable.ts`, `targetAnchorCallable.ts`,
  `videoConsent.ts`, `functions/src/index.ts`, and corresponding compiled output:
  approved private orchestration, bounded metadata, redaction and invalidation.
- `scripts/run-e2e-emulators.mjs`, `scripts/lib/e2eRunPlan.mjs`/`.d.mts`,
  `tests/unit/e2eRunPlan.test.ts`: complete browser-project isolation.
- `tests/unit/identityCoordinator.test.ts`, `cvEvidence.test.ts`,
  `tests/rules/targetAnchors.test.mjs`: strict validation, persistence privacy and races.
- This report: commands, evidence and explicit deployment/accuracy boundaries.
- `src/features/match-analysis/hooks/useTargetAnchors.ts`,
  `components/TargetAnchorPanel.tsx`, `services/matchAnalysisCallable.ts`, the seven
  `src/i18n/locales/*/matchAnalysis.json` files and `e2e/flows/targetAnchors.spec.ts`:
  gated app action with fail-closed feedback and no automatic confirmation.
- `functions/src/dataRights/dataExport.ts`, `tests/rules/dataRights.test.mjs`,
  `docs/privacy/deletion-matrix.md`, `retention-matrix.md`: target-summary portability
  and lifecycle coverage. Export child reads use authoritative document IDs, not
  client-controlled body IDs; internal proof chunks remain excluded.
- `functions/src/analysis/corrections.ts`: shared artifact invalidation on both
  new and deduplicated Not-me feedback.
- `workers/football-cv/app/backends.py`, `tests/test_remote_decode.py`: the same
  exact recording-clock sampler for HTTP decoding, without relaxing its network
  protocol whitelist or permitting local-file URLs.

### Current Verification

- Complete worker suite: 291 passed, zero skips. One existing Starlette/httpx
  deprecation warning. `.local/anchor-adapter-worker-clock-final.log`.
- Complete app unit suite: 602 passed, zero skips, including locale parity,
  strict coordinator validation and emulator-project planning.
  `.local/anchor-adapter-unit-last.log`.
- Full rules suite: 249 passed, zero skips.
  `.local/anchor-adapter-rules-verified.log`.
- After final shared rejection cleanup, all 47 affected anchor/pipeline/data-rights
  regressions passed, zero skips. `.local/anchor-adapter-regressions-last.log`.
- Full desktop functional flows: 27 passed, one opt-in marketing capture skipped.
  `.local/anchor-adapter-e2e.log`. That intermediate combined command subsequently
  failed at the second seed before mobile started; it is not an overall successful
  combined run. The runner now starts separate emulator processes per project.
- Full isolated mobile functional flows: 27 passed, one opt-in marketing capture
  skipped, zero retries and no dependent tests left unrun. The three previously
  failing upload/export/trial workflows all passed.
  `.local/anchor-adapter-mobile-final.log`.
- After adding the app action, the complete target-anchor flow passed separately
  on desktop and mobile with fresh emulator lifecycles and zero retries. Tests
  clicked the real callable, observed unavailable approval, and verified pending
  identity confirmation. `.local/anchor-adapter-target-ui-final.log`.
- Root and test TypeScript, Functions TypeScript build and full ESLint passed.
  `.local/anchor-adapter-types-final.log`, `anchor-adapter-lint-last.log`.
- Desktop/mobile target-panel screenshots inspected; no new control/text overflow.
  These are synthetic UI fixtures with development overlays, not native or
  real-footage evidence.
- Real PyAV preparation plus cached-model coordinated execution passed on a
  generated two-second green video: exact frame index 30 at 1.0 s, valid source/
  RGB proof, complete four-sample decode audit, UNKNOWN identity, zero candidates
  and no retained target tracklets. This is execution evidence, not accuracy.
  `.local/anchor-adapter-synthetic-prepare.log`,
  `anchor-adapter-synthetic-run/`, `anchor-adapter-synthetic-clock-run/`.
- An actual generated offset MP4 resolved recording 1.0 s to raw source PTS
  4.0 s, origin 3.0 s, decoded index 30. The PyAV runtime reported a 2.0-second
  recording duration and complete normalized samples [0, 0.5, 1, 1.5].
  `.local/anchor-adapter-offset-check.log`, `anchor-adapter-offset-audit.log`.
  Cached-model coordinated execution on that offset file also completed with a
  valid decode audit, UNKNOWN identity and zero candidates:
  `.local/anchor-adapter-offset-run/`, `anchor-adapter-offset-run.log`.
- CRLF-aware diff checks passed. Temporary emulator secret files were removed.

No private footage was used in these runs. Browser upload tests used only local
synthetic fixtures in demo emulators; there was no external footage upload,
provider processing, model download or training.

### Remaining Validation And Operations

Orange 8 and the full Veo recording remain untested. Authorized footage and
independently reviewed annotations are still required to measure wrong-person
assignments, abstention, visibility recall, camera-cut/halftime/re-entry recovery,
and exact-PTS behavior on real camera exports. Synthetic fixtures do not establish
those metrics. Learned ReID, automatic halftime detection and calibrated
confidence remain unimplemented and are not implied by these tests.

Production stays off: worker 0.4.0 needs an independently accepted evaluation and
immutable approval, private IAM deployment and current provider consent. A trusted
producer must stage a current verified metadata artifact before the app action can
return a result. No public upload/import of client-authored proofs was added, no
legacy rounded anchors were silently backfilled, and no automatic reanalysis or
paid processing was scheduled. Native iOS/Android behavior and TestFlight were
not validated by this web/worker work.

## HTTP stall diagnosis

The sandboxed Python 3.12 stack stops in `socket._fallback_socketpair` at
`accept`, called by Windows asyncio Proactor event-loop initialization inside
AnyIO's blocking portal. This occurs before the `/healthz` handler, model startup
or inference. The identical isolated test outside the sandbox passed in 0.91 s.
Changing model code, skipping the test, or increasing timeouts would not address
that environment restriction. Tests must have local loopback permission.

`tests/test_worker.py` now scopes the real TestClient in a context manager so its
portal closes deterministically. A regression opens and closes clients twice,
checks sanitized 503 backend failure, stream failure with zero visible coverage,
then recovery with injected components. No firewall/TLS/antivirus settings changed.

## Implemented files

- `workers/football-cv/app/match_identity.py`: strict offline match scope, explicit
  jersey/kit, reviewed references, exact source timestamps, bounded segments,
  declared resets/non-play intervals, and independently supported sightings.
- `workers/football-cv/tests/test_match_identity.py`: orange 8, opposing and
  same-team duplicates, unread jerseys, camera movement/cuts, halftime, re-entry,
  source/revision validation and deterministic replay.
- `workers/football-cv/eval/match.py`: explicit authorization, local-file-only
  metadata/decode, streaming source hash, default plan-only, cached CPU inference,
  exclusive atomic JSON publication and no false completion after segment failure.
- `workers/football-cv/tests/test_match_evaluation.py`: ingestion and command
  validation, fourteen-segment 140-minute schedule, privacy, non-overwrite and
  independent segment identity regressions.
- `workers/football-cv/app/backends.py`: reusable cached-only/CPU loader options;
  production defaults are unchanged. Removes duplicate model initialization from
  the new evaluator.
- `workers/football-cv/tests/test_local_models.py`: cached-only, CPU and unchanged
  production-default policy propagation.
- `workers/football-cv/tests/test_worker.py`: HTTP lifecycle/failure regressions.
- `workers/football-cv/app/identity.py`: conservative supported-range ambiguity
  checks, replacing exact timestamp equality for competing tracks.
- `workers/football-cv/eval/predict.py` and `eval/smoke.py`: shared candidate
  redaction applied to all local evaluation result persistence.
- This report: reproducible instructions, results and remaining boundaries.

## Identity semantics and remaining limits

The match resolver remains a pure, deterministic kernel. The gated worker,
callable and app action described above now integrate it; production is not
enabled or deployed.
It joins supported samples under one match-scoped explicit target description;
it does not implement learned re-identification or infer temporal continuity.
Local track IDs never transfer identity between segments. Every segment/reset
requires fresh local jersey consensus and kit evidence. Opposing-kit observations
cannot confirm the target; competing same-kit number matches remain ambiguous.

Reference observations are retained with scope/hash/frame/box/time, not treated
as labels for every subsequent frame. The source/PTS adapter above requires
exact reviewed provenance; it cannot backfill legacy rounded frames. Confidence values
are heuristic, not calibrated probabilities. `calibrated` and
`continuousIdentityValidated` remain false.

Halftime is not inferred from minute 45 or the 140-minute recording duration.
Supplied non-play intervals remain UNKNOWN, including visible warm-ups; source
time is never silently converted to match-clock time. Missing footage and re-entry
gaps have no invented coordinates, distance, events or coaching evidence.

## Exact local command

Run in PowerShell. Enter the actual authorized MP4 path and recording-relative
timestamp in seconds (not match-clock time). This first command only plans; it
does not load weights or run inference. A 140-minute file produces fourteen
ten-minute segments, with final duration controlled by video metadata.

```powershell
Set-Location C:\ZLI\M335\ScoutX\workers\football-cv
$video = Read-Host 'Authorized local MP4 path'
$reference = [double](Read-Host 'Recording timestamp where orange 8 is readable, in seconds')
$planOut = Join-Path '..\..\.local' ('orange8-plan-' + [guid]::NewGuid().ToString('N'))
.\.venv\Scripts\python.exe -m eval.match --input "$video" --out "$planOut" --jersey-number 8 --kit-primary-color orange --reference-sec $reference --authorize-local-evaluation --plan-only
```

After reviewing `plan.json`, run inference into a DIFFERENT new directory. The
following cache paths refer to the previously installed local evaluation weights;
they do not identify or reuse the earlier jersey-20 recording. Missing cached
weights cause failure rather than a download. Full-match CPU inference can be
slow and is not a substitute for an annotated benchmark.

```powershell
$env:HF_HOME = 'C:\ZLI\M335\ScoutX\.local\intelligence-v2-footage\models\huggingface'
$env:TORCH_HOME = 'C:\ZLI\M335\ScoutX\.local\intelligence-v2-footage\models\torch'
$env:EASYOCR_MODULE_PATH = 'C:\ZLI\M335\ScoutX\.local\intelligence-v2-footage\models\easyocr'
$runOut = Join-Path '..\..\.local' ('orange8-run-' + [guid]::NewGuid().ToString('N'))
.\.venv\Scripts\python.exe -m eval.match --input "$video" --out "$runOut" --jersey-number 8 --kit-primary-color orange --reference-sec $reference --authorize-local-evaluation --run
```

The authorization flag is an explicit local-evaluation attestation, not permission
for model training or provider uploads. Results contain no footage, faces, source
URLs or credentials. Target traces contain source-relative time and pixel boxes.
`referenceSec` is provenance only, not an automatic identification anchor.
Interrupted/failed runs may retain their plan and completed segment files, but
must not have `complete.json`. Existing output directories are never reused.

Every segment result includes `decodeAudit`: sampled source intervals, missing
intervals, count, timestamp validity and completeness. This is sample coverage,
not full-frame decode coverage or tracking accuracy. Normal frame quantization
is allowed up to half a sample step (0.25 seconds at 2 fps); larger missing
prefixes, gaps or tails fail the run even when model stage status says complete.
Failure diagnostics are saved with candidate identities removed. A completion
record is written only after every segment passes both stage and decode checks.

Raw predictions do not measure accuracy. Independent human keyframe annotations,
visibility/non-play intervals and event labels are needed for `eval.evaluate` and
the approval workflow in `accuracy-report.md`. The new raw segment output is not
an approval report and does not enable any production flag.

## Provider-link boundary

The existing local decoder and HTTP decoder remain separate. A provider connector
must resolve a viewing link through an officially authorized API into a permitted
media source; it must not send a login HTML page to the video decoder. No Veo
connector, browser-cookie extraction, protected stream scraping or authentication
bypass was added. The local command rejects Veo links with an actionable
integration/export error and does not echo URL query tokens. Where integration access is unavailable, the actionable outcome
is to request provider/club integration access or an authorized export, not claim
that a shared viewing link is supported. Provider consent, token revocation,
SSRF protection, retention and source ownership must precede server-side import.

## Previous Verification

- Worker suite after all three review fixes: 210 passed, none skipped; local
  loopback permission granted. Log: `.local/match-review-fixes-python.log`.
  One existing Starlette/httpx deprecation warning remains.
- App unit suite: 586 passed, none skipped.
- TypeScript and ESLint: passed.
- Legal generated-content check and marketing path guards: passed.
- Full Firebase rules suite: 244 passed, none skipped. Functions build passed.
- Static legal/marketing/thumbnail browser suite: 30 passed across desktop/mobile.
- Guest-entry browser suite: 12 passed across desktop/mobile.
- Marketing asset validation: passed.
- Real PyAV planning CLI: passed on a generated two-second local video; no models
  loaded and no real-footage accuracy claimed.
- Cached-model execution after the review fixes: passed on that generated video,
  four sampled frames covering [0, 2), no missing intervals, zero persisted
  candidates, UNKNOWN identity and empty target trace. Logs/results:
  `.local/match-review-fixes-synthetic.log` and
  `.local/match-review-fixes-synthetic-run/`. No network downloads or private
  footage were used. Transformers emitted its existing slow-processor notice;
  this run is execution evidence only, not football accuracy evidence.
- Authenticated desktop/mobile flows: 49 passed, 3 failed, 2 skipped, 2 did not
  run, retries disabled. Failures are mobile clip upload, Privacy Center data
  export and scout trial acceptance. The skips are opt-in marketing captures;
  the remaining tests did not execute after dependent flow failures. These
  browser issues were unresolved at this checkpoint. The isolated desktop/mobile
  runs in the current update supersede these three failures.
  Log: `.local/match-evaluation-e2e.log`.

App/rules/browser checks above were run in the same work session before the
Python-only review follow-up; all worker tests were rerun after that follow-up.
No frontend, Firestore rules, Functions contract or production gate changed in
the three review fixes.

## Review fixes

1. Non-target candidates: the shared `target_only_segment` serializer removes
   ALL candidates (including track IDs, jersey reads, confidences and times)
   from smoke, manifest and full-match outputs. It does not mutate the in-memory
   worker response. Both successful and failed-run diagnostics are tested with
   target 8 and a non-target candidate wearing 18.
2. Competing tracklets: supported episode ranges now trigger ambiguity even with
   1 ms timestamp jitter. No timestamps are rounded into invented source frames.
   This is conservative and may abstain more often; it is not calibrated ReID.
3. Partial decoding: an independent source audit prevents false completion for
   late starts, premature EOF, internal gaps, empty or invalid timestamps.
   Tests assert a redacted diagnostic remains but no completion record exists.

Consent, ownership, provider access, CV approval and release gates remain intact.
No footage or annotations were added to a dataset, uploaded or used for training.

Logs are private local artifacts under `.local/match-evaluation-*.log`.

## Next stage

### Trusted evidence staging follow-up (2026-10-24)

The privileged metadata staging workflow is implemented. See
`docs/video/trusted-evidence-staging.md` for dry-run/commit commands, trust
assumptions, bounds, source-read behavior and real-footage validation gaps.

Files created:
- `functions/src/analysis/identityEvidenceValidation.ts`: reusable complete-run,
  target-only, source/PTS, segment coverage and worker/model validation.
- `functions/src/analysis/identityEvidenceSource.ts`: bounded, read-only retained
  source hashing and immutable generation receipts; emulator-only test seam.
- `functions/src/analysis/identityEvidenceStaging.ts`: private transactional
  leases, bounded chunk batches, atomic publication, idempotency and cleanup.
- `scripts/stage-identity-evidence.mjs` and `.d.mts`: explicit operator workflow,
  dry-run default, bounded JSON loading and strict scoped commit inputs.
- `tests/unit/identityEvidenceStaging.test.ts` and
  `tests/unit/evidenceStagingCli.test.ts`: deterministic validation/CLI coverage.
- `docs/video/trusted-evidence-staging.md`: operator and trust-boundary guide.

Files updated:
- `identityCoordinator.ts`: shared gate checks and staged-source generation
  validation before and after coordination.
- `identityCallable.ts`, `targetAnchorCallable.ts`, `corrections.ts` and
  `videoConsent.ts` under `functions/src/analysis`: invalidate staging leases
  and unpublished chunks on edits, rejection and withdrawal.
- `tests/rules/targetAnchors.test.mjs`: transactional publication, retry,
  conflicting/current source, privacy withdrawal, expiry recovery and large
  generated full-match metadata regressions.
- Generated `functions/lib/analysis` JavaScript/source maps: rebuilt with tsc.
- Privacy deletion/retention matrices and this report: record lifecycle and
  distinguish synthetic correctness from independent real-match validation.

No public staging endpoint, production flag, immutable approval, consent rule,
training dataset or learned model was enabled or changed. The current compiled
CV approval remains null. A successful staging receipt is not an accuracy report.

Verification logs are `.local/staging-unit-final.log` (631 tests),
`.local/staging-rules-final.log` (57 affected emulator tests),
`.local/staging-target-final.log` (21 passing final identity/staging tests,
including multi-batch 140-minute metadata and interrupted-publication cleanup),
`.local/staging-build-final.log`, `.local/staging-types-final.log` and
`.local/staging-lint-final.log`. Browser/native and Python worker suites were
not rerun in this follow-up: their code was unchanged; previous results above
are historical, not new evidence. Real-cloud storage streaming has not been
validated by the emulator source-verifier seam.

Validate the implemented source-hash/PTS adapter on representative authorized
footage with independent review, and measure wrong-person rate, abstention,
visibility recall and cross-boundary recovery before changing association rules.
Learned long-term ReID, automatic halftime detection, calibrated confidence,
provider import, native runtime validation and full-match accuracy remain open.
Training requires separate rights, policy/consent and dataset approval; none is
authorized or performed by this evaluation workflow.
