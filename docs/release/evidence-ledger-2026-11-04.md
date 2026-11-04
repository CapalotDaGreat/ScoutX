# PitchProof release evidence ledger (2026-11-04)

**Workspace:** `C:/ZLI/M335/ScoutX-gpu-benchmark`  
**Branch:** `release/pitchproof-5-3-candidate`  
**HEAD (full):** `18dad67f6e40aab3dfa6e03d8d287626095d0999` at final audit start; final report commit follows  
**Prior:** external checklist `d9411dc`; pricing `86b59ba`; App Check docs/tests `4cebc63` / `065afcd`  
**Pinned GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor of HEAD)  
**Remote:** `git@github.com-CapalotDaGreat/ScoutX.git` — **no upstream** for this branch (not pushed)  
**productionApproval:** false  
**No deploy / ASC submit / billable cloud resources / private footage upload in this session.**

---

## Candidate status (this release branch)

| Id | Flag | Default on this branch | Status |
|---|---|---|---|
| A | `SCOUTX_EXCHANGE_SPLIT` | off (`"0"`) | experimental, off |
| B | `SCOUTX_RESUME_SPLIT` | off | needs revision, off |
| C | `SCOUTX_OCR_CONSULTED_ONLY` | **ON** (`"1"`); opt-out `=0` | applied (`6ebdd5c`); re-verified present |
| D | `SCOUTX_APPEARANCE_ONLY_LIKELY` | appearance LIKELY still allowed (`"1"`) | **not promoted**; independent review pending |
| E | `SCOUTX_OCR_CACHE_PROVENANCE` | off | needs revision, off |

Doc fixes re-verified: checklist `gemini-2.5-flash`; entitlement `PitchProven_*` wording (`0ebfbd8`).

---

## Blocker register

Authoritative table: **`docs/release/blocker-register-2026-11-04.md`**.  
Operator steps: **`docs/release/operator-actions-2026-11-04.md`**.

---

## Local validation (earlier this session — still the latest executed suite)

| Gate | Result |
|---|---|
| Worker pytest (`--ignore=tests/test_52.py`) | 619 passed, 16 skipped, 6 xfailed |
| App typecheck / lint / unit | PASS / PASS / 718 |
| Functions build | PASS |
| Rules + callables | 261 pass |
| Release gate `--skip-tests` | 0 code blockers; EXTERNAL×4 + LEGAL×3 + NOT VALIDATED×3 |
| Fail-closed AI / CV | empty env false; `APPROVED_CV_WORKER=null` |

Re-run of full suites **not** repeated in the blocker-prep pass (no code identity changes).

---

## Blocker prep completed this pass

| Deliverable | Path |
|---|---|
| Verified blocker register | `docs/release/blocker-register-2026-11-04.md` |
| Exact operator actions | `docs/release/operator-actions-2026-11-04.md` |
| Counsel packet | `docs/release/counsel-packet-2026-11-04.md` |
| Extended counsel/device/CPU report | `docs/release/counsel-device-cpu-release-report-2026-11-04.md` |
| D review operator brief | `docs/release/d-review-operator-brief-2026-11-04.md` |
| Real-device protocol | `docs/release/real-device-protocol-5-3.md` |
| CPU-only / no-CV proposal | `docs/release/cpu-only-release-proposal-5-3.md` |
| App Check audit artifact | `.local/app-check-audit-2026-11-04.md` (gitignored local) |
| Post-restore deletion re-apply script | `scripts/reapply-deletions-after-restore.mjs` (dry-run default) |
| Owner rows REL-D-OFF / REL-CPU | `docs/release/owner-acceptance.md` |
| Checklist legal status wording | `docs/release/app-store-submission-checklist.md` |
| Backups.md script pointer | `docs/security/backups.md` |

---

## Tooling access observed

| Tool | Result |
|---|---|
| Firebase CLI `use` | `scoutx-230b0` |
| Firebase `projects:list` | **Failed** (re-login needed) |
| EAS `whoami` | **Failed** (TLS / certificate verify) |
| Firebase MCP | Auth timed out / unavailable |
| gcloud | Not on PATH |
| Xcode | N/A (Windows) |

---

## Readiness decision

**Not ready** for App Store submission.  

**Ready for submission preparation** subject to the named external actions in the operator doc (App Check registration, EAS/TestFlight device protocol, counsel, owner SEC + REL decisions, backups approval, RC webhook test).  

Scoped **no-CV-worker** path can proceed as a **product decision** (REL-CPU) without closing the CUDA gap; CUDA remains deferred until CV worker evaluation.

---

## Change log

| When | Change | Commit |
|---|---|---|
| earlier | C default + dossier/ledger/contracts; release-gate fixture exclude | `6ebdd5c` |
| earlier | gemini-2.5 + entitlement wording | `0ebfbd8` |
| earlier | ledger SHA notes | `6f60361`, `103931c` |
| blocker prep | register, operator actions, counsel, D brief, device protocol, CPU proposal, restore script, checklist/backups/owner updates | `f2a82d0` |
| audit follow-up | Align `APP_CHECK.md` with runtime; privacy-label camera/mic + messaging note; unit tests for `shouldEnforceAppCheck` | `065afcd` |
| external verify | Re-confirm 721 unit tests; restore script guards; D mapping SHA; Firebase CLI needs `--reauth`; write `external-verification-2026-11-04.md` | `d9411dc` |
| final audit | External claims **not** evidenced; gate BLOCKED×10; unit 721; worker 619/16sk/6xf; typecheck+functions build PASS; no archive; D PENDING; write `final-release-audit-2026-11-04.md` | pending |
