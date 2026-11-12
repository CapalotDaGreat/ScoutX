# Backend deployment plan — B-17 and B-18 (prepared 2026-11-12, NOT executed)

Project `scoutx-230b0` (europe-west6, Cloud Functions 2nd gen, default compute service account `141939766260-compute`).
Everything below was read without changing anything. Deploying needs separate approvals (A: index, B: backend).

## 1. Inventory (read 2026-11-12)

| Item | Live | Release source (`01f9459`; `functions/`, rules and indexes are identical at redesign `7c3b530`) |
|---|---|---|
| Functions | 81 (70 deployed 2026-10-08, 11 on 2026-10-24), all europe-west6 gen 2 | 95 exported |
| Missing live | 14: answerTrackingQuestion, coordinateAnalysisTarget, discoverTrackingTask, explainTrackingMoment, extractTrackingSegmentTask, inspectVideoSource, processLinkImportTask, refreshTrackingOcrTask, resolveTrackingTask, saveAnalysisTargetAnchor, setTrackingPeriods, startLinkImport, startPlayerAnalysis, undoTrackingAnswer | |
| Deployed but not in source | none (no deletions needed or implied) | |
| Outdated live (import closure differs from the deployed archive) | 75 of 81; 6 current: mediaLifecycleSweep, onDiscoverableSearchIndexWritten, onMatchJobDeleted, onMatchJobMediaLifecycle, onVerificationWrittenSyncTrust, scheduleWeeklyFootballReports | |
| Outdated only by the behaviour-neutral `callableOptions.ts` refactor | 8: confirmRole, generateHighlightReelPlan, listAdminReviewQueue, purgeLegacyGpsLocation, resolveVerificationRequest, setStaffRole, submitPrivacyRequest, updatePrivacyRequest | |
| Firestore rules | ruleset of 2026-10-24 | differs: release adds `quietHours` to notification preferences (**the release client's quiet-hours save is rejected live**), server-only `mediaImportSources`, `tracking` sub-collection |
| Storage rules | ruleset of 2026-10-08 (`scoutx-230b0.firebasestorage.app`) | differs: adds owner-read, server-write `tracking` review images |
| Composite indexes | 38, identical to the repository | B-18 index missing in both |
| Schedules | 6 jobs, identical expressions and time zones to source | no change |
| Memory / timeouts | equal to source (2Gi = 2048Mi) | no change |
| App Check in deployed code | `enforceAppCheck` on for every app-facing callable; off only for `submitPublicReport` and the guardian web callables; `ENFORCE_APP_CHECK` unset on all 81 | same logic |
| Parameter file | Live functions read `GUARDIAN_LINK_BASE_URL` from `functions/.env.scoutx-230b0` (git-ignored; present in the deployed archives, absent from the repository) | must exist locally before any deploy |
| Prerequisites | APIs enabled: Cloud Tasks, Scheduler, Run, Build, Artifact Registry, Eventarc, Pub/Sub, Secret Manager. Secrets present: ADMIN_USER_IDS, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_TEAM_ID, GUARDIAN_LINK_SECRET, OPENROUTER_API_KEY, REVENUECAT_WEBHOOK_SECRET (names only read) | the new functions need no new secret except OPENROUTER_API_KEY (exists) |
| Production data (counts only) | 0 profiles, 0 discoverable players, 0 account restrictions; search state ready, version 1 | no migration or backfill needed |
| Live defect also fixed by the deploy | deployed discovery projection writes `analysisSampleCount: 0` ("unknown shown as zero"); release writes `null` | 0 documents affected today |

How "outdated" was decided: the deployed source archive of each batch (`gcf-v2-sources-141939766260-europe-west6`, read-only
copy) was compared file by file with the release source along each function's import closure. The repository history starts
2026-10-25, so the deployed code has no commit; the archives are the only record of it and should be kept for rollback.

New analysis functions stay inert after deployment: without `CV_WORKER_URL`, `TRACKING_V3_ENABLED=true`, `CV_WORKER_APPROVED=true`
and a compiled approval record they answer "unavailable" and never call a worker; link import refuses with
"Video analysis is not available yet". Deploying them does **not** approve or enable the computer-vision worker.

## 2. Manifest (80 functions; source SHA = the approved release commit)

Not deployed by this plan (15): the 6 current functions, the 8 refactor-only functions, and `setTrackingPeriods` (no caller in the app).

Group 1 — background writers first (33: triggers, task queues, schedules):

| Function | State | Trigger | Secrets | Why (first differing files) |
|---|---|---|---|---|
| `analyzeMatchFrames` | update | taskQueue | OPENROUTER_API_KEY | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
| `buildDataExport` | update | taskQueue | - | callableOptions.ts, dataRights/dataExport.ts |
| `cleanupAbandonedUploads` | update | schedule every 24 hours [object Object] | - | ai/providerConfig.ts, analysis/videoConsent.ts, callableOptions.ts, entitlements/plans.ts |
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
| `onQuarantineObjectFinalized` | update | event v1.finalized {"bucket":"demo-scoutx.appspot.com"} | - | ai/providerConfig.ts, analysis/clipAnalysis.ts, analysis/frameAnalysis.ts, analysis/pipeline.ts |
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
| `releaseExpiredSuspensions` | update | schedule every 60 minutes [object Object] | - | callableOptions.ts, discoveryProjection.ts, notificationPolicy.ts, security/rateLimit.ts |
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

Preflight, from a clean checkout of the approved commit:
```
git status --short                       # must print nothing
git rev-parse HEAD                       # must equal the approved SHA
npm ci && npm ci --prefix functions && npm run build --prefix functions
npm run test:unit && npm run test:rules  # 765/765 and 263/263 at 459defc
firebase use scoutx-230b0 && firebase projects:list   # confirm the project, read-only
# The live functions get GUARDIAN_LINK_BASE_URL from functions/.env.scoutx-230b0, which is git-ignored and therefore
# absent from a clean checkout. Without it guardian consent links break. Copy it from the machine that deployed on
# 2026-10-24 (or recreate it) and check the key is present; do not commit it:
grep -c '^GUARDIAN_LINK_BASE_URL=' functions/.env.scoutx-230b0   # must print 1
# No CV_WORKER_URL / TRACKING_V3_ENABLED / CV_WORKER_APPROVED may be added: the worker stays off.
gcloud functions list --project=scoutx-230b0 --format="value(name.basename())" | wc -l   # 81 before
# Keep the code that is live now: a redeploy overwrites each function's archive object.
mkdir -p ~/scoutx-live-backup-$(date +%F) && gcloud storage cp -r \
  gs://gcf-v2-sources-141939766260-europe-west6/ ~/scoutx-live-backup-$(date +%F)/ --project=scoutx-230b0
```

Step A (approval A, B-18 only) — from `fix/account-restrictions-index` @ `9986c4f` (or the release commit once it contains it):
```
firebase deploy --only firestore:indexes --project scoutx-230b0
```
Non-interactive deploys add the missing index and do not delete live indexes that the file lacks (there are none).

Step B1 (approval B) — rules, which only add fields and server-only paths:
```
firebase deploy --only firestore:rules,storage --project scoutx-230b0
```
Step B2 — group 1, then wait until every function shows ACTIVE:
```
firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group1.txt)"
```
Step B3 — group 2:
```
firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group2.txt)"
```
The two files hold the exact comma-separated `functions:<name>` lists of section 2.

## 4. Smoke tests and monitoring (expected results)

| Check | Expected |
|---|---|
| `gcloud firestore indexes composite list --project=scoutx-230b0 --filter="collectionGroup=accountRestrictions"` | one index `state ASC, until ASC`, state `READY` (minutes with 0 documents) |
| Next hourly run of `releaseExpiredSuspensions` | HTTP 200 in `gcloud logging read 'resource.labels.service_name="releaseexpiredsuspensions"' --freshness=2h`; no `FAILED_PRECONDITION` |
| Function count | 94 (81 + 13), 80 with today's update time |
| `gcloud tasks queues list --location=europe-west6` | 6 new queues RUNNING: discoverTrackingTask, extractTrackingSegmentTask, processLinkImportTask, refreshTrackingOcrTask, resolveTrackingTask (+ existing 5) |
| Unsigned, tokenless POST `{"data":{}}` to `getUsageSummary` from a normal network | `{"error":{"message":"Unauthenticated","status":"UNAUTHENTICATED"}}` (App Check layer), not "Sign in required." |
| Signed-in test account on a physical iPhone build after App Attest registration | onboarding, Discover, Plan and usage, quiet hours save |
| Errors | `gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' --project=scoutx-230b0 --freshness=1h` shows nothing new |

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
