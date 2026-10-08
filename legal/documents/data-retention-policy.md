---
id: data-retention-policy
title: Data Retention Policy
version: 1.0.0
effectiveDate: 2026-10-08
status: final
canonicalLanguage: en
requiresAcceptance: false
summary:
- Most data stays while your account exists and is deleted when you delete your account.
- Temporary files (failed uploads, data exports, extracted frames) are deleted automatically.
- Proof of consent and moderation decisions may be kept in minimised form where the law requires it.
---

## Account data

Profile, match logs, goals, media, analysis results, movement summaries and scouting data are kept while your account exists. When you delete your account, they are deleted from our database and storage.

## Temporary data

- Uploads that are abandoned or fail validation: deleted within 7 days.
- Data export archives: download link valid for 7 days, then the archive is deleted.
- Frames extracted for analysis: deleted after the analysis completes or fails, within the period set in our retention configuration.
- Guardian approval links: expire after 7 days. Withdrawal links stay valid for about 13 months.
- Cancelled or expired analysis jobs: cleaned up automatically.

## Records kept after deletion

Where the law requires it, we keep a minimised record of consent decisions (including guardian consent) and moderation decisions. These records use hashed identifiers and contain no profile content or media.

## Crash diagnostics

Crash reports are scrubbed of personal data before sending and kept according to our crash reporting provider's retention settings.

## Backups

Our cloud provider may keep encrypted backups for a limited time. Deleted data disappears from backups as they expire.
