# Tracking storage v1: compatible reader/writer rollout and rollback

**PREPARED / NOT EXECUTED — 2026-11-24.** This runbook authorizes no release, deployment, billing linkage, queue
operation, data rewrite, upload, provider call or benchmark rerun. Billing stays unlinked during preparation.
B-26 and B-09 remain OPEN. Execute any later operational step only within a separately approved scope.

The source baseline is `c0d18f8` (Firestore-safe tracking storage), following `7f28e89` (final-attempt reconciliation)
and `59c4e60` (emulator integration). A source commit is not a deployed revision, installed client or approved
worker. Record exact immutable artifacts separately. The [CPU plan](cpu-production-plan-2026-11-21.md),
[B-26 integration/capacity runbook](b26-integration-capacity-runbook-2026-11-23.md) and
[storage/reconciliation contract](b26-final-attempt-reconciliation-2026-11-24.md) supply the other release gates.


**Source enforcement update, 2026-11-24:** the current reader implementation supersedes direct app reads described
for `c0d18f8`. Before any writers run, deploy and verify the restrictive Firestore rules and owner-checked
`readTrackingStorageV1` callable in a separately approved scope. App report/discovery consumers now opt into that
protocol instead of using Firestore snapshots. No enforcement has been deployed by this implementation task.
See section 8 for the exact boundary, cost/freshness trade-off and rollback amendment.

## 1. Storage boundary and compatibility

Writes to `matchAnalysisJobs/{jobId}/tracking/current` and `.../tracking/discovery` now carry the top-level marker
`tupleEncoding: "pitchproof.tracking.tuples.v1"`:

| Field | Worker and in-memory row | Firestore row |
|---|---|---|
| `report.stateStrip` | `[start, end, state]` | `{start, end, state}` |
| `report.moments[].indicator` | `[t, x, y, w, h]` | `{t, x, y, w, h}` |
| Discovery `moments[].indicator` | `[t, x, y, w, h]` | `{t, x, y, w, h}` |

The report schema remains `pitchproof.tracking.v3`; the tuple marker is a storage encoding, not a new worker API.
Decoding restores order, precision and tuple semantics. It does not round, interpolate, truncate, validate identity
accuracy or change report versions. Metadata-only merges retain the marker and encoded report.

| Reader | Legacy tuple/empty data | Object-row v1 data | Unknown marker / malformed rows |
|---|---|---|---|
| Old direct-cast app or server reader | Existing behavior; populated nested tuples were not writable to Firestore | Unsupported; may crash or use invalid geometry | Unsupported |
| Compatible decoder from `c0d18f8` | Supported, including null reports and missing optional fields | Supported | Rejects; app clears the value and reports through its existing error handler |

Firestore cannot store populated arrays directly inside arrays. Decoded tuples are therefore **not** a writable
legacy backup format for these documents. Removing the marker does not convert object rows. Do not flatten, empty,
stringify or drop coordinates/state strips to make an old reader appear to work.

Compatible readers must cover app report and discovery listeners, server identity answers, clip explanations and
discovery merges. Include any operator/export consumers that interpret these fields rather than treating them as
opaque evidence. Verify the mirrored app/Functions codecs remain identical. Worker/full-claims sidecars keep their
existing contracts and must not be passed through this storage conversion.

## 2. Required approval record — missing fields mean BLOCKED

Before operational execution, freeze a private record containing:

- Owner, operator and reviewer; approved environment/project, exact account/job cohort, resource allowlist, start/end
  window, permitted operations, spend/instance/task bounds, retention policy and stop/escalation contacts.
- Actual pre-change and candidate Functions revisions/artifact hashes, including checked-in compiled output;
  worker digest/configuration; scheduler definition; exact web/native build ids and distribution channels.
- Minimum compatible client build per supported platform, how it is enforced, evidence for dormant/offline clients,
  and which direct Firestore readers, service workers or cached browser sessions can still reach the cohort.
- Queue inventory, outstanding attempts, active lease tokens **hashed in evidence**, report versions, feedback
  revisions, generations, resume start times, OCR rounds and pending reconciliation tickets. Include all scopes.
- Private reversible evidence/backup locations, hashes, authorized access and deletion/retention dates. Preserve
  raw **encoded** documents and relevant metadata; do not publish owner ids, paths, footage or credentials.
- Tested compatible rollback artifact, rollback owner, evidence collection method, approved canary cases and exact
  expansion/stop criteria. An untested historical revision is not a rollback artifact.

No client minimum-version gate or migration service was added by `c0d18f8`. Do not assume a Remote Config flag,
store release, worker flag, callable gate or App Check prevents an old signed-in binary reading Firestore directly.
An average adoption percentage is insufficient: a dormant incompatible reader can return after rollout.

Either prove exclusive access by a separately authorized private cohort whose readers are all compatible, or
implement/review an enforceable upgrade/access plan before broader writes. If that cannot be established, keep
writer execution and CV enablement blocked. Do not improvise access-rule changes or approval records under this
runbook. Worker/model approval and independent identity evaluation remain separate requirements.

## 3. Reader-first preparation and writer quiescence

1. Inventory affected documents and consumers in the authorized scope. Distinguish no tracking data, legacy/empty
   data, object-row v1 data and unknown/malformed data. Do not scan unrelated accounts or expose raw report content.
   Unknown encodings block expansion and require investigation rather than speculative conversion.
2. Stop new approved validation admissions and producers; isolate/pause only the exact approved queues/invokers.
   Account for discovery, extraction, feedback resolves, preliminary/full resolves and OCR refreshes. Do not purge
   shared queues or discard user analyses. Review requests already dispatched and remote worker work separately.
3. Observe in-flight requests and their publication paths until the authorized quiescence criterion is met.
   A 31-minute lease expiry alone is not proof that remote computation or an image upload stopped. Do not clear
   leases to speed a rollout. Keep cancellation, consent, generation, token and publication fences intact.
4. Retain reconciliation for already registered final attempts. The sweep does no inference but can settle state;
   record pending tickets and outcomes as part of the transition. Do not disable it and call expiry recovery.
5. Release compatible app readers to the approved cohort first, and verify installed/running artifacts rather than
   only upload/store availability. Cover cold start, offline cache restoration, reconnect, existing web tabs and
   native update/restart behavior. Check that legacy/empty documents still display correctly.
6. Install compatible server consumers only within the approved deployment scope while writers remain quiescent.
   Verify identity answers, reasoning and discovery merges decode at their read boundaries. Preserve all current
   deadline, retry, lease and cancellation protections.

**Bundled artifact constraint:** `c0d18f8` contains both compatible readers and unconditional encoding at the existing
write sites. There is no dedicated format-write feature flag. Deploying it is not a reader-only server release.
Keep those write paths uninvoked until readiness is accepted, or prepare a separately reviewed reader-only artifact.
Do not label an unreviewed cherry-pick or an emulator approval seam as that artifact. Client reader deployment by
itself does not make old server consumers compatible.

## 4. Local validation and separately authorized canary

These commands are local checks, not deployment instructions. In a future validation session, run from the repo root:

```powershell
npm run typecheck
npm run build --prefix functions
node --import ./tests/unit/support/register.mjs --test tests/unit/trackingStorage.test.ts tests/unit/videoReasoning50.test.ts tests/unit/trackingResolve.test.ts tests/unit/trackingFollowUp52.test.ts tests/unit/trackingOrchestrator.test.ts tests/unit/trackingV3.test.ts tests/unit/trackingDeadlines.test.ts tests/unit/trackingReconciliation.test.ts tests/unit/trackingReader.test.ts
npm run test:b26:integration
```

The recorded codec validation was 71 relevant unit tests and 18 Firestore-emulator cases, plus typechecks, build
and targeted lint. Reader-enforcement validation on this source change reran typecheck, the functions build, the
unit command above (76 tests), targeted lint, and the emulator suite (19 tests, standard edition, including
negotiated-read denial). The read-only shared-poll change reran typecheck, the functions build, lint, the full
unit suite (908 tests) and the same 19 emulator tests. Commit-time comparison now uses Firestore `updateTime` to the
nanosecond, final reports keep a three-minute poll, and one test checks every current and discovery writer moves
`updatedAt`. The emulator runner uses loopback Firestore and
`demo-scoutx`, injected clocks, synthetic worker responses and exact generated test ids. It proves local database behavior, not live delivery, capacity,
identity or client rollout. These checks do not rerun the match benchmark.

Only after separate authorization, validate on isolated synthetic canary documents without real match inference.
Exercise actual approved app builds and server consumers with these acceptance conditions:

- A populated state strip and multiple nonempty indicator tracks persist as object rows and decode exactly on app
  and server. Compare tuple order, timestamps, identity states, coordinate values, image references, report version,
  feedback revision and follow-up facts. Include legacy/null/empty data and repeated discovery merges.
- Timeline rendering, target outlines and identity-answer pixel points match the decoded source. Clip reasoning
  receives tuple indicators; any provider invocation requires its own explicit scope. An injected local client is
  sufficient for this format check and does not establish provider or inference performance.
- A newer report or feedback revision survives stale results; concurrent takeover, OCR round fencing and final
  reconciliation work through the approved delivery path. Local tests are not a substitute for B-26 live cases.
- An unknown marker or malformed row clears the app value and surfaces its error path without displaying stale
  geometry or accepting invented coordinates. Unauthorized readers/writers remain denied.
- Supported offline/cache/reconnect scenarios work with the installed compatible reader. Record old-build access
  rejection or exclusive-cohort isolation evidence; do not allow an old reader to discover the new format by failure.

Record input/encoded/decoded hashes, build/revision ids, observed outcomes and reviewer acceptance privately.
Do not edit labels, model settings, sampling, worker precision or the historical benchmark to obtain a format pass.

## 5. Writer activation and observation — future authorization only

1. Confirm every prerequisite and reader cohort is accepted, all current B-26/B-09 blockers remain enforced, and
   candidate/rollback artifacts are pinned. Format readiness does not authorize CV or billing enablement.
2. Allow only the approved canary writer invocations. Do not resume all queues or broaden account access together.
   Confirm current and discovery documents carry the expected marker and that intended metadata-only merges leave
   encoded rows intact. Treat any old writer still running as incompatible until explicitly verified.
3. Inspect accepted canary output and client behavior before expanding to the next approved cohort. Use fixed
   acceptance/observation windows and sample counts recorded before execution; do not invent them after a failure.
4. Collect error counts for invalid nested entities, unknown/invalid tuple encoding, decoder failures, report-size
   write failures and app listener/rendering failures. Also observe queue age, active scopes, reconciliation backlog,
   stale publication rejections and OCR/version outcomes. Monitoring/reporting for this scope must be established
   and reviewed; this source change did not create a production dashboard or compatibility telemetry.
5. Stop on any incompatible reader, geometry/state mismatch, lost publication/recovery, privacy/consent breach,
   unexpected resource scope or unapproved capacity/spend increase. Keep evidence and execute only approved rollback.

## 6. Rollback decisions and procedure

| Observed state | Safe direction | Forbidden shortcut |
|---|---|---|
| No v1 documents or queued/in-flight v1 writers | After verification, use the approved prior artifact if its other contracts remain compatible | Assume absence from one account proves global absence |
| Any v1 data exists or may be cached | Retain decoder-compatible app/server readers; stop admissions/writers and fix forward or use a tested compatible rollback | Restore old direct-cast clients/Functions against v1 documents |
| Malformed/unknown encoding | Isolate affected authorized jobs, preserve encoded evidence, remain unavailable pending repair review | Delete the marker, guess coordinates, or downgrade to empty indicators/state strips |
| Pending long tasks or reconciliation tickets | Preserve matching deadlines, lease/token fences and a reviewed settlement path until drained | Restore 600/900 s limits, delete leases or abandon tickets without accounting |

For an authorized rollback:

1. Stop new scoped admissions/producers and pause the exact approved invokers/queues. Record queued and dispatched
   attempts; preserve retry budgets, consent withdrawal, cancellation, new feedback and newer report publications.
2. Determine which writer revisions and remote requests can still finish. Quarantine only authorized canary output
   and verify late results cannot overwrite newer accepted state. Observe or terminate isolated work only as approved;
   lease expiry is not cancellation. Do not delete shared artifacts or unrelated tasks.
3. Keep the compatible read path available, or leave the feature unavailable while preserving data. Select the pinned
   tested rollback artifact that still decodes both representations. No such artifact means remain disabled and
   prepare a reviewed fix; there is no automatic safe rollback to `59c4e60` or another pre-codec release.
4. Retain or explicitly replace the scheduled reconciliation path for pending tickets. Record settlement/backlog;
   disabling the scheduler leaves tickets pending. Do not invent a new attempt budget or manually rewrite running
   records to claim successful recovery.
5. Restore data only if a separately approved repair is necessary. Use a per-document transaction/precondition that
   checks the captured version, feedback revision, generation/resume lifecycle and relevant lease/OCR ownership.
   Refuse restoration over newer state, cancellation, revoked consent, deletion or a changed owner. A stale full
   database snapshot is not a safe rollback. Never recreate a deleted job.
6. Preserve coordinates and states in a Firestore-safe form. A populated decoded tuple report cannot be written as
   an old-format document; do not attempt reverse migration as the route to an old client. Keep v1 or design/review
   an explicit alternative storage and reader contract before any conversion.
7. Revalidate the permitted cohort with synthetic round-trip and ownership/publication checks before resuming any
   authorized writers, or leave disabled. Record exact restored revisions and retained documents/tickets/exceptions.
8. Apply only the approved retention/cleanup policy to exact canary resources and private backups. Verify cleanup
   outcomes and record retained evidence/expiry dates. Do not link billing for this document preparation; any future
   separately approved billed session must verify its final unlinked state under that session's cleanup authority.

## 7. Closure evidence

Record owner/operator/reviewer sign-off, exact client floor and enforcement, Functions/worker artifacts, affected
cohort, executed versus NOT_RUN cases, marker inventory, monitoring observations, rollback rehearsal and cleanup
status. A runbook, passing emulator suite or compatible local source does not establish an installed reader floor
or safe production delivery. Storage readiness can close independently only for the accepted configuration/cohort;
B-26 capacity/retry/live recovery and B-09 identity/approval conditions remain separate gates.


## 8. Implemented compatible-reader protocol enforcement (source only)

Direct Firestore reads of `tracking/current` and `tracking/discovery` are denied to **all client sessions**, even
the job owner, regardless of marker presence or value. Collection listing cannot bypass that restriction. Client
writes stay denied. Other owner-only tracking metadata, including progress, keeps its existing rule. Admin SDK
server reads still work; audit server consumers separately. This restriction deliberately includes legacy/empty
current and discovery data so a missing or unknown marker cannot become a compatibility bypass.

`readTrackingStorageV1` is the only app read path for those two documents. It requires authentication, the exact
`readerEncoding: "pitchproof.tracking.tuples.v1"` and a validated job id; unknown request fields are rejected.
The caller names `documents` (`current`, `discovery`, or both when omitted). A read-only transaction checks the
current owner and reads only those documents, so a poll does not lock worker writes. `since` carries that
document's Firestore `updateTime` as `seconds` plus nine-digit nanoseconds (`1700000000.000000001`). A matching
commit time sets `unchanged` and omits the body. A different commit returns the negotiated encoding, the decoded
document, and the new `updateTime` token, or null when the document is missing. The comparison uses the commit
time, not the millisecond `updatedAt` field, so two writes in the same millisecond both remain visible. Every
writer of these two documents also sets top-level `updatedAt`. Unknown/malformed storage fails the whole
response without returning partial data. Requests from another owner or for a deleted/missing job are refused.
The callable uses normal App Check/CORS defaults, a 30-second function limit, five-instance cap and a per-user
limit of 1,200 requests/hour. These are source defaults, not deployed resource/cost measurements.

Negotiation is **a request protocol contract, not cryptographic proof of an installed binary or decoder**. A client
that explicitly implements/emulates this request may obtain its own data after ownership checks. It grants no
account-wide capability claim, so a new phone's successful request does not authorize an old same-uid phone's
Firestore listener. Old binaries that only use the old direct path cannot receive new server snapshots, including
after their owner's other device negotiated v1. Do not describe a self-reported app version or protocol field as
build attestation. If verified build admission is required, that is a separate reviewed control.

The app uses auth-scoped polling, not Firestore snapshots, for these reports/sightings. Listeners for one signed-in
user and job share one loop. The loop asks only for the mounted documents, waits 15 seconds after a success, and
sends the last `updateTime` token so an unchanged document is not downloaded again. There is no overlapping
request in that loop. A full, not-stale report with no pending reason and no scheduled or running follow-up
slows that loop to three minutes, so a worker refresh, a rerun, a deletion, or an answer on another device still
appears while the screen stays open. Answering, undoing, or starting analysis on this device asks again
immediately and keeps the 15-second pace until the commit time changes. A discovery-only screen has no report
finality signal and keeps the 15-second pace until it unmounts. The loop stops when its last screen unmounts,
starts a new session if that job is opened again, and is keyed by the signed-in account so a switch cannot reuse
the previous loop. Network, rate-limit, and storage errors keep the last good result and back off to at most
five minutes. Unauthenticated and permission-denied responses clear it. Unsubscribe and auth changes discard
in-flight results and cancel timers. No raw Firestore fallback or persistent disk cache is added. Two devices
still share the 1,200-request hourly quota. Evaluate that callable cost and 15-second freshness before rollout;
progress remains on its direct Firestore listener. This task does not enable billing or authorize live polling.

Rules cannot revoke bytes already cached by a previously deployed reader. Before expanding an environment that
already exposed v1 documents, inventory old cached/offline sessions and apply the separately approved client/cache
upgrade plan. Do not claim new server denial erases downloaded data or stops arbitrary old local code rendering it.

Amended rollout order: quiesce writers; deploy/verify the restrictive rules first; deploy the compatible callable
and server consumers while writers stay quiescent; distribute the updated app and verify auth/protocol/decoding;
then permit only approved canary writers. A mixed window may make old clients unavailable, which is preferable to
sending them incompatible rows. Missing callable or restrictive rules means BLOCKED; never enable a direct-read
fallback to bridge that window. Rule deployment remains mandatory because Admin writes bypass Firestore rules.

Amended rollback: retain the restrictive rules and a decoder-compatible callable for documents that may contain
v1. If the compatible API cannot remain available, keep the feature unavailable. Do not restore broad direct reads
or old listeners to recover availability. No data migration or new retry budget is implied. Installed-client,
Scheduler/Tasks recovery, capacity and B-09 identity gates remain separate.

Regression evidence includes protocol opt-in on every read, cross-owner/unauthenticated rejection, missing and
future encodings, direct/list denial, same-uid old-device denial after a successful opt-in, legacy/null responses,
read-only selective snapshots, unchanged responses, one shared poller, final-report stop/resume, retained results
after transport errors, client response validation, in-flight cancellation and the existing publication/takeover/round-trip
cases. Local unit/emulator evidence does not establish deployed rules, binary attestation or live capacity. All
operational execution remains separately authorized; billing stays unlinked during source preparation.
