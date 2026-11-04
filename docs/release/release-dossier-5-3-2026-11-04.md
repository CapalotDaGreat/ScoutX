# PitchProof 5.3 local release dossier

**Date:** 2026-11-04  
**Branch:** `release/pitchproof-5-3-candidate`  
**Base SHA:** `905eed7a38d017c008df816917f04624b5637293`  
**Pinned GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**productionApproval:** false  

**This dossier does not claim:** App Store acceptance, production deploy readiness, CUDA/GPU parity, or successful automatic player tracking on real footage.

---

## Verdict

**Locally executable release engineering for this candidate is complete.**  
**Public App Store / production release remains BLOCKED** by external, legal, device, and evaluation items listed below.

---

## What changed on this candidate

| Change | Scope |
|---|---|
| **Candidate C default ON** | `SCOUTX_OCR_CONSULTED_ONLY` defaults to `"1"`. Warm OCR caches save time only; they do not inject foreign evidence. Opt-out: `SCOUTX_OCR_CONSULTED_ONLY=0`. |
| Release contracts + evidence ledger | `docs/release/release-contracts-5-3.md`, `docs/release/evidence-ledger-2026-11-04.md` |
| Release-gate Test Store scan | Excludes `tests/` so intentional unit fixtures (`test_fixture`) are not treated as committed production keys |

**Not changed / not promoted:** A, B, E remain off. D remains unreviewed (appearance-only LIKELY still allowed). No deploy, ASC submit, live flag flip, or private footage upload.

---

## Local validation evidence

| Gate | Result |
|---|---|
| Worker pytest (`tests/`, ignore `test_52.py`) | **619 passed**, 16 skipped, 6 xfailed, 0 failed |
| App typecheck | PASS |
| App ESLint | PASS |
| App unit | **718 / 718** |
| Functions `tsc` | PASS |
| Rules + callables (`test:rules`) | **261 / 261** |
| Legal content `--check` | PASS |
| Release gate `--skip-tests` | **0 code blockers**; BLOCKED by 4 EXTERNAL + 3 LEGAL + 3 NOT VALIDATED |
| Full-match opt-in replays | SKIPPED (need `SCOUTX_FULL_MATCH_REPLAY`; no private footage this session) |
| Fail-closed AI footage | `isFootageProcessingApproved({})` → false |
| Fail-closed CV worker | `APPROVED_CV_WORKER = null` |
| GPU baseline ancestor | yes |

Worker note: local venv required `supervision>=0.22,<0.27` (0.31 removed `ByteTrack`). Constraint already in `requirements.txt`.

---

## Product honesty (supported claims)

1. Still-frame / limited analysis paths exist; continuous CV tracking is **unavailable** until separate worker approval.
2. AI footage analysis stays **off** until provider privacy review + `AI_FOOTAGE_PROCESSING_APPROVED=true`.
3. With C, OCR cache warm≡cold for evidence (consulted-only).
4. Appearance-only LIKELY can still occur (D not promoted).
5. Abstention is not successful tracking.
6. CPU validation does not close the CUDA accuracy gap.

---

## Remaining blockers (cannot close from this workspace alone)

1. Firebase App Check console registration (App Attest + DeviceCheck) — SEC-15  
2. Backups / restore drill — BACKUP_CONFIGURATION_REQUIRED  
3. Owner acceptance SEC-10–14, 17–18  
4. Counsel / LEGAL_REVIEW_REQUIRED markers (docs, website placeholders, retention)  
5. AI provider privacy review before any production AI footage flag  
6. CV evaluation `approval.json` + deploy before continuous-tracking claims  
7. Physical device / TestFlight / sandbox IAP matrix (~60 NOT VALIDATED)  
8. RevenueCat webhook Authorization header + live test event  
9. ASC metadata (screenshots, questionnaires, agreements) + signed archive acceptance  
10. Independent review of candidate D  
11. CUDA / GPU accuracy gap  

---

## Rollback

- Env: `SCOUTX_OCR_CONSULTED_ONLY=0`, or  
- Revert the C default commit on this branch.  

Do not rewrite the pinned GPU baseline.

---

## Next operator steps (outside this agent)

1. Human review of D (and label time) before any promotion.  
2. Complete EXTERNAL / LEGAL / device items if targeting public release.  
3. Only then consider production deploy / ASC submit under separate explicit authorization.

