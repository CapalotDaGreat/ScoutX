# PitchProof 5.3 final release audit

**Audit date:** 2026-11-04 (Europe/Zurich evening)  
**Branch:** `release/pitchproof-5-3-candidate`  
**Release-candidate commit (full):** `18dad67f6e40aab3dfa6e03d8d287626095d0999`  
**Prior reported HEAD:** `4cebc63` (ancestor; superseded by pricing + verification docs)  
**Working tree at audit start:** clean  
**Remote:** `git@github.com-CapalotDaGreat/ScoutX.git` — **no upstream** for this branch  
**Pinned GPU baseline:** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor of HEAD; `merge-base --is-ancestor` exit 0)  
**App version (source):** `1.0.0` (`app.json`) · Bundle `com.scoutx.app` · ASC `6820059284` · Team `833CYAZ8XT` · Firebase `scoutx-230b0`  
**productionApproval:** false · D **not** promoted · CV worker `null` · AI footage flag false  

**Scope:** verify claimed external completions from artifacts; freeze/audit RC; run local gates; read-only ASC/URL checks. **No** upload, submit, deploy, or live config change.

---

## Verdict

# NOT READY — CONCRETE BLOCKERS REMAIN

User statement that external checks are complete **does not replace missing artifacts**. No App Check console evidence, restore drill evidence, counsel sign-off, filled device protocol, or independent D `answers.csv` was found in the repo, `.local/`, agent stores, or related release docs. Release gate remains **BLOCKED (10 items)**. No signed archive exists in this workspace.

---

## 1. External-check evidence (verification)

| Check | Required evidence | Found? | Notes |
|---|---|---|---|
| App Check registration + release-client metrics | Console Apps providers + API metrics + TestFlight callable smoke tied to commit/build | **No** | Only code audit `.local/app-check-audit-2026-11-04.md` (explicitly “cannot prove without console”). `firebase projects:list` → credentials invalid. Marker SEC-15 EXTERNAL remains. |
| Isolated backup restore | PITR/schedule proof + restore DB id + counts + deletion re-apply + marker cleared | **No** | `docs/security/backups.md` still `BACKUP_CONFIGURATION_REQUIRED`; checkboxes unchecked. |
| Counsel review | Named decision; LEGAL markers cleared or owner-filed waiver with counsel | **No** | Gate: **9** docs `LEGAL_REVIEW_REQUIRED`; **4** retention periods; website pages flagged. `owner-acceptance.md` counsel-related rows empty. |
| Real-device release testing | Dated protocol log: device/OS/EAS build/commit/pass-fail | **No** | `real-device-protocol-5-3.md` still blank template. validation-matrix **60** `NOT VALIDATED`. No `.ipa`/`.xcarchive` locally. |
| Independent D review + decision | `answers.csv` + stage-2 marks + owner REL-D-OFF or promotion decision | **No** | Packet README status **PENDING**; no `answers.csv`. Defaults still `APPEARANCE_ONLY_LIKELY=True` (D off). `REL-D-OFF` `_pending_`. |

### Specific missing records to return (only these)

1. **App Check:** screenshot Firebase `scoutx-230b0` → App Check → Apps → `com.scoutx.app` showing App Attest + DeviceCheck; APIs metrics screenshot after production TestFlight exercise; EAS build ID + commit SHA used. (Do **not** paste tokens.)
2. **Restore:** restore destination database id; wall-clock; doc-count table; dry-run JSON summary; note whether `--execute` ran on clone; then updated `backups.md` with operator/date (marker removal only after that).
3. **Counsel:** counsel email/memo path or filled `owner-acceptance` / cleared LEGAL markers with name+date; answers to counsel packet §7.
4. **Device:** completed copy of `real-device-protocol-5-3.md` (or attached checklist) with model, iOS, EAS build #, commit, date, A–H results.
5. **D:** `workers/football-cv/bench/results/5.3/identity-review-packet-20261103/answers.csv` + stage-2 marks + written promotion/keep-off decision in `owner-acceptance.md` (`REL-D-OFF` or wait).

---

## 2. Freeze / candidate audit

**Intended RC tip:** `18dad67…` (docs tip). Functional product tip includes pricing/quotas `86b59ba` and C-default `6ebdd5c`.

| Default / gate | Verified value | Evidence |
|---|---|---|
| C `OCR_CONSULTED_ONLY` | **True** (default `"1"`) | `.venv` python reload |
| D (appearance-only LIKELY disabled) | **Not promoted** — `APPEARANCE_ONLY_LIKELY` default **True** | `states.py` + runtime print |
| A/B/E | **False** | crossings / analyze defaults |
| AI footage | **false** | `isFootageProcessingApproved({})` |
| CV worker | **null** | `APPROVED_CV_WORKER` |
| Callable App Check | **true** (emu false) | `shouldEnforceAppCheck` |
| GPU baseline preserved | ancestor | exit 0 |
| Secrets / private media in git | gate PASS | `release:gate` |
| Debug App Check in production | blocked by policy | `eas.json` + releaseBuildPolicy |

No local engineering CODE BLOCKER from the gate. Unrelated working-tree changes: none at audit start.

**Cumulative risk accepted only if owner records it:** appearance-only LIKELY residual (`REL-D-OFF`); no-CV CUDA gap deferred (`REL-CPU`). Both still `_pending_`.

---

## 3. Analysis pipeline / safety

**Supported public path today:** app upload → quarantine → still-frame / limited AI **only if** `AI_FOOTAGE_PROCESSING_APPROVED=true` (currently **off** → refuse). Continuous decode→detect→OCR→track→identity worker path is **not** an approved production configuration (`APPROVED_CV_WORKER=null`).

| Topic | Status |
|---|---|
| Unvalidated CUDA in release | **Excluded** while worker null (DEFER for CV worker, not binary if honesty holds) |
| Identity leakage into attributed stats | Code + tests assert fail-closed / unavailable stages when worker off; full-match device proof **missing** |
| Known wrong-player xfails | **6 xfailed** retained in worker suite (not weakened) |
| Conflicting-number / contact / unrelated-tracklet safeguards | Covered by worker tests (suite green with xfails) |
| D unresolved claims | Still unresolved; packet PENDING |

Full-match video re-run and release-device analysis journeys were **not** re-executed this audit (no footage authorization / no TestFlight build on this host).

---

## 4. Final checks run (this audit)

| Check | Command / env | Result |
|---|---|---|
| App unit | `npm run test:unit` @ `18dad67` | **721 pass / 0 fail** (exit 0) |
| Typecheck | `npm run typecheck` | exit 0 |
| Functions build | `functions` `npm run build` | exit 0 |
| Worker pytest | `.venv` `pytest -q --ignore=tests/test_52.py` (no `torch` in venv) | **619 passed, 16 skipped, 6 xfailed** (exit 0) |
| `test_52.py` | requires `torch` | **Not executed** — release impact: GPU/ORT provider unit path unverified on this host (CV worker anyway unapproved) |
| Release gate | `npm run release:gate -- --skip-tests` | **BLOCKED** — CODE 0 · EXTERNAL 4 · LEGAL 3 · NOT VALIDATED 3 · SKIPPED rules |
| Firebase CLI | `firebase projects:list` | **auth invalid** |
| EAS whoami | started; historically TLS issues | **not used as proof** |
| Signed archive | search `*.ipa`/`*.xcarchive` | **none** |

Gate EXTERNAL/LEGAL/NOT VALIDATED detail captured in `.local/release-gate-final-2026-11-04.txt`.

---

## 5. App Store materials (read-only)

Sources consulted: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [5.1.1(v) account deletion](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/), [User privacy & data use](https://developer.apple.com/app-store/user-privacy-and-data-use/).

| Item | Status |
|---|---|
| Privacy / terms URLs resolve | **Yes** — `https://pitchproof.online/privacy`, `/terms` |
| Live vs repo legal | **Drift:** live fetch showed **v1.1.0 / Effective 8 Oct 2026**; local `public/*/index.html` is **v1.2.0 draft** with `LEGAL_REVIEW_REQUIRED` / “pending legal review”. Do not submit until live ↔ counsel-approved text align. |
| Account deletion (5.1.1(v)) | Server-enforced path present (gate PASS); **device proof missing** |
| IAP / restore (3.1.1) | Code + matrix; **sandbox device NOT VALIDATED** |
| Privacy nutrition / Privacy Report | Manifest tracking off (gate PASS); **Xcode Privacy Report merge NOT VALIDATED** (needs archive) |
| ASC metadata / demo account / screenshots | Templates only — **live ASC not revalidated** (no authenticated ASC tool this session) |
| Export compliance | `ITSAppUsesNonExemptEncryption: false` in `app.json` — owner confirmation still required at submit |
| AI honesty | Code fail-closed; store/review copy must not claim continuous tracking |

---

## 6. Rollback

1. **App binary:** do not submit; if TestFlight build exists for this SHA, stop testing / expire build in ASC.  
2. **Identity C:** `SCOUTX_OCR_CONSULTED_ONLY=0` or revert `6ebdd5c` (affects worker only).  
3. **Callable App Check:** only with deploy approval — `ENFORCE_APP_CHECK=false` + functions redeploy (not done).  
4. **Git:** branch unpushed — discard tip commits locally only if intentionally abandoning candidate.  
5. **CV / AI:** keep `APPROVED_CV_WORKER=null` and AI flag unset (current safe state).

---

## 7. Exact next submission steps (after blockers clear)

1. Deposit the five missing evidence records above into `docs/release/` (or update markers).  
2. Fill `owner-acceptance.md` SEC-10–14, 17–18 + `REL-D-OFF` + `REL-CPU`.  
3. Align live Hosting legal pages with counsel-approved drafts; remove `LEGAL_REVIEW_REQUIRED` only after named approval.  
4. `eas env:list --environment production` (names only) → production build @ frozen SHA → TestFlight.  
5. Re-run `real-device-protocol-5-3.md` on that build; attach results.  
6. Confirm App Check metrics; optionally product Enforce (**separate approval**).  
7. Complete ASC App Review Information ([complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/)).  
8. Re-run `npm run release:gate` until 0 BLOCKED (or only accepted EXTERNAL with recorded waivers).  
9. **Then** `eas submit` — not before.

---

## Owners / dependencies

| Owner | Blocks |
|---|---|
| Operator | App Check screenshots, EAS build/device log, restore evidence, RC webhook proof |
| Counsel | LEGAL markers, privacy/ASC answers |
| Owner | SEC + REL rows; export compliance attestation; submit go/no-go |
| Independent reviewer | D `answers.csv` (if not shipping D-off with `REL-D-OFF`) |

---

## Honest readiness

**Local engineering** for a scoped no-CV, AI-footage-off, D-off candidate is largely in place (gates green for code; tests green).  
**Public App Store submission** is **not** ready: external evidence absent, release gate blocked, no archive, legal/device/owner rows open, live/legal draft drift.
