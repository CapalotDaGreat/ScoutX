# Owner acceptance process (security residuals)

Findings marked `OWNER ACCEPTANCE REQUIRED` in `docs/security/security-findings.md` are not code
defects that this pass can close. They need an explicit owner decision before public release.

## How to accept a finding

1. Read the row in `security-findings.md` and the compensating control.
2. Decide: **Accept for launch**, **Mitigate further**, or **Block release**.
3. Record the decision below (date, owner name/email, decision, any follow-up date).
4. Change the finding status from `OWNER ACCEPTANCE REQUIRED` to `ACCEPTED` (with date) or leave
   open if blocked. The release gate treats open Critical/High as FAIL and pending owner rows as
   NOT VALIDATED.

Do not remove a row to silence the gate. Do not mark ACCEPTED without a named owner.

## Pending decisions

| ID | Topic | Decision | Owner | Date | Review by |
| --- | --- | --- | --- | --- | --- |
| SEC-10 | Guest deletion without re-auth | _pending_ | | | |
| SEC-11 | Deletion resume 24 h with older session | _pending_ | | | |
| SEC-12 | Self-declared age | _pending_ | | | |
| SEC-13 | No malware scan on uploads | _pending_ | | | |
| SEC-14 | Dependency advisories (Expo-breaking) | _pending_ | | | |
| SEC-17 | Guardian = controller of entered email | _pending_ | | | |
| SEC-18 | First under-13 band without re-auth | _pending_ | | | |

## External (not owner acceptance)

| ID | Topic | Owner action |
| --- | --- | --- |
| SEC-15 | App Check / App Attest | Register in Firebase console; keep `ENFORCE_APP_CHECK` enabled |
| SEC-16 | Backups / restore drill | Configure PITR/exports; run drill; remove `BACKUP_CONFIGURATION_REQUIRED` only after evidence in `backups.md` |
| SEC-06 EXTERNAL | AI footage provider review | Document review, then set `AI_FOOTAGE_PROCESSING_APPROVED=true` |
