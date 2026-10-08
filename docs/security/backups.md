# Backups

**Status: BACKUP_CONFIGURATION_REQUIRED.** Nothing in this repository enables backups, and no
backup has been verified. The release gate reports EXTERNAL CONFIGURATION REQUIRED until this
marker is removed by the person who configured and tested the backups.

Whether the options below are sufficient (recovery point, recovery time, retention) is a business
and legal decision. This document does not make it.

## What must be configured outside the repository

| Data | Option (Google Cloud) | Decision needed | State |
| --- | --- | --- | --- |
| Firestore (`(default)` database) | Point-in-time recovery (7-day window) and/or scheduled backups (`gcloud firestore backups schedules create`) | retention length, region | BACKUP_CONFIGURATION_REQUIRED |
| Cloud Storage (media, exports) | Soft delete retention and/or object versioning on the bucket | retention length; quarantine and exports may be excluded | BACKUP_CONFIGURATION_REQUIRED |
| Firebase Auth users | Periodic `firebase auth:export` to a restricted bucket | whether to keep at all | BACKUP_CONFIGURATION_REQUIRED |
| Secrets | Secret Manager keeps versions | none | Managed outside the repo |
| Code, rules, indexes, legal texts | Git | none | Configured |
| Purchases | RevenueCat is the source of truth; entitlements rebuild through the webhook | none | Configured |

## Deletion and backups

A backup can contain data of a user who later deleted their account. Before backups are enabled:

1. The privacy policy and `docs/privacy/retention-matrix.md` must state how long backups keep
   deleted data (LEGAL REVIEW REQUIRED).
2. After any restore, completed deletions must be re-applied before the data is used. Deletion
   receipts in `legalRetention` (kind `deletion_receipt`) store `subjectHash(uid)`, not the uid,
   so for every uid in the restored `users` collection compute `subjectHash(uid)` and, if a receipt
   with that hash exists, run `deleteAllUserData(uid)` again. No script for this exists yet
   (CODE WORK REQUIRED before backups are relied on).
3. Backup buckets must be restricted to the operations account and excluded from analytics.

## Verification (NOT VALIDATED)

- [ ] Restore Firestore PITR into a new database and compare document counts.
- [ ] Restore one Storage object from soft delete.
- [ ] Re-apply deletions after restore and confirm `verifyUserDataDeleted` returns nothing.
- [ ] Record date, operator and result here, then remove the BACKUP_CONFIGURATION_REQUIRED marker.

See `disaster-recovery.md` for the incident procedure.
