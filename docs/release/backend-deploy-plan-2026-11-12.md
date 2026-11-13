# Backend deployment plan — B-17 and B-18 (prepared 2026-11-12, NOT executed)

Project `scoutx-230b0` (europe-west6, Cloud Functions 2nd gen, default compute service account `141939766260-compute`).
Everything below was read without changing anything. Deploying needs separate approvals (A: index, B: backend).

## 1. Inventory (read 2026-11-12)

| Item | Live | Release source (`01f9459c2608bc939c96f5c7388b5e5ba98aac2d`; `functions/`, rules and `firestore.indexes.json` are byte-identical in the redesign and the integration candidate) |
|---|---|---|
| Functions | 81 (70 deployed 2026-10-08, 11 on 2026-10-24), all europe-west6 gen 2 | 95 exported |
| Missing live | 14: answerTrackingQuestion, coordinateAnalysisTarget, discoverTrackingTask, explainTrackingMoment, extractTrackingSegmentTask, inspectVideoSource, processLinkImportTask, refreshTrackingOcrTask, resolveTrackingTask, saveAnalysisTargetAnchor, setTrackingPeriods, startLinkImport, startPlayerAnalysis, undoTrackingAnswer | |
| Deployed but not in source | none (no deletions needed or implied) | |
| Outdated live (import closure differs from the deployed archive; **not** inferred from deployment age) | 75 of 81 (= 67 changed + 8 changed-neutral); 6 current: mediaLifecycleSweep, onDiscoverableSearchIndexWritten, onMatchJobDeleted, onMatchJobMediaLifecycle, onVerificationWrittenSyncTrust, scheduleWeeklyFootballReports | |
| Outdated only by the behaviour-neutral `callableOptions.ts` refactor | 8: confirmRole, generateHighlightReelPlan, listAdminReviewQueue, purgeLegacyGpsLocation, resolveVerificationRequest, setStaffRole, submitPrivacyRequest, updatePrivacyRequest | |
| Firestore rules | ruleset of 2026-10-24 | differs: release adds `quietHours` to notification preferences (**the release client's quiet-hours save is rejected live**), server-only `mediaImportSources`, `tracking` sub-collection |
| Storage rules | ruleset of 2026-10-08 (`scoutx-230b0.firebasestorage.app`) | differs: adds owner-read, server-write `tracking` review images |
| Composite indexes | 38, identical to the repository | B-18 index missing in both |
| Schedules | 6 jobs, identical expressions and time zones to source | no change |
| Memory / timeouts | equal to source (2Gi = 2048Mi) | no change |
| App Check in deployed code | `enforceAppCheck` on for every app-facing callable; off only for `submitPublicReport` and the guardian web callables; `ENFORCE_APP_CHECK` unset on all 81 | same logic |
| Parameter file | Live functions read `GUARDIAN_LINK_BASE_URL` from `functions/.env.scoutx-230b0` (git-ignored; present in the deployed archives, absent from the repository) | must exist locally before any deploy |
| Prerequisites | APIs enabled: Cloud Tasks, Scheduler, Run, Build, Artifact Registry, Eventarc, Pub/Sub, Secret Manager. Secrets present: ADMIN_USER_IDS, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_TEAM_ID, GUARDIAN_LINK_SECRET, OPENROUTER_API_KEY, REVENUECAT_WEBHOOK_SECRET (names only read) | the new functions need no new secret except OPENROUTER_API_KEY (exists) |
| Production data (counts only, read-only aggregation, 2026-11-12) | one database `(default)` (europe-west6, native). Root collections: only `discoverySearchState`. Collection-group counts (all depths) for all 72 collection names in the rules plus `trainingSessions` and `tracking`: **0 documents** except `discoverySearchState` = 1 (ready, version 1). Default Storage bucket `scoutx-230b0.firebasestorage.app`: 0 objects. Firebase Authentication: not initialized (B-19), so no accounts can exist | no documents to migrate today. Not proven: data written between this read and the deploy; collections whose names appear in neither rules nor code (admin SDK only). Schema compatibility still matters for the first users: the release code reads the same document shapes it writes, and the one field change (`analysisSampleCount` null instead of 0) applies to 0 documents |
| Live defect also fixed by the deploy | deployed discovery projection writes `analysisSampleCount: 0` ("unknown shown as zero"); release writes `null` | 0 documents affected today |

How "outdated" was decided: the deployed source archive of each batch (`gcf-v2-sources-141939766260-europe-west6`, read-only
copy) was compared file by file with the release source along each function's import closure. The repository history starts
2026-10-25, so the deployed code has no commit; the archives are the only record of it and should be kept for rollback.

New analysis functions stay inert after deployment: without `CV_WORKER_URL`, `TRACKING_V3_ENABLED=true`, `CV_WORKER_APPROVED=true`
and a compiled approval record they answer "unavailable" and never call a worker; link import refuses with
"Video analysis is not available yet". Deploying them does **not** approve or enable the computer-vision worker.

### 1.1 Reconciled sets (machine-readable: `backend-deploy-manifest-2026-11-12.json` / `.csv`, one row per desired export)

| Set | Count | Members |
|---|---|---|
| D = desired exports (release `functions/lib`, built with the production config) | 95 | manifest rows |
| L = deployed resources (Cloud Functions API, all europe-west6, GEN_2, ACTIVE, runtime nodejs20) | 81 | each with its own Cloud Run revision and build ID in the manifest |
| D ∩ L | 81 | |
| D \ L = missing | 14 | listed above (13 deploy, `setTrackingPeriods` hold: no client caller) |
| L \ D = retired / renamed | 0 | nothing to delete; no rename detected |
| D ∩ L by status | 6 unchanged + 8 changed-neutral + 67 changed = 81 | |
| Actions | deploy 80 (67 changed + 13 missing) + hold 15 (6 unchanged + 8 neutral + 1 missing) = 95 | group files: 33 + 47 = 80, no overlap, equal to the deploy set |

Checked in the audit of 2026-11-12 (evening): no live function is absent from source, so a scoped `--only functions:<list>` deploy
deletes nothing and offers no deletion prompt; no new function adds an event trigger (the 13 new ones are 8 callables and 5
task queues), so no duplicate trigger is introduced (five existing document triggers deliberately share a document with a
second function, all already live); schedules equal the live Cloud Scheduler jobs (time zone UTC where source gives none);
the storage trigger resolves to the live bucket `scoutx-230b0.firebasestorage.app` (the earlier manifest text showed the
emulator bucket); the predeploy step `node scripts/sync-discovery-search.mjs --check` passes on the release tree; the two
transitive dependency differences of the 2026-10-08 batch (`body-parser` 1.20.8→1.20.9, `uuid` 9.0.1→11.1.1) come from the
lockfile, direct dependencies are unchanged.

Rules workflows affected (`firestore.rules`, `storage.rules`): (1) notification preferences: the live rules reject a save that
contains `quietHours`; the client sends that field only when a user enables quiet hours, so every other preference save
works live and only "enable quiet hours" fails until B1; (2) `mediaImportSources` is server-only in both directions (no client
path); (3) the `tracking` sub-collection and `tracking/` review images are owner-read, server-write and are used only by the
new analysis functions, which stay inert. Tests: `tests/rules` cover all three (263/263).

## 2. Manifest (80 functions; source SHA = the approved release commit)

Not deployed by this plan (15): the 6 current functions, the 8 refactor-only functions, and `setTrackingPeriods` (no caller in the app).

Group 1 — background writers first (33: triggers, task queues, schedules):

| Function | State | Trigger | Secrets | Why (first differing files) |
|---|---|---|---|---|
| `analyzeMatchFrames` | update | taskQueue | OPENROUTER_API_KEY | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
| `buildDataExport` | update | taskQueue | - | callableOptions.ts, dataRights/dataExport.ts |
| `cleanupAbandonedUploads` | update | schedule every 24 hours (UTC) | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
| `discoverTrackingTask` | NEW | taskQueue | - | not deployed |
| `extractMatchSegment` | update | taskQueue | - | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
| `extractTrackingSegmentTask` | NEW | taskQueue | - | not deployed |
| `onActivityCreatedPush` | update | event v1.created {"document":"activities/{activityId}"} | - | notificationPolicy.ts, pushDelivery.ts |
| `onContentReportCreated` | update | event v1.created {"document":"contentReports/{reportId}"} | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `onFootballSourceWrittenReproject` | update | event v1.written {"document":"players/{uid}/footballSources/ | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, publicPassport.ts |
| `onMatchAnalysisJobFinishedNotify` | update | event v1.updated {"document":"matchAnalysisJobs/{jobId}"} | - | notificationPolicy.ts |
| `onMediaWrittenReproject` | update | event v1.written {"document":"players/{uid}/media/{mediaId}" | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `onPassportSummaryWrittenNotifyOwner` | update | event v1.written {"document":"passportSummaries/{playerId}"} | - | notificationPolicy.ts |
| `onPassportSummaryWrittenNotifyWatchers` | update | event v1.written {"document":"passportSummaries/{playerId}"} | - | notificationPolicy.ts |
| `onPassportSummaryWrittenProjectDiscovery` | update | event v1.written {"document":"passportSummaries/{playerId}"} | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `onProfileWrittenProjectDiscovery` | update | event v1.written {"document":"profiles/{playerId}"} | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `onProfileWrittenProjectPassport` | update | event v1.written {"document":"profiles/{playerId}"} | - | callableOptions.ts, publicPassport.ts |
| `onQuarantineObjectFinalized` | update | event v1.finalized, bucket `scoutx-230b0.firebasestorage.app` (default) | - | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
| `onRecruitmentEntryWritten` | update | event v1.written {"document":"recruitmentWorkspaces/{scoutId | - | notificationPolicy.ts |
| `onReelExportQueued` | update | event v1.created {"document":"reelExports/{exportId}"} | - | callableOptions.ts, entitlements/plans.ts |
| `onTrialInvitationCreatedGuardian` | update | event v1.created {"document":"trialInvitations/{trialId}"} | GUARDIAN_LINK_SECRET | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `onTrialInvitationCreatedNotify` | update | event v1.created {"document":"trialInvitations/{trialId}"} | - | notificationPolicy.ts |
| `onTrialInvitationUpdatedGuardian` | update | event v1.updated {"document":"trialInvitations/{trialId}"} | GUARDIAN_LINK_SECRET | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `onTrialInvitationUpdatedNotify` | update | event v1.updated {"document":"trialInvitations/{trialId}"} | - | notificationPolicy.ts |
| `onTrustRecommendationCreatedNotify` | update | event v1.created {"document":"trustRecommendations/{recommen | - | notificationPolicy.ts |
| `onUserSafetyWrittenReproject` | update | event v1.written {"document":"userSafety/{uid}"} | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `processLinkImportTask` | NEW | taskQueue | - | not deployed |
| `refreshTrackingOcrTask` | NEW | taskQueue | - | not deployed |
| `releaseExpiredSuspensions` | update | schedule every 60 minutes (UTC) | - | callableOptions.ts, discoveryProjection.ts, notificationPolicy.ts, security/rateLimit.ts |
| `resolveTrackingTask` | NEW | taskQueue | - | not deployed |
| `retentionCleanup` | update | schedule every day 03:30 Europe/Zurich | APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `reviewMatchSegment` | update | taskQueue | OPENROUTER_API_KEY | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/cvContract.ts, analysis/cvWorker.ts |
| `sendDevelopmentReminders` | update | schedule every wednesday 17:00 Europe/Zurich | - | notificationPolicy.ts |
| `synthesizeMatchReport` | update | taskQueue | OPENROUTER_API_KEY | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/cvContract.ts, analysis/cvWorker.ts |

Group 2 — app-facing (47: callables and the RevenueCat webhook):

| Function | State | Trigger | Secrets | Why (first differing files) |
|---|---|---|---|---|
| `addExternalFootballSource` | update | callable | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, publicPassport.ts |
| `analyzeMatchFootage` | update | callable | OPENROUTER_API_KEY | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
| `answerTrackingQuestion` | NEW | callable | - | not deployed |
| `applyModerationAction` | update | callable | - | callableOptions.ts, discoveryProjection.ts, notificationPolicy.ts, security/rateLimit.ts |
| `askThisMatch` | update | callable | - | askThisMatch.ts, callableOptions.ts, security/rateLimit.ts |
| `cancelMatchAnalysis` | update | callable | - | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
| `cancelUploadSession` | update | callable | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
| `confirmAnalysisIdentity` | update | callable | - | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/identityCallable.ts |
| `coordinateAnalysisTarget` | NEW | callable | - | not deployed |
| `createUploadSession` | update | callable | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
| `declareUploadChecksum` | update | callable | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
| `deleteAuthenticatedAccount` | update | callable | APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `explainTrackingMoment` | NEW | callable | OPENROUTER_API_KEY | not deployed |
| `exportReel` | update | callable | - | callableOptions.ts, entitlements/plans.ts |
| `fulfillEvidenceRequest` | update | callable | - | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `generateAiInsight` | update | callable | OPENROUTER_API_KEY | ai/providerConfig.ts, aiCoach.ts, callableOptions.ts, legal/legalVersions.generated.ts |
| `getGuardianConsentRequest` | update | callable | GUARDIAN_LINK_SECRET | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `getMediaPlaybackUrl` | update | callable | - | callableOptions.ts, mediaAccess.ts, security/rateLimit.ts |
| `getUsageSummary` | update | callable | - | callableOptions.ts, entitlements/plans.ts |
| `inspectVideoSource` | NEW | callable | - | not deployed |
| `listModerationQueue` | update | callable | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, notificationPolicy.ts |
| `persistAppleAuthorizationCode` | update | callable | APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `recordConsent` | update | callable | - | callableOptions.ts, legal/legalVersions.generated.ts |
| `recordDiscoverableView` | update | callable | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `recordPortfolioView` | update | callable | - | callableOptions.ts, notificationPolicy.ts |
| `recordVideoProcessingConsent` | update | callable | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
| `refreshPublicPassport` | update | callable | - | callableOptions.ts, publicPassport.ts |
| `removeExternalFootballSource` | update | callable | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, publicPassport.ts |
| `requestDataExport` | update | callable | - | callableOptions.ts, dataRights/dataExport.ts |
| `requestEvidence` | update | callable | - | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `requestGuardianConsent` | update | callable | GUARDIAN_LINK_SECRET | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `resolveAppeal` | update | callable | - | callableOptions.ts, discoveryProjection.ts, notificationPolicy.ts, security/rateLimit.ts |
| `respondGuardianConsent` | update | callable | GUARDIAN_LINK_SECRET, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `revenueCatWebhook` | update | https | REVENUECAT_WEBHOOK_SECRET | entitlements/plans.ts |
| `revokeGuardianConsent` | update | callable | - | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `revokeVideoProcessingConsent` | update | callable | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
| `saveAnalysisTargetAnchor` | NEW | callable | - | not deployed |
| `saveReelToLibrary` | update | callable | - | callableOptions.ts, entitlements/plans.ts |
| `searchDiscoverablePlayers` | update | callable | - | callableOptions.ts, discoveryProjection.ts, security/rateLimit.ts |
| `setAgeBand` | update | callable | - | accountDeletion.ts, ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts |
| `startLinkImport` | NEW | callable | - | not deployed |
| `startPlayerAnalysis` | NEW | callable | - | not deployed |
| `submitAnalysisCorrection` | update | callable | - | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/corrections.ts, analysis/frameAnalysis.ts |
| `submitAppeal` | update | callable | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, notificationPolicy.ts |
| `submitPublicReport` | update | callable | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, publicPassport.ts |
| `undoTrackingAnswer` | NEW | callable | - | not deployed |
| `updateExternalFootballSource` | update | callable | - | callableOptions.ts, discoveryProjection.ts, discoverySearchIndex.ts, publicPassport.ts |

## 3. Order and exact commands (run by the owner after approval; never with `--force`)

Source for BE-1: a clean checkout of release `01f9459c2608bc939c96f5c7388b5e5ba98aac2d` (deployed 2026-11-13). Source for
BE-2b/BE-3b/BE-4: `fix/functions-node22` @ `0adacdf45f2d41f624de2f8263172771c33cf50b` (Node.js 20 was decommissioned on
2026-10-30 and the CLI refuses it; B-22), or the merged release commit after GIT-1, which contains it. `functions/`, `firestore.rules`, `storage.rules` and `firebase.json` are
byte-identical in both (`git diff 01f9459 <candidate> -- functions firestore.rules storage.rules firebase.json` is empty).
Never deploy from the redesign worktree, a dirty tree or a mixture of branches.

Preflight, from that checkout:
```
git status --short                       # must print nothing (ignored files such as functions/.env.scoutx-230b0 do not show)
git rev-parse HEAD                       # must equal the approved SHA
npm ci && npm ci --prefix functions && npm run build --prefix functions
npm run test:unit && npm run test:rules  # all pass; counts for the candidate are in REDESIGN_LEDGER section 16
firebase use scoutx-230b0 && firebase projects:list   # confirm the project, read-only
# The live functions get GUARDIAN_LINK_BASE_URL from functions/.env.scoutx-230b0, which is git-ignored and therefore
# absent from a clean checkout. Without it guardian consent links break. Copy it from the machine that deployed on
# 2026-10-24 (or recreate it) and check the key is present; do not commit it:
grep -c '^GUARDIAN_LINK_BASE_URL=' functions/.env.scoutx-230b0   # must print 1
# The deploy applies every key in functions/.env and functions/.env.scoutx-230b0 to every deployed function. Live today:
# GUARDIAN_LINK_BASE_URL is the only custom key on all 81 functions (read 2026-11-13). So the key list must be exactly that:
sed -E 's/=.*//' functions/.env.scoutx-230b0 | grep -v '^#' | grep -v '^$'   # must print only GUARDIAN_LINK_BASE_URL
test ! -e functions/.env || sed -E 's/=.*//' functions/.env                 # absent, or no other keys
# Stop if any of these appear: CV_WORKER_URL, CV_WORKER_APPROVED, TRACKING_V3_ENABLED, AI_FOOTAGE_PROCESSING_APPROVED,
# VIDEO_REASONING_ENABLED, ENFORCE_APP_CHECK, CALLABLE_ALLOWED_ORIGINS. (functions/.env.local is emulator-only and never deployed.)
gcloud functions list --project=scoutx-230b0 --format="value(name.basename())" | wc -l   # 81 before
# Keep the code that is live now: a redeploy overwrites each function's archive object.
mkdir -p ~/scoutx-live-backup-$(date +%F) && gcloud storage cp -r \
  gs://gcf-v2-sources-141939766260-europe-west6/ ~/scoutx-live-backup-$(date +%F)/ --project=scoutx-230b0
```

Step A (IDX-1, B-18 only) — creates exactly one index; needs no checkout (the fix commit `9986c4fd320332d1f694a8e943d6c2dc3b60de87`
exists only in the preparation workspace; the integration candidate contains it, so the release file matches live afterwards):
```
gcloud firestore indexes composite list --project=scoutx-230b0 --database='(default)' --format="value(name)" | wc -l   # 38
gcloud firestore indexes composite list --project=scoutx-230b0 --database='(default)' \
  --filter="collectionGroup=accountRestrictions" --format="value(name)"                                               # empty
gcloud firestore indexes composite create --project=scoutx-230b0 --database='(default)' \
  --collection-group=accountRestrictions --query-scope=collection \
  --field-config=field-path=state,order=ascending --field-config=field-path=until,order=ascending --async
```
This touches no other index and no field override (`playerId`, `scoutId` stay as live). It is equivalent to the entry
added in `firestore.indexes.json` at `9986c4f`. A later `firebase deploy --only firestore:indexes` must come from a tree
that contains that entry (the candidate does); from an older tree the CLI would offer to delete the index — answer no and
never pass `--force` (the CLI may prompt even with `--non-interactive`: firebase-tools issue 6539).
The query it serves is `accountRestrictions where state == 'suspended' and until <= now limit 100`
(`functions/src/moderation/actions.ts` line 355, identical in the deployed archive); equality then range needs exactly
`state ASC, until ASC`, which is what is added. **Wait for `READY`** (first smoke row) before judging the job; the next
hourly run is the test. Stop if the CLI proposes deleting anything, or if the index ends `NEEDS_REPAIR`/error.

Suspension-expiry job and backlog: the job reads at most 100 expired suspensions, re-enables the Auth user, clears the hold,
deletes the restriction document and re-projects discovery; every step is safe to repeat, so a retried or overlapping run
cannot double-apply. Backlog today: `accountRestrictions` has 0 documents, so the first successful run does nothing. Nobody
edits suspensions by hand; a larger backlog would drain at 100 per hour.

First-deploy behaviour (official docs and live state, 2026-11-13): the CLI **creates** a Cloud Tasks queue the first time a
task-queue function is deployed, with the retry and rate limits in source (Firebase "Enqueue functions with Cloud Tasks");
enqueuing needs `cloudtasks.tasks.create` and invoking needs invoker rights — the runtime service account
`141939766260-compute@developer.gserviceaccount.com` holds `roles/editor` and `roles/run.invoker` at project level, and the
five existing queues already work with it. No new schedule or event trigger is added (the 13 new functions are 8 callables and
5 task queues), so no new Cloud Scheduler job or Eventarc trigger is created. Every secret a deployed function references
already exists and already grants `secretAccessor` to that service account (7 of 7 checked). Required APIs are enabled.
Nothing in the backend needs Authentication to be initialised to deploy; there are no Auth-triggered or blocking functions.

Step B1 (BE-1) — rules, which only add fields and server-only paths:
```
firebase deploy --only firestore:rules,storage --project scoutx-230b0
```
Step B2 (BE-2) — group 1 (the 5 new task queues and 28 updated background functions). It must precede group 2: the new
callables `startPlayerAnalysis`, `startLinkImport` and the answer callables enqueue into these queues. Wait until every function shows ACTIVE:
```
firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group1.txt)"
```
Step B3 (BE-3) — group 2 (8 new and 39 updated app-facing functions):
```
firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group2.txt)"
```
The two files hold the exact comma-separated `functions:<name>` lists of section 2.

### 3.1 Functions not deployed (15; `holdReason` in the manifest)

* 6 unchanged (`mediaLifecycleSweep`, `onDiscoverableSearchIndexWritten`, `onMatchJobDeleted`, `onMatchJobMediaLifecycle`,
  `onVerificationWrittenSyncTrust`, `scheduleWeeklyFootballReports`): import closure identical to the deployed archive.
* 8 refactor-only (`confirmRole`, `generateHighlightReelPlan`, `listAdminReviewQueue`, `purgeLegacyGpsLocation`,
  `resolveVerificationRequest`, `setStaffRole`, `submitPrivacyRequest`, `updatePrivacyRequest`): only `callableOptions.ts`
  differs; the change makes `env` a parameter that defaults to `process.env`, so `cors` and `enforceAppCheck` resolve to the
  same values (diff checked 2026-11-13).
* 1 missing, **`setTrackingPeriods`** (europe-west6, gen 2, callable): owner-only; stores match period boundaries (kickoff,
  half-time, second half, full time) as tracking-v3 feedback and would enqueue a re-resolve only when the vision worker is on.
  No caller exists: no client wrapper, no UI control, no test, no backend call (searched `src`, `e2e`, `tests`, `functions`,
  `workers`). Not experimental-flagged on the client; on the server it is inert without `TRACKING_V3_ENABLED` and an approved
  worker, and it fails with `failed-precondition` without a tracking report (none can exist while the worker is off). If a
  client called it while absent it would get `functions/not-found`. Its absence breaks no advertised release feature: tracking
  reports are only produced by the vision worker, which stays off. **Finding (B-21):** the "compare halves" answer
  (`halvesUnknown`) tells the user to "mark the half-time break in the match periods", but no such control exists in the
  release or the redesign. It is unreachable while the worker is off; before the worker is enabled either ship a period
  control together with `setTrackingPeriods`, or reword that answer in all 7 languages.

## 4. Smoke tests, log queries and stop conditions (per action; record outputs, not impressions)

All reads below are read-only. Times: note UTC before each step and use it in the log queries.

**After IDX-1**
| Check | Expected | Stop if |
|---|---|---|
| `gcloud firestore indexes composite list --project=scoutx-230b0 --database='(default)' --filter="collectionGroup=accountRestrictions" --format="value(state)"` | `READY` (minutes; 0 documents). Do not judge the job before this | `NEEDS_REPAIR`, an error, or not READY after 30 min |
| index count | 39 READY | any other count |
| next hourly `releaseExpiredSuspensions` run: `gcloud logging read --project=scoutx-230b0 --freshness=2h 'resource.type="cloud_run_revision" AND resource.labels.service_name="releaseexpiredsuspensions" AND (httpRequest.status>=200 OR severity>=WARNING)' --format="value(timestamp,httpRequest.status,severity,textPayload)"` | a 200 request, no `FAILED_PRECONDITION` | a 500 after READY |

**After BE-1 (rules)**
| Check | Expected | Stop if |
|---|---|---|
| `firebase deploy` output | "released rules" for `cloud.firestore` and `firebase.storage`, project `scoutx-230b0` | compile error, other project |
| live ruleset differs from the snapshot and equals the source | `curl -sS -H "Authorization: Bearer $(gcloud auth print-access-token)" -H 'x-goog-user-project: scoutx-230b0' https://firebaserules.googleapis.com/v1/projects/scoutx-230b0/releases` shows new `rulesetName` and `updateTime` for `cloud.firestore` and the storage release | — |
| quiet-hours save | only after AUTH-1 and TEST-1, with a test account | — |

**After BE-2 (group 1) — gate for BE-3**
| Check | Expected | Stop if |
|---|---|---|
| `gcloud functions list --project=scoutx-230b0 --regions=europe-west6 --format="value(name.basename(),state,updateTime)"` | 33 group-1 names ACTIVE with today's update time; 86 functions in total (81 + 5) | any group-1 function not ACTIVE; any function missing |
| `gcloud tasks queues list --location=europe-west6 --project=scoutx-230b0` | 10 RUNNING: the existing 5 plus `discoverTrackingTask`, `extractTrackingSegmentTask`, `processLinkImportTask`, `refreshTrackingOcrTask`, `resolveTrackingTask` | a queue missing or PAUSED |
| scheduled jobs unchanged: `gcloud scheduler jobs list --location=europe-west6 --project=scoutx-230b0 --format="value(name.basename(),schedule,timeZone,state)"` | same 6 jobs, schedules and time zones as before | a changed or missing job |
| errors: `gcloud logging read --project=scoutx-230b0 --freshness=1h 'resource.type="cloud_run_revision" AND severity>=ERROR'` | nothing new from group-1 services | new ERROR lines |
| worker stays off: `gcloud run services describe resolvetrackingtask --region=europe-west6 --project=scoutx-230b0 --format="value(spec.template.spec.containers[0].env[].name)"` | only `GUARDIAN_LINK_BASE_URL` plus Firebase defaults | any CV/tracking/reasoning flag |

**After BE-3 (group 2)**
| Check | Expected | Stop if |
|---|---|---|
| function count | 94 (81 + 13), 80 with today's update time, the 15 held ones unchanged | any other count |
| callable App Check enforcement | `app-check-behaviour-2026-11-12.md` 4.1: response, the request's `callable-request-verification` log line and the serving revision, all three | the text alone; any proxy/HTML answer (no conclusion) |
| analysis stays off | as above for `startplayeranalysis`, `explaintrackingmoment`, `startlinkimport` | any CV/tracking/reasoning flag |
| errors | as above, 1 h | new ERROR lines |
| signed-in rows (onboarding, Discover, Plan, quiet hours) | only on a device build after AUTH-1, APC-1 and TEST-1 | — |

Stop/abort during BE-*: any CLI prompt to delete a function or index (answer no; never `--force`); a group-1 function not
ACTIVE (do not start group 2); new ERROR log lines from an updated function; a project other than `scoutx-230b0`.

## 5. Rollback and its limits

- Indexes: deleting the new index stops nothing else; the job fails again.
- Rules: `firebase deploy --only firestore:rules,storage` from the previous files (copies saved from the live rulesets
  `53848835-…` and `59463b10-…`), or roll back in the console's rules history.
- Functions: redeploy the previous code from the saved deployed archives; there is no git commit for it. New task queues
  and functions remain unless deleted explicitly. Documents written, tasks enqueued and notifications sent by new code are
  **not** undone by redeploying old code. With an empty production database the exposure today is small.

## 6. Cost

Cloud Build minutes for 80 function builds (free tier 120 build-minutes per day; beyond that billed per minute), Artifact
Registry storage for images, Cloud Tasks and Run on use only (minimum instances 0). No always-on cost is added.
