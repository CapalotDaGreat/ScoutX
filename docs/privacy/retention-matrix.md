# Retention Matrix

Source of truth: `functions/src/dataRights/retention.ts` (`RETENTION`) and, for match footage,
`functions/src/analysis/mediaLifecycle.ts` (`LIFECYCLE`). This file mirrors them; change both together.
Jobs completed before the footage lifecycle shipped keep their media until a one-off backfill runs
(Firestore cannot query for the missing `mediaCleanupState` field). Cleanup runs in `retentionCleanup` (daily 03:30 Europe/Zurich) and
`cleanupAbandonedUploads` (every 24 hours).

| Data | Period | Trigger | Enforced by | Status |
| --- | --- | --- | --- | --- |
| Data export archives and download links | 7 days (`exportDays`) | Export built | `retentionCleanup`; signed URL also expires after 7 days | Product decision |
| Rejected / expired / cancelled upload records | 7 days (`failedUploadDays`) | Terminal upload state | `retentionCleanup` | Product decision |
| Rejected upload bytes | Immediately | ffprobe rejection | `functions/src/uploads/quarantine.ts` | Product decision |
| Never-finished upload sessions | 7 days (`UPLOAD_LIMITS.abandonAfterDays`) | Session created | `cleanupAbandonedUploads` | Product decision |
| Cancelled / failed / expired analysis jobs, with frames, video and the filed footage item | 30 days (`abandonedJobDays`) | Terminal job state | `retentionCleanup` | Product decision |
| Uploaded match video (source) when "Keep match video" is off | Deleted when the job completes or is cancelled | Terminal job state | `onMatchJobMediaLifecycle` (`functions/src/analysis/mediaLifecycle.ts`), retried by hourly `mediaLifecycleSweep` | Product decision (not lawyer-reviewed) |
| Uploaded match video after a failed analysis | 24 h (`LIFECYCLE.failedRetryHours`), or 7 days with "keep for retry" (`keepForRetryDays`) | Job failed | `mediaLifecycleSweep` | Product decision (not lawyer-reviewed) |
| Uncited frames and intermediates (frames, segment files) | Deleted when the job ends | Terminal job state | `applyMediaLifecycle` | Product decision (not lawyer-reviewed) |
| Cited evidence frames (max. cited by report, held-back coaching, up to 6 identity frames) | Until the user deletes the analysis or the account | User action | `onMatchJobDeleted`, `deleteAuthenticatedAccount` | Product decision (not lawyer-reviewed) |
| Optional evidence clips (opt-in, max. 6 × ~8 s, no audio) | Until the user deletes the analysis or the account | User action | `onMatchJobDeleted`, `deleteAuthenticatedAccount` | Product decision (not lawyer-reviewed) |
| Analysis uploads never finished | Marked expired after 7 days (`abandonedUploadDays`), media deleted | Job created | `mediaLifecycleSweep` | Product decision (not lawyer-reviewed) |
| Video processing consent records (`videoProcessingConsents`) | Until the account is deleted | Consent given | `deleteAuthenticatedAccount` (`OWNED_QUERIES`) | Product decision (not lawyer-reviewed) |
| RevenueCat webhook receipts | 90 days (`webhookReceiptDays`) | Receipt stored | `retentionCleanup` | Product decision |
| Closed privacy requests | 3 years (`privacyRequestDays`) | Request closed | `retentionCleanup` | LEGAL REVIEW REQUIRED; no independently verified approval |
| Consent proof after deletion | 3 years (`consentProofDays`) | Account deleted | `legalRetention` record `deleteAfter` | LEGAL REVIEW REQUIRED; no independently verified approval |
| Moderation decisions about a deleted account | 2 years (`moderationDecisionDays`) | Account deleted | `legalRetention` record `deleteAfter` | LEGAL REVIEW REQUIRED; no independently verified approval |
| Deletion receipt | 3 years (`deletionReceiptDays`) | Deletion completed | `legalRetention` record `deleteAfter` | LEGAL REVIEW REQUIRED; no independently verified approval |
| Guardian approval | 365 days validity, then re-approval | Approval | `youthConsent.ts` `CONSENT_VALIDITY_MS` | Product decision |
| Guardian approval link | 7 days | Link sent | `GUARDIAN_LINK_TTL_MS` | Product decision |
| Under-13 account without parental consent | 14 days (`CHILD_CONSENT_WAIT_DAYS`) | Under-13 band chosen, or player withdraws request | daily `retentionCleanup` via `userSafety.childDeleteAfter` | Product decision (not lawyer-reviewed) |
| Under-13 account after consent expiry | 30 days (`CHILD_EXPIRED_GRACE_DAYS`) | Consent expiry | daily `retentionCleanup` | Product decision (not lawyer-reviewed) |
| Under-13 account after parent declines or withdraws | Immediate | Parent decision | `respondGuardianConsent` + retry in `retentionCleanup` | Product decision (not lawyer-reviewed) |
| External football source links (incl. sources removed by moderation, which stay visible only to the owner) | Until the player removes the link or deletes the account; Passport and scout copies are dropped at once when a link is made private, reported, hidden, removed or its provider is disabled | User action, moderation, provider change | `removeExternalFootballSource`, projection sync, `deleteAuthenticatedAccount` | Product decision |
| Everything else (profile, football data, media, analyses, scouting data) | Until the user deletes it or the account | User action | `deleteAuthenticatedAccount` | Product decision |
| Sentry events | Sentry project setting | Event received | Sentry | EXTERNAL CONFIGURATION REQUIRED |

Privacy request reply deadline: 30 days (`PRIVACY_REQUEST_DEADLINE_DAYS`).

`legalRetention` records hold hashed identifiers and only the fields needed as proof. They are not
joined back to a live account.

Experimental `identityEvidence`, `identityCoordination` and `identityEvidenceStaging` subcollections inherit
their parent match-analysis job's retention and recursive deletion. They are not
an independent training dataset. Withdrawal of video consent deletes them even
for completed jobs; current summaries/evidence are invalidated on anchor edits.
The target-only summary is included in owner data exports. Internal proof chunks
are not exported as media or exposed through client Firestore access.

Staging leases expire logically after 20 minutes; this is not a Firestore TTL
deletion promise. An authorized retry removes abandoned chunks before staging.
Failed staging attempts clean up their own unpublished chunks. Anchor edits,
identity rejection and video-consent withdrawal also clear staging metadata.
