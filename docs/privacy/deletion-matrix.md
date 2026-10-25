# Deletion Matrix

Account deletion is an idempotent state machine (`functions/src/dataRights/deletion.ts`,
`functions/src/accountDeletion.ts`) recorded in `deletionRequests/{uid}`:
`requested → access_revoked → jobs_cancelled → primary → media → derived → verified → completed`.
A failed step is retried from where it stopped. The app shows the progress. The deletion callable
enforces account ownership and recent sign-in through `assertDeletionAuthorized` in `appleAuth.ts`;
moving an established account into the under-13 band also requires that check in `youthConsent.ts`. See
`tests/rules/deletionAuth.test.mjs`. This is a code/test observation, not a production-device validation.

Evidence: `tests/rules/accountDeletion.test.mjs` seeds every collection below, runs the deletion and
asserts nothing is left (`verifyUserDataDeleted`). The E2E flow deletes a waiting 13–17 account and
checks that its guardian mail, consent and contact records are gone.

The app always deletes through the server. If the server cannot be reached it shows an error and
the user retries; it never deletes the sign-in locally while server-only records remain.

## Deleted

| Scope | Items |
| --- | --- |
| UID-keyed documents | `users`, `players`, `pushTokens`, `discoverablePlayers`, `scoutFootballSources`, `authProviderTokens`, `trustProfiles`, `portfolioAnalytics`, `recruitmentWorkspaces`, `pushThrottle`, `notificationPreferences`, `analysisQuotas`, `publicPassports`, `passportSummaries`, `playerWatchers`, `coachRosters`, `userSafety`, `guardianContacts`, `entitlements`, `usageLedger`, `accountRestrictions` |
| Subcollections | `usageLedger/{uid}/periods`, `players/{uid}/` (matches, evidenceItems, developmentGoals, trainingSessions, identitySnapshots, media, trialReflections, footballSources), `recruitmentWorkspaces/{uid}/entries`, `moderationNotices/{uid}/items`, `consentRecords/{uid}/items`, `playerWatchers/{uid}/scouts` |
| Owned or addressed documents | `gpsSessions`, `matchAnalysisJobs`, `careerReplays`, `activities` (as recipient and actor), `trialNotifications`, `trialInvitations` (player and scout), `scoutingReports` (scout and player), `trustRecommendations`, `blockedUsers` (both sides), `verificationRequests`, `verificationStates`, `portfolioSlugs`, `clubProfiles`, `reels`, `mediaGrants` (owner and grantee), `reelExports`, `scoutBriefs`, `evidenceRequests`, `watchlistEvents`, `careerSnapshots`, `coachObservations`, `contentReports` (reporter, target, target owner), `youthConsents`, `mail`, `appeals`, `mediaUploads`, `mediaUploadSessions`, `uploadSessionLimits`, `revenueCatEvents`, `dataExports`, `privacyRequests` |
| Storage prefixes | `profiles/{uid}/`, `gpsSessions/{uid}/`, `quarantine/{uid}/`, `exports/{uid}/` |
| Auth | Firebase Auth user, after data steps finish |

## Kept in minimised form (`legalRetention`)

| Record | Why | Period |
| --- | --- | --- |
| Consent proof | Show that consent (incl. guardian consent) was given | 3 years, LEGAL REVIEW REQUIRED |
| Moderation decisions | Defend decisions and prevent ban evasion | 2 years, LEGAL REVIEW REQUIRED |
| Deletion receipt | Show the request was carried out | 3 years, LEGAL REVIEW REQUIRED |

These records use hashed identifiers. Open moderation cases about the account lose the owner id
and the reported external football link (`targetContext`).

## Not deleted by PitchProof

| Item | Reason |
| --- | --- |
| Apple purchase history | Held by Apple. RevenueCat customer records must be deleted through the RevenueCat API or dashboard; EXTERNAL CONFIGURATION REQUIRED (no automated call yet) |
| Sentry events | No user id is attached; they expire under the Sentry project retention |
| Backups | No custom backup exists. Firestore point-in-time recovery, if enabled, keeps data up to 7 days; see `docs/security/disaster-recovery.md` |
| Copies other users made outside PitchProof (screenshots, downloads of public media) | Outside PitchProof's control |
| Pages on external football websites the player linked to | PitchProof only stored the link; the page belongs to that website |

Experimental target identity metadata under a match job (`identityEvidence`,
`identityCoordination` and `identityEvidenceStaging`) is server-only and inherits
recursive job/account deletion. Video-consent withdrawal removes all three
collections, including completed jobs and unpublished staging chunks.
Anchor edits invalidate the summary and delete the current evidence/chunk pointers.
These records contain target-only metadata and hashes, not footage or non-target
candidate identities. Owner data exports include the target summary, not internal
proof chunks.
