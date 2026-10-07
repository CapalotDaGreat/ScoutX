# Disaster Recovery

No recovery point objective (RPO) or recovery time objective (RTO) has been agreed. This document
does not invent numbers; they are a business decision (EXTERNAL CONFIGURATION REQUIRED).

## What exists today

| Component | Recovery mechanism | Configured in this repo? |
| --- | --- | --- |
| Source code, rules, indexes, functions | Git repository; redeploy with `firebase deploy` | Yes |
| Legal documents | Versioned in `legal/documents/`, bundled in the app | Yes |
| Firestore data | Firestore point-in-time recovery and scheduled backups are Google Cloud features | **No**: must be enabled in the project. NOT VALIDATED |
| Cloud Storage media | Object versioning / soft delete are bucket settings | **No**: not configured. NOT VALIDATED |
| Firebase Auth users | No export is scheduled | **No** |
| Secrets | Secret Manager versions | Managed outside the repo |
| RevenueCat entitlements | Can be rebuilt from RevenueCat (source of truth for purchases) | Yes, webhook is idempotent |

## Interaction with deletion

Backups conflict with deletion promises. If backups are enabled, the privacy policy and
`docs/privacy/retention-matrix.md` must state the backup retention, and restored backups must
re-apply completed deletions (`deletionRequests` with status `completed`, and `legalRetention`
deletion receipts) before the data is used. LEGAL REVIEW REQUIRED.

## Restore procedure (once backups are enabled)

1. Declare the incident (see `incident-response.md`).
2. Stop writes if data integrity is in question (deploy deny-all rules temporarily; this blocks
   users, it does not weaken security).
3. Restore Firestore to a new database from PITR or a backup and verify it.
4. Re-apply deletions completed after the restore point.
5. Point the app to the restored data and redeploy normal rules.
6. Write a post-incident note.

## Not validated

No restore drill has been run.
