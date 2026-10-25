# Video Intelligence 2.0 Implementation Handoff

Date: 2026-10-23. Overall: **PARTIALLY IMPLEMENTED / NOT PRODUCTION VALIDATED**. This pass delivers tested local improvements, not the entire requested production tracking platform. No worker deployment, production mutation, paid inference, annotated real-footage accuracy benchmark, remote build or store submission occurred. Authorized local footage preparation and smoke testing are distinguished below. Earlier dirty design/release/legal changes were preserved; no mixed-scope commit was created.

## A. Implemented Changes And Exact Files

Audit and architecture baseline: `docs/video/intelligence-v2-audit.md`. Existing Expo, feature hooks/repositories, Firebase contracts, consent versions, youth controls, entitlements and approval gates remain authoritative.

Research follow-up: `docs/video/flagship-architecture.md` reconciles the supplied research with local evidence and proposes versioned target anchors, match-scoped association, two-clock timelines, calibration and milestone acceptance. These are architectural proposals, not newly deployed capabilities.

Subsequent authorized implementation: `docs/video/target-anchor-delivery.md` records the separately gated app/server anchor workflow and offline experimental identity kernel. It supersedes the proposal-only status for those limited foundations, not for temporal Re-ID, match-clock mapping, calibration or production integration.

Upload transport:
- `src/features/media-upload/services/resumableSessionUploader.ts`: bounded no-progress recovery, strict offsets, bounded request timeout/abort, short-read and premature-completion rejection, retry-loop pause/cancel checks, released chunk references.
- `tests/unit/chunkedUpload.test.ts`: adverse protocol regressions; existing integrity tests retained.
- `scripts/benchmark-upload.mjs`: reproducible localhost HTTP benchmark using actual uploader and client/server CRC32C, without a whole-file source allocation.

Server and evidence boundaries:
- `functions/src/analysis/frameAnalysis.ts`: generation-bound leases/failure/final commits; 15-position targeting and prompt context.
- `functions/src/analysis/segmentPipeline.ts`: generation-aware CV cache; transactional current-generation CV/review commits; synthesis reparses segment contracts; event counting requires visible-target interval support; incomplete CV coverage cannot mark tracking fully complete.
- `functions/src/analysis/cvContract.ts`: rejects contradictory visibility/stages/identity, impossible decoded counts and uncited event intervals; reusable confirmed event coverage validator.
- `functions/src/analysis/pipeline.ts`: carries expected generation into frame analysis/failure handling.
- `functions/src/analysis/taskDispatcher.ts`: rejects malformed job IDs, non-integer/negative/unsafe task generations.
- `functions/src/analysis/identityCallable.ts`: rejected identity clears target-dependent coaching, evidence, events, statistics and summaries, invalidates in-flight generations and cancels unfinished work.
- `functions/src/analysis/corrections.ts`: attributed append-only feedback remains; not-me feedback also invalidates dependent report claims transactionally. Ownership/consent/target existence are rechecked inside the write transaction. Undo cannot resurrect invalidated claims.
- `tests/unit/cvEvidence.test.ts`, `tests/unit/videoIntelligence.test.ts`, `tests/unit/analysisPipeline.test.ts`, `tests/rules/analysisPipeline.test.mjs`: contract, task, stale-generation and identity invalidation coverage.

CV worker:
- `workers/football-cv/app/identity.py`, `pipeline.py`, `backends.py`.
- `workers/football-cv/tests/test_worker.py`, `test_identity_hardening.py`.
- Exact behavior and limitations: `docs/video/intelligence-v2-cv.md`.

Football report and roles:
- `functions/src/analysis/positionFramework.ts`, `segmentReview.ts`, `clipAnalysis.ts`: evidence-grounded role lenses, still-frame limits, conservative normalization, short-clip/frame/segment prompt integration.
- `src/features/match-analysis/types.ts`, `components/MatchAnalysisModal.tsx`: all 15 role codes selectable alongside legacy broad groups.
- `components/intelligence/ReportEvidenceOverview.tsx`, `reportEvidence.ts`: completeness/sampling/provenance and known-frame timeline.
- `components/AnalysisReportScreen.tsx`, `repositories/MatchAnalysisRepository.ts`: live report subscription so invalidation is reflected without reopening; authorized retained-source seeking remains bounded.
- `components/AnalysisIntelligenceCards.tsx`: GPS sync failure is handled and shown, invalid anchor times are refused instead of causing an unhandled rejection.
- `components/CorrectionControls.tsx`: corrected implementation comment.
- `tests/unit/positionFramework.test.ts`; `docs/video/intelligence-v2-report.md`.

Wearable import:
- `src/features/gps/services/gpsImportService.ts`, `gpsImportStorage.ts`, `gpsImportInteraction.ts`.
- `src/features/gps/components/GpsImportPanel.tsx`, `GpsTrackingScreen.tsx`, `src/features/gps/index.ts`.
- `src/features/auth/services/accountService.ts`: clear the owner-local import after confirmed server account deletion; sign out even if cleanup raises an error.
- `tests/unit/gpsImport.test.ts`, `gpsImportStorage.test.ts`, `gpsImportInteraction.test.ts`; `e2e/flows/gpsImport.spec.ts`.
- `src/i18n/locales/{en,de,fr,es,it,nl,pt}/gps.json`: translated import UI with key/placeholder parity.
- `package.json`, `package-lock.json`: existing `@xmldom/xmldom` 0.8.15 promoted to a pinned direct runtime dependency. No unrelated upgrades.
- Details: `docs/video/intelligence-v2-gps.md`.

Player cards:
- `src/components/player-card/PlayerCardImage.tsx`, `playerCardPresentation.ts`.
- `src/features/scout-discovery/components/PlayerDiscoveryCard.tsx`, `tests/unit/playerCardPresentation.test.ts`.
- Image attempt state is keyed by player/URI, avatar/banner fallbacks and long/missing-field layout improved, independent save/compare targets, explicit self-rating provenance. Discovery/carousel integrations are documented in `docs/video/intelligence-v2-cards.md`; other card families are not falsely claimed migrated.

Provider and translated feedback:
- `functions/src/ai/providerConfig.ts`, `tests/unit/aiPrivacyGate.test.ts`: repair the retired default using already-allowlisted Gemini 2.5; privacy routing stays unchanged.
- `src/i18n/locales/{en,de,fr,es,it,nl,pt}/matchAnalysis.json`: accurate identity invalidation footnotes and localized GPS sync error.
- `docs/video/intelligence-v2-infrastructure.md`: researched official service, privacy, license, cost and setup dependencies.

Paths abbreviated under a feature heading belong to that feature's directory. Other dirty GPS/design files in git status predate this pass; they were not reverted or relabeled as new work.

## B. Tracking Improvements

The reference remains RT-DETR + ByteTrack + EasyOCR. Worker version is now `football-cv/0.3.0`; HTTP v2 stays compatible. Multi-frame weighted OCR consensus, distinct-timestamp voting, bounded local evidence, conflicting-read rejection and coarse gap/cut resets replace whole-track attribution from three isolated reads. Unknown intervals stay unknown; no off-camera movements, substitutions or coordinates are inferred.

The legacy `CONFIRMED_VISIBLE` label and numerical confidence are **uncalibrated heuristics**, not a measured probability or verified personal identity. No annotated real-footage precision/recall, ID-switch, re-entry, detector comparison or GPU-memory result exists. Local smoke timing is not a production latency benchmark. Long-term appearance re-identification and cross-request/cross-segment identity stitching are **not implemented**. The nominated description persists, but that is not identity-continuity proof.

## C. Upload Performance And Recovery

Final localhost benchmark: Node v22.23.3 / Windows, 64 MiB per configuration, actual HTTP transport and verified matching client/server CRC32C:
- 256 KiB chunks: 256 PUTs, 1.510 seconds, 42.39 MiB/s; maximum source read 256 KiB.
- 1 MiB chunks: 64 PUTs, 1.189 seconds, 53.82 MiB/s; maximum source read 1 MiB.
- 4 MiB chunks: 16 PUTs, 0.868 seconds, 73.76 MiB/s; maximum source read 4 MiB.
- 8 MiB chunks: 8 PUTs, 0.821 seconds, 77.92 MiB/s; maximum source read 8 MiB.

Record: `.local/intelligence-v2-upload-benchmark-final.json`, measured `2026-10-23T13:07:20.594Z`. These are single-run synthetic loopback measurements under concurrent local workloads, not device/Wi-Fi/cellular/GCS throughput, RSS measurements or an optimal-chunk-size proof. The existing 8 MiB default remains unchanged. Existing recovery tests include dropped responses after commit, CRC checkpoint restore, expired sessions and wrong source files; new tests cover adversarial responses and stalls.

Native transfer remains foreground JS-driven. No background URLSession/Android foreground-service continuation is implemented or claimed. Force-quit/reboot recovery, iCloud source preparation, 1/3 GiB and 90/150-minute transfers still need physical devices. Limits remain 4 GiB and 150 minutes; this does not mean every 4K full match fits under the byte ceiling. No quality-destroying compression was added.

## D. AI Analysis

OpenRouter routes only through existing approved privacy settings; unavailable privacy-compatible endpoints must fail. The catalog-available already-allowlisted Gemini 2.5 replaces the absent 2.0 default. This is an availability repair, not a newly benchmarked winning provider.

All 15 requested positions have distinct role lenses. Role labels are nominated context, never proof of the observed role. Role changes need evidence and are not persisted as a new interval model. Coaching and drills cite known observations; replay/non-play/unclear frames are excluded from performance observations. Still-frame suggestions never become counted events just because prose is confident. Existing subjective technique stars retain their prior provenance; no objective AI match rating was introduced.

The evidence overview/timeline exposes available/limited/insufficient sections, reviewed/failed parts, sampled-frame denominator, stored models and versions. Missing citations cannot create seek links; deleted original media cannot create a broken retained-video player. This is not a continuous action timeline or full temporal football-understanding engine.

## E. Heatmaps

Video pitch landmarks, homography, calibrated ground-contact coordinates, camera-motion correction, first/second-half orientation and video heatmaps remain **not implemented**. No arbitrary pitch spots or generated coordinates were added. Existing unavailable states remain in force.

GPS import can display an existing session-local movement grid for one continuous frame, with source and unknown-orientation labeling. Multiple independently reset coordinate frames withhold spatial output rather than superimposing them. This is not calibrated pitch occupancy, known attacking direction or a merged video/GPS map. No geographic origin is persisted. Accuracy against ground truth is not measured.

## F. GPS Integrations

Implemented: on-device GPX tracks, TCX tracks and a documented narrow numeric CSV schema; import preview/cancel/confirm, local latest-summary persistence, reload, owner separation, deletion, bounded files/samples, timezones, poor-accuracy/spike/gap filtering and secure IDs. Original coordinates, raw XML/CSV, source filenames/URIs and original fix timestamps do not persist. Imported values are user-supplied position-derived estimates, not certified vendor metrics.

Not implemented: FIT, ZIP, vendor-specific CSV adapters, authenticated vendor accounts, cloud import history, verified match linking, imported-video synchronization, clock drift, pitch/half orientation and acceleration metrics. No actual STATSports/Catapult/Garmin/Polar/Playermaker file was supplied or declared compatible. Existing phone-GPS synchronization is retained; importing a file does not fake a connected account or synchronize it automatically.

## G. Player Cards

Reusable image/fallback and presentation helpers repair discovery-card reuse across changed players/URLs and prevent failed image state from sticking. Save/compare no longer nest inside navigation. Missing values and invalid evidence counts are not fabricated. Existing privacy/discoverability projections remain unchanged. Pure helper/state-key tests and existing scout browser flows pass; a complete native visual-regression matrix for every card family remains outstanding.

## H. Verification

- Baseline: 531 unit tests passed; TypeScript passed before implementation.
- Final expanded unit suite: **574 passed, zero failed/skipped** (`.local/intelligence-v2-unit-final.log`), including cancellation during the final committed chunk.
- Final TypeScript and ESLint logs: `.local/intelligence-v2-typecheck-final.log`, `.local/intelligence-v2-lint-final.log`.
- Full Python suite: **56 passed**, including HTTP TestClient; one dependency deprecation warning (`.local/intelligence-v2-python-final.log`). The earlier sandbox run omitted the HTTP case; an elevated local run resolved that environment limitation without changing the app.
- First integrated rules/release gate: **235 tests passed**, 24 checks passed, zero code blockers; public release blocked by 10 external/legal/validation items. Final frozen-source rerun recorded below.
- First integrated browser run: **25 passed, one intentional capture-only skip**; new GPS flow passed separately on desktop and mobile. Mobile pixels reviewed; development overlays are not public creative. Final capture-enabled run recorded below.
- Local iOS Metro/Hermes export passed with the XML parser included. This is not Xcode compilation, signing, native launch or a new TestFlight artifact.
- Git whitespace check passed. No new lint/type errors are accepted as external blockers.
- Independent scoped review found no concrete regressions; its 84 focused tests passed before the final-chunk cancellation regression was added. This is not a comprehensive security certification.

Final frozen-source reconciliation: **235 rules tests passed**, 24 gate checks passed, zero code blockers; the same 10 external/legal/validation blockers remain. Capture-enabled app journeys: **27 passed**, zero retries/skips. Website/legal/video-thumbnail suite: **30 passed** across desktop/mobile. Final iOS Metro/Hermes export passed (14,010,219-byte bundle); this is not a native App Store build. Logs: `.local/intelligence-v2-{gate,e2e,static}-final.log`; export: `.local/intelligence-v2-ios-export-final`.

### Authorized Local Footage Follow-Up

The user supplied permission, local footage and target 20 (orange/white, nominated CAM), then identified a readable anchor at **242 seconds**. Manual original-resolution inspection finds a readable 20 on the nearby player's shorts. This is a manual anchor, not model identity validation. Twelve genuine samples and anchor context remain ignored under `.local`, never published or uploaded to a provider.

Actual source: 2,234,907,293 bytes, 2,034.892 seconds (about 33:55), 1920x1080 HEVC 10-bit HLG HDR, approximately 30 fps. The existing server metadata preflight accepts this source. This is not a 90/150-minute upload or accuracy benchmark. HDR-to-RGB normalization remains an evaluation concern.

`scripts/prepare-video-evaluation.mjs` creates sanitized local metadata, streaming source/frame hashes and twelve bounded samples without uploading footage. `workers/football-cv/eval/predict.py` now decodes local files with a file-only protocol policy, leaving production HTTP restrictions unchanged. `eval/smoke.py` adds a bounded, at-most-15-second reference-model test; `tests/test_local_decode.py` covers its decoder isolation and sampling bounds. Model smoke results are recorded separately from annotated accuracy.

Local decoder integration returned **10 actual 1920x1080 RGB samples** over seconds 240-245 at 2 fps. Expanded Python suite: **61 passed**, one existing Starlette deprecation warning (`.local/intelligence-v2-python-anchor-final.log`); new preparation script ESLint passes. Public model dependencies were installed only in the ignored Python environment (CPU torch 2.8.0/torchvision 0.23.0, transformers 4.57.1, supervision 0.26.1, EasyOCR 1.7.2, compatible PyAV wheel). The initial PyAV 14.4 source build failed due to absent FFmpeg headers; a permitted prebuilt version resolved installation without changing production requirements. Public weight download needed Windows system certificate trust; TLS verification was never disabled.

**Actual local model result:** RT-DETR + ByteTrack + EasyOCR processed all 10 samples over seconds 240-245. Cached model load: **7.975 seconds**; CPU inference/decode: **20.261 seconds**. Identity: **UNKNOWN**, zero confirmed target-visible seconds, no target trace and no events; pitch/events unavailable. A separate single-anchor-frame run returned only an unread-number candidate, not confirmation. A human-readable shorts number does not establish torso OCR success. This is an observed failure to confirm this anchor window, not a precision/recall estimate or proof the player is absent.

An initial combined-runtime run stalled in local frame iteration; a 45-second diagnostic localized the stall, and file-only single-thread slice decoding resolved it in the local evaluator. Production HTTP decoding was not changed. Final output: `.local/intelligence-v2-footage/anchor-smoke.json`; log: `anchor-smoke-final.log`. PyAV is **14.2.0**. CPU thread controls are explicit in the smoke CLI. No footage/frame upload or paid inference occurred. Next model work must evaluate manual-anchor seeding and torso/shorts number evidence against independently annotated slices, without lowering identity thresholds merely to obtain a positive result.

## I. Costs And Infrastructure

See `intelligence-v2-infrastructure.md` and GPS vendor documentation for exact purposes, accounts, credentials, IAM, regions, privacy implications, setup/failure/test procedures and official sources. No paid provider/GPU operation was benchmarked. No observed cloud currency-per-match, provider comparison or commercial license approval is claimed. Existing entitlements and quotas were not relaxed. Per-stage billing instrumentation, duplicate-delivery inference-cost suppression and comprehensive lease/dead-letter modernization remain backlog items, not completed cost accounting.

## J. Readiness And Next Steps

- **Implemented and locally validated:** bounded upload protocol fixes, strict CV/event contract checks, generation-safe commits, identity invalidation, position lenses/role selection, local text-file import/stripping/storage helpers, card presentation helpers. Their physical-device/model-accuracy acceptance remains unvalidated.
- **Implemented but not production validated:** reference worker heuristics; report UI/timeline; native upload/resume; local wearable picker/heatmap. Local browser/logic tests do not establish scientific accuracy or native lifecycle reliability.
- **Partially implemented:** complete-match workflow, target review/corrections, progressive report, GPS import ecosystem, card-family unification, distributed recovery and cost control.
- **Blocked by external dependencies:** authorized annotated evaluation corpus (footage permission/path/anchor are now supplied), real wearable reference files, physical iPhones/Androids, GPU quota/region/secure deployment, license/processor/counsel/owner approval and existing external release checks.
- **Not implemented:** long-term/cross-segment re-ID stitching, evaluated ball/action detectors, video pitch mapping/heatmaps, FIT/ZIP/vendor adapters, imported match synchronization/orientation, native background transfer, full cost instrumentation and a proven 90/150-minute real-footage end-to-end acceptance run.

Next: create private independent annotations around the supplied anchor and difficult match slices using the existing evaluation schemas, then benchmark the unchanged detector stack and proposed re-ID/calibration candidates. Obtain a reference wearable export and device test access in parallel. Only evidence-backed capabilities may proceed through separate approval and deployment. **This specification is not fully complete or ready for public release.**
