# Controlled evaluation status

**Date:** 2026-10-17  
**Commit baseline:** `0856529` (plus any uncommitted closure-pass edits in the working tree)  
**Verdict:** **READY FOR CONTROLLED EVALUATION**  
**Public release:** **BLOCKED**

## Why controlled evaluation can proceed

- Internal release gate (`--allow-external`) has no code FAIL blockers when checks are current.
- Flagship CV tracking remains fail-closed and labelled unavailable in UI/copy.
- AI footage processing fails closed unless `AI_FOOTAGE_PROCESSING_APPROVED=true` (server-only).
- Entitlement limits are server-authoritative (`plans.ts` → `consumeQuota`); matrix is gate-checked against compiled plans.
- Executable device + sandbox purchase checklist: `controlled-evaluation-checklist.md`.

## Why public release remains blocked

| Blocker | Evidence |
| --- | --- |
| App Check / App Attest not registered | SEC-15; gate EXTERNAL |
| Backups / restore drill not done | `backups.md` still `BACKUP_CONFIGURATION_REQUIRED`; no restore evidence recorded |
| AI footage provider approval unset (if footage AI is offered in TestFlight with real provider) | Gate EXTERNAL until env `true` after review |
| Owner acceptance of SEC-10–14, 17–18 | `owner-acceptance.md` rows still `_pending_` |
| Counsel review not independently verified | Gate NOT_VALIDATED (markers alone ≠ counsel approval) |
| Real-device matrix incomplete | ~60 NOT VALIDATED rows in `validation-matrix.md` |
| Real-footage CV evaluation absent | `approval.json` absent; worker not deployed |
| Store still "Coming soon" | Marketing correct until App Store launch |

## Evaluator instruction

1. Build/install TestFlight from current `main`.
2. Follow `controlled-evaluation-checklist.md`; log results in `validation-matrix.md`.
3. Do **not** set `CV_WORKER_APPROVED` or deploy a worker for this evaluation.
4. Only set `AI_FOOTAGE_PROCESSING_APPROVED=true` after a documented provider privacy review.
