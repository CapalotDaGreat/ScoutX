# PitchProof 5.3 local release dossier

**Date:** 2026-11-04  
**Branch:** `release/pitchproof-5-3-candidate`  
**Base SHA:** `905eed7a38d017c008df816917f04624b5637293`  
**C-default commit:** `6ebdd5cd34874625e07914df425960ac1b71df0f`  
**Pinned GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**productionApproval:** false  

**This dossier does not claim:** App Store acceptance, production deploy readiness, CUDA/GPU parity, or successful automatic player tracking on real footage.

---

## Readiness decision

**Not ready** for App Store submission.

**Ready for submission preparation**, subject to specifically named external checks in `docs/release/operator-actions-2026-11-04.md` and decisions in `docs/release/owner-acceptance.md` (SEC-* + REL-D-OFF + REL-CPU).

Authoritative blocker table: `docs/release/blocker-register-2026-11-04.md`.

---

## What changed on this candidate (engineering)

| Change | Scope |
|---|---|
| **Candidate C default ON** | OCR consulted-only; opt-out `SCOUTX_OCR_CONSULTED_ONLY=0` |
| Release contracts / ledger / dossier | under `docs/release/` |
| Release-gate Test Store scan | excludes `tests/` fixtures |
| Blocker prep pack | register, operator actions, counsel packet, D brief, device protocol, CPU-only proposal |
| Post-restore deletion helper | `scripts/reapply-deletions-after-restore.mjs` (dry-run default) |

**Not promoted:** A, B, E off; D off (appearance-only LIKELY still possible). No deploy, ASC submit, live flag flip, private footage upload, or billable enablement.

---

## Local validation evidence

| Gate | Result |
|---|---|
| Worker pytest | **619 passed**, 16 skipped, 6 xfailed |
| App typecheck / lint / unit | PASS / PASS / **718** |
| Functions `tsc` | PASS |
| Rules + callables | **261** |
| Legal `--check` | PASS |
| Release gate `--skip-tests` | **0 code blockers**; still BLOCKED externally |
| AI footage / CV worker | fail-closed |
| GPU baseline ancestor | yes |
| Firebase/EAS live verify | **not available** this host (CLI login/TLS) |

---

## Product honesty

1. Continuous CV tracking unavailable (`APPROVED_CV_WORKER=null`).
2. AI footage off until provider review + env flag.
3. C: warm OCR cache does not inject foreign evidence.
4. D off: appearance-only LIKELY residual risk — owner must Accept (REL-D-OFF) or wait for independent review.
5. CUDA gap deferred if REL-CPU (no-CV-worker) accepted; CPU tests ≠ GPU proof.
6. Abstention ≠ successful tracking.

---

## Minimal owner action list

1. `firebase login` + `eas login` (TLS/CA if needed); return env **names** only.  
2. Register App Check App Attest (+ DeviceCheck) for `com.scoutx.app` — **before** TestFlight review reliance.  
3. **Approve** PITR/backups if desired (billable); then isolated restore + dry-run script.  
4. Fill SEC-10–14, 17–18 and REL-D-OFF / REL-CPU in `owner-acceptance.md`.  
5. Send `counsel-packet-2026-11-04.md` to counsel (no footage).  
6. Assign independent D reviewer per `d-review-operator-brief-2026-11-04.md` (local packet only).  
7. **Approve** EAS iOS production build + TestFlight; run `real-device-protocol-5-3.md`.  
8. RevenueCat webhook Authorization + test event → 200.  
9. ASC App Review Information + Privacy Report after signed archive.  
10. Only then request deploy/submit authorization separately.

---

## Rollback (C)

- Env `SCOUTX_OCR_CONSULTED_ONLY=0`, or revert C default commit.  
- Do not rewrite pinned GPU baseline.
