# Video Intelligence Gap Matrix

Updated 2026-10-09 (release-hardening phase). Every status is backed by the evidence column; nothing
is marked validated that was not observed.

Statuses: **Completed** (implemented, automated evidence in this repo) · **Partial** (part of the
requirement is implemented; the rest is named) · **Unimplemented** · **External** (needs
configuration or a service outside the repo) · **Awaiting real-world validation** (implemented, but
only a real device, real footage or a reviewer can confirm it).

## Uploads

| Requirement | Status | Evidence / what is missing |
| --- | --- | --- |
| Per-chunk CRC32C, verified by the server | Completed (server compares its own hash) | Client folds CRC32C per committed chunk (`crc32c.ts`, `resumableSessionUploader.ts`) and declares it via `declareUploadChecksum` before the final chunk; quarantine compares with the hash GCS computed (`integrityVerdict`) and rejects `integrity_mismatch` / `integrity_missing`. The client value alone is never trusted. `tests/unit/uploadIntegrity.test.ts`, `tests/rules/uploads.test.mjs` |
| Resume after app kill with revalidation | Completed in code; **awaiting device validation** | Pending record persists session, fingerprint, committed checksum; on resume: resume window, server session state, file fingerprint (`file_changed`). Multi-chunk resume is tested against a fake resumable endpoint only (the Storage emulator finalises on the first PUT) |
| Persistent copy of picked files | Completed | Picker cache files moved to `Documents/pending-uploads/`; released on cancel/discard/withdrawal; completed copies swept after 24 h (`uploadCopies.ts`) |
| Streaming from disk, truthful progress and ETA | Completed | Chunks read from disk per range; progress = server-acknowledged bytes; ETA only when the rate is stable (`stableEtaSeconds`), otherwise "estimating" |
| Pause, retry, cancel, network loss | Completed in code; **awaiting device validation** | Retries reset only on real progress (fixed a pre-existing infinite retry loop on persistent errors) |
| Low storage | Partial | Disk-space check before copying; not tested on a full device |
| Idempotent completion | Completed | Server treats a finished session as complete; quarantine is idempotent |
| Abandoned-session cleanup | Completed | Stale `uploading` jobs expire after 7 days and their media is removed (`sweepMediaLifecycle`); local copies swept |
| Raw media owner-only and temporary | Completed | Storage rules owner-read, server-write; lifecycle deletes source unless kept |
| No logging of signed URLs, tokens, paths | Completed | `functions/src/logging/redact.ts` (`logSafeError`) applied to upload, analysis, lifecycle, deletion and export logs |
| iCloud cloud-only files | **Awaiting device validation** | Document picker copies to cache (downloads first); "preparing" state shown. Not observed on a device |

## On-device quality preflight

| Requirement | Status | Evidence / what is missing |
| --- | --- | --- |
| Resolution, frame rate, bitrate, orientation from metadata | Completed (metadata only) | `footageProbeService.ts` reads expo-video track metadata without decoding the file; `buildAnalysisPreview` separates measured facts from "may affect the result" |
| Blur, exposure | **Unimplemented** | Would need a frame decoder dependency; listed to the user as "not checked" |
| Warnings only, never auto-reject on quality | Completed | Only hard limits block (shorter than 1 s, longer or larger than the plan allows); quality issues are warnings. `matchAnalysisHonesty.test.ts` |
| No frame upload without consent | Completed | Preflight reads metadata locally; nothing uploads before the consent sheet |
| iOS track metadata accuracy | **Awaiting device validation** | `isSupported` is Android-only; rotation may not be reflected, so portrait is labelled "as stored" |

## Corrections and feedback

| Requirement | Status | Evidence |
| --- | --- | --- |
| Auth, ownership, job state, consent | Completed | `submitAnalysisCorrection`: owner only (others get `not-found`), job `complete` with a report, unrevoked consent |
| Originals immutable; append-only records with actor, time, reason, target, report version | Completed | `matchAnalysisJobs/{id}/corrections`; report and stats never rewritten |
| Identity correction, false event, confirm/dispute, withdraw | Completed | UI on possible events, evidence and identity frames |
| No automatic conversion into statistics | Completed | Corrections never change `eventCounts` or stats |
| Dedupe, 300-per-job limit, no cross-user writes | Completed | Transactional; rules: owner read, all client writes denied |
| Not used for training | Completed | `usedForTraining: false` on every record; UI footnote matches the AI use policy |
| Tests | Completed | `tests/unit/analysisCorrections.test.ts`, `tests/rules/analysisPipeline.test.mjs` ("analysis corrections"); included in data export and account deletion |

## Evidence integrity and lifecycle

| Requirement | Status | Evidence |
| --- | --- | --- |
| Withdrawal stops subsequent stages | Completed | Withdrawal during upload validation discards both copies (`uploads.test.mjs`); mid-pipeline withdrawal: no frame reaches the model or the worker, media removed (`analysisPipeline.test.mjs`) |
| Lifecycle deletes only known object names | Completed (semantic change) | Cleanup now deletes only `video.mp4`, `frames/frame_N.jpg`, `clips/clip_N.mp4`; anything else under a job is left and counted for review |
| Legacy media dry run before cleanup | Completed in code; **production run blocked** | `scripts/legacy-media.mjs` (read-only default, exact object + generation apply, sources never deleted without an owner decision, library-filed footage never). Emulator-tested. Production dry run needs Application Default Credentials (not available on this machine) |
| Worker scratch storage, caches, logs | Completed (code review) | Worker streams with PyAV, writes no media, logs counts only, runs as non-root without a media volume; model caches hold weights only. Functions scratch dirs removed in `finally` |

## Computer-vision worker and evaluation

| Requirement | Status | Evidence / what is missing |
| --- | --- | --- |
| Reference worker (tracking, identity, availability) | Completed, **not deployed** | `workers/football-cv`, pytest |
| Identical numbers, opponent with same number | Completed | Co-visible number matches → CANDIDATE (ambiguous); wrong kit excluded when the kit is known |
| Event detection, pitch mapping | **Unimplemented** | Stage always `unavailable`; evaluator refuses to score events and the gate refuses event approval |
| Separate metrics: identity accuracy, switches, continuity, visibility, coverage, reliability, events | Completed (harness) | `eval/evaluate.py` with per-video raw counts; `eval/predict.py` produces a local identity trace |
| Difficult-footage slices | Completed (harness) | 8 difficulty tags, each a required slice with its own minimum and metrics |
| Dataset composition and provenance | Completed (harness) | `manifest.schema.json`: footage SHA-256, documented permission, annotator ids |
| Gate not passable by a flag or a typed-in report | Completed | `scripts/lib/cvApproval.mjs` binds the approval to report/manifest/threshold hashes and recomputes every metric; the runtime needs the generated approval (`cvApproval.generated.ts`) **and** an exact worker-version/model match per response. Flags alone → `not_evaluated` |
| Real-footage evaluation | **Awaiting real-world validation** | No annotated dataset exists; worker not deployed. See `accuracy-report.md` for the exact evidence required |
| Thresholds | **External** (owner decision) | `thresholds.json` stays `proposed`; rationale in `acceptance-thresholds.md` |

## Trends and identification privacy

| Requirement | Status | Evidence |
| --- | --- | --- |
| Trends gated at ≥ 3 analyses | Completed | `analysisTrends.ts`: same kind (clip vs match), same scale, confirmed identity; unknown ≠ 0; source label per series; caveat "not statistically reliable". `tests/unit/analysisTrends.test.ts` |
| No facial recognition or biometrics | Completed | Release-gate check over app, functions and worker dependencies; contract pins `faceRecognition: false`. There is no reference-photo feature, so nothing could be embedded |
| No silent player switching; uncertainty and off-camera shown | Completed | Identity changes only through the player's confirmation; corrections never move identity; availability windows and coverage shown |
| Confirmation before personalised coaching | Completed | Coaching held back until "Is this you?" is confirmed |

## Builds and devices

| Requirement | Status | Notes |
| --- | --- | --- |
| New native dev build (expo-document-picker) | See final report | EAS development profile builds for the iOS simulator |
| Physical iOS / Android validation | **Awaiting real-world validation** | `device-test-protocol.md`; nothing observed on a device in this phase |
