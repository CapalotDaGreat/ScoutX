# Retention Matrix

Source of truth: `functions/src/dataRights/retention.ts` (`RETENTION`). This file mirrors it; change
both together. Cleanup runs in `retentionCleanup` (daily 03:30 Europe/Zurich) and
`cleanupAbandonedUploads` (every 24 hours).

| Data | Period | Trigger | Enforced by | Status |
| --- | --- | --- | --- | --- |
| Data export archives and download links | 7 days (`exportDays`) | Export built | `retentionCleanup`; signed URL also expires after 7 days | Product decision |
| Rejected / expired / cancelled upload records | 7 days (`failedUploadDays`) | Terminal upload state | `retentionCleanup` | Product decision |
| Rejected upload bytes | Immediately | ffprobe rejection | `functions/src/uploads/quarantine.ts` | Product decision |
| Never-finished upload sessions | 7 days (`UPLOAD_LIMITS.abandonAfterDays`) | Session created | `cleanupAbandonedUploads` | Product decision |
| Cancelled / failed / expired analysis jobs, with frames, video and the filed footage item | 30 days (`abandonedJobDays`) | Terminal job state | `retentionCleanup` | Product decision |
| RevenueCat webhook receipts | 90 days (`webhookReceiptDays`) | Receipt stored | `retentionCleanup` | Product decision |
| Closed privacy requests | 3 years (`privacyRequestDays`) | Request closed | `retentionCleanup` | Approved (legal review, 2026-10-08) |
| Consent proof after deletion | 3 years (`consentProofDays`) | Account deleted | `legalRetention` record `expiresAt` | Approved (legal review, 2026-10-08) |
| Moderation decisions about a deleted account | 2 years (`moderationDecisionDays`) | Account deleted | `legalRetention` record `expiresAt` | Approved (legal review, 2026-10-08) |
| Deletion receipt | 3 years (`deletionReceiptDays`) | Deletion completed | `legalRetention` record `expiresAt` | Approved (legal review, 2026-10-08) |
| Guardian approval | 365 days validity, then re-approval | Approval | `youthConsent.ts` `CONSENT_VALIDITY_MS` | Product decision |
| Guardian approval link | 7 days | Link sent | `GUARDIAN_LINK_TTL_MS` | Product decision |
| External football source links (incl. sources removed by moderation, which stay visible only to the owner) | Until the player removes the link or deletes the account; Passport and scout copies are dropped at once when a link is made private, reported, hidden, removed or its provider is disabled | User action, moderation, provider change | `removeExternalFootballSource`, projection sync, `deleteAuthenticatedAccount` | Product decision |
| Everything else (profile, football data, media, analyses, scouting data) | Until the user deletes it or the account | User action | `deleteAuthenticatedAccount` | Product decision |
| Sentry events | Sentry project setting | Event received | Sentry | EXTERNAL CONFIGURATION REQUIRED |

Privacy request reply deadline: 30 days (`PRIVACY_REQUEST_DEADLINE_DAYS`).

`legalRetention` records hold hashed identifiers and only the fields needed as proof. They are not
joined back to a live account.
