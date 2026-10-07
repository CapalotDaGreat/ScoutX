# Deletion Matrix

Account deletion is an idempotent state machine (`functions/src/dataRights/deletion.ts`,
`functions/src/accountDeletion.ts`) recorded in `deletionRequests/{uid}`:
`requested → access_revoked → jobs_cancelled → primary → media → derived → verified → completed`.
A failed step is retried from where it stopped. The app shows the progress. Unlike data export
(10-minute recent sign-in check in `dataExport.ts`), the deletion callable does not yet enforce a
recent sign-in on the server; SECURITY REVIEW REQUIRED.

Evidence: `tests/rules/accountDeletion.test.mjs` seeds every collection below, runs the deletion and
asserts nothing is left (`verifyAccountDeleted`).

## Deleted

| Scope | Items |
| --- | --- |
| UID-keyed documents | `users`, `players`, `pushTokens`, `discoverablePlayers`, `authProviderTokens`, `trustProfiles`, `portfolioAnalytics`, `recruitmentWorkspaces`, `pushThrottle`, `notificationPreferences`, `analysisQuotas`, `publicPassports`, `passportSummaries`, `playerWatchers`, `coachRosters`, `userSafety`, `guardianContacts`, `entitlements`, `usageLedger`, `accountRestrictions` |
| Subcollections | `usageLedger/{uid}/periods`, `players/{uid}/` (matches, evidenceItems, developmentGoals, trainingSessions, identitySnapshots, media, trialReflections), `recruitmentWorkspaces/{uid}/entries`, `moderationNotices/{uid}/items`, `consentRecords/{uid}/items`, `playerWatchers/{uid}/scouts` |
| Owned or addressed documents | `gpsSessions`, `matchAnalysisJobs`, `careerReplays`, `activities` (as recipient and actor), `trialNotifications`, `trialInvitations` (player and scout), `scoutingReports` (scout and player), `trustRecommendations`, `blockedUsers` (both sides), `verificationRequests`, `verificationStates`, `portfolioSlugs`, `clubProfiles`, `reels`, `mediaGrants` (owner and grantee), `reelExports`, `scoutBriefs`, `evidenceRequests`, `watchlistEvents`, `careerSnapshots`, `coachObservations`, `contentReports` (reporter, target, target owner), `youthConsents`, `mail`, `appeals`, `mediaUploads`, `mediaUploadSessions`, `uploadSessionLimits`, `revenueCatEvents`, `dataExports`, `privacyRequests` |
| Storage prefixes | `profiles/{uid}/`, `gpsSessions/{uid}/`, `quarantine/{uid}/`, `exports/{uid}/` |
| Auth | Firebase Auth user, after data steps finish |

## Kept in minimised form (`legalRetention`)

| Record | Why | Period |
| --- | --- | --- |
| Consent proof | Show that consent (incl. guardian consent) was given | 3 years, LEGAL REVIEW REQUIRED |
| Moderation decisions | Defend decisions and prevent ban evasion | 2 years, LEGAL REVIEW REQUIRED |
| Deletion receipt | Show the request was carried out | 3 years, LEGAL REVIEW REQUIRED |

These records use hashed identifiers.

## Not deleted by ScoutX

| Item | Reason |
| --- | --- |
| Apple purchase history | Held by Apple. RevenueCat customer records must be deleted through the RevenueCat API or dashboard; EXTERNAL CONFIGURATION REQUIRED (no automated call yet) |
| Sentry events | No user id is attached; they expire under the Sentry project retention |
| Backups | No custom backup exists. Firestore point-in-time recovery, if enabled, keeps data up to 7 days; see `docs/security/disaster-recovery.md` |
| Copies other users made outside ScoutX (screenshots, downloads of public media) | Outside ScoutX's control |
