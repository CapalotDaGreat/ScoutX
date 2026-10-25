---
id: data-retention-policy
title: Data Retention Policy
version: 1.3.0
effectiveDate: LEGAL_REVIEW_REQUIRED
status: draft
canonicalLanguage: en
requiresAcceptance: false
summary:
- Most data stays while your account exists and is deleted when you delete your account.
- Accounts of children under 13 without a parent's permission are deleted automatically.
- Temporary files (failed uploads, data exports, extracted frames) are deleted automatically.
- Proof of consent and moderation decisions may be kept in minimised form where the law requires it.
---

## Account data

Profile, match logs, goals, media, analysis results, movement summaries and scouting data are kept while your account exists. When you delete your account, they are deleted from our database and storage.

Deletion is performed by server jobs, with progress and retries if a step fails. Do not interpret a submitted request as proof that every deletion step completed. Scheduled cleanup periods below are targets from creation or the stated event; physical cleanup can run at the next scheduled sweep. We restrict retained records to the purpose that justifies keeping them.

## Temporary data

- Uploads that are abandoned or fail validation: deleted within 7 days.
- Data export archives: download link valid for 7 days, then the archive is deleted.
- Match videos uploaded for analysis: deleted when the analysis completes or is cancelled, unless you chose "Keep match video". After a failed analysis: deleted after 24 hours, or after 7 days if you chose to keep it for a retry.
- Frames extracted for analysis: frames the report does not cite are deleted when the analysis ends. Cited evidence frames stay with the analysis until you delete it.
- Optional evidence clips: only made when you ask for them, and kept with the analysis until you delete it.
- Analysis uploads that never finish: marked expired after 7 days and their files deleted.
- Guardian approval and confirmation links: expire after 7 days. Withdrawal links stay valid for about 13 months.
- Failed, cancelled or expired analysis-job records: cleaned up after 30 days; source-video and temporary-frame rules above can delete the media earlier.
- RevenueCat webhook receipts used to prevent duplicate processing: 90 days unless the account-deletion job removes them sooner.

## Accounts of children under 13

- No parent's permission within 14 days of choosing the under-13 age band: the account and its data are deleted.
- The parent declines or withdraws permission: the account and its data are deleted straight away.
- Permission expires (after 12 months) and is not renewed within 30 days: the account and its data are deleted.
- The child withdraws the request themselves: the account is deleted after 14 days unless a parent gives permission again.

## Records kept after deletion

Where the law requires it, we keep a minimised record of consent decisions (including guardian consent) and moderation decisions. These records use hashed identifiers and contain no profile content or media.

The configured schedules are three years for consent proof and deletion receipts, two years for moderation decisions, and three years for closed privacy-request records. These are implementation settings requiring owner/legal confirmation of their necessity and lawful basis, not a claim that every jurisdiction mandates those periods. Hashing reduces identification but does not automatically make a record anonymous. Any longer legal hold must be necessary, limited and documented.

## Records held by other services

The in-app deletion job does not automatically delete RevenueCat's customer record; a separate provider-side action is required. Apple controls its purchase, payment and account records. Diagnostic and email providers can hold their own service records under their configured schedules. Contact {{privacyEmail}} so we can assess a request and arrange processor-side deletion where applicable. We must confirm provider retention settings and procedures before launch; no unverified fixed deletion deadline is promised for them.

Public content can have been copied outside PitchProof. We remove the copies we control, not another person's screenshots, downloads or the original content of an external football website you linked to.

## Crash diagnostics

If crash reporting is enabled, default personal-data collection is disabled and redaction controls are applied. Reports can still contain technical identifiers or incidental information. They are kept according to the provider's configured retention settings, which require confirmation before launch.

## Backups

This repository does not configure a custom backup or restore schedule. If provider recovery copies or backups are enabled, they must have a documented expiry, access restriction and restore process that reapplies deletion requests. We do not promise a backup-expiry period that has not been verified. Contact {{privacyEmail}} for the current recovery-copy arrangements.
