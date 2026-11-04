# PitchProof 5.3 App Store submission handoff

**Handoff date:** 2026-11-04 (~21:15 CET)  
**Authoritative ledger:** `docs/release/blocker-register-2026-11-04.md`  
**Prior audits:** `final-release-audit-2026-11-04.md`, `reauth-verification-2026-11-04.md`

---

## Verdict

# READY AFTER SPECIFIC NAMED EXTERNAL ACTIONS

Local engineering for a **scoped** release (Passport + subscriptions + honest “tracking unavailable”; AI footage **off**; CV worker **off**; candidate D **not** promoted) has **0 code blockers**. Submission is blocked until the named external actions below produce evidence. This is **not** “READY FOR APP STORE SUBMISSION.” Apple acceptance is not guaranteed.

---

## 1. Freeze identity

| Field | Verified value |
|---|---|
| Branch | `release/pitchproof-5-3-candidate` |
| Full commit | `3cddd366eaa6a7d7546f72e0a36abcec519849be` (handoff docs tip; freeze this or later intentional tip for EAS) |
| Upstream | **none** (not pushed) |
| App version (source) | `1.0.0` (`app.json`) |
| Bundle ID | `com.scoutx.app` |
| ASC app id | `6820059284` |
| Apple Team | `833CYAZ8XT` |
| Firebase | `scoutx-230b0` / iOS app `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` |
| Expo | `@boddibossi/scoutx` (`a15ee8f0-6d2a-4a4c-9c5d-1ab76ceada10`) |
| GPU baseline | `51d41c9…` ancestor of HEAD |
| Tip archive | **none** for this commit |

**Do not submit** historical build **1.0.0 (4)** (`554e311b-…`, commit `6679226`, 86 commits behind tip).

---

## 2. Access & security (verified this pass)

| Check | Outcome |
|---|---|
| `NODE_OPTIONS=--use-system-ca` | set (User + session) |
| `NODE_TLS_REJECT_UNAUTHORIZED` | **unset** |
| Node → `api.expo.dev` | `authorized=true` |
| Firebase `login:list` / `projects:list` | Logged in; **scoutx-230b0 (current)** readable |
| `apps:list` | PitchProof iOS present |
| `eas whoami` / `project:info` | Owner on `@boddibossi/scoutx` |
| EAS production env names | All 8 gate-required names present (values not logged) |

Shells without system CA will re-break Node TLS under AVG HTTPS scanning. Helper: `.local/use-system-ca.ps1`.

---

## 3. Blocker reconciliation (ledger B-01…B-15)

| ID | Verified state (2026-11-04 evening) | Evidence | Blocks submit? |
|---|---|---|---|
| **B-01** App Check | Providers **not configured**; DeviceCheck **No**; product Enforce **Off**; debug tokens none; callables still `enforceAppCheck` default on | Firebase CLI `appcheck:*` | **Yes** (safe TestFlight / 2.1) |
| **B-02** Backups/restore | `BACKUP_CONFIGURATION_REQUIRED`; checkboxes empty; no `gcloud` | `docs/security/backups.md` | Ops gate (not Apple rule) |
| **B-03** Counsel | 9× `LEGAL_REVIEW_REQUIRED`; live privacy **v1.1.0 Effective 8 Oct** vs local public **v1.2.0 draft** drift | legal docs + URLs | **Yes** |
| **B-04** Owner SEC | All `_pending_` | `owner-acceptance.md` | Gate NOT VALIDATED |
| **B-05** Device | No protocol results; old IPA not applicable | EAS build list + blank protocol | **Yes** |
| **B-06** D review | Packet PENDING; **no** `answers.csv` | identity-review README | Promote blocked; ship-D-off needs **B-13** |
| **B-07** GPU/CUDA | Worker null; baseline preserved | code + ancestor check | DEFER if REL-CPU |
| **B-08** AI footage | `isFootageProcessingApproved({})===false`; no `.env.scoutx-230b0` (**expected**) | providerConfig + gate | DEFER if feature not offered |
| **B-09** CV worker | `APPROVED_CV_WORKER=null`; no `approval.json` (**expected**) | generated + gate PASS not configured | DEFER |
| **B-10** RC webhook | Not revalidated live | operator-actions | Ops |
| **B-11** EAS env | Names OK; tip build missing | `eas env:list` | Tip archive required |
| **B-12** ASC materials | Template only; demo creds placeholders | `app-review-notes.md` | **Yes** |
| **B-13** D-off risk | `appearance_likely=True` (D not promoted) | python defaults | Owner decision |
| **B-14** Privacy Report | No tip archive to inspect | — | After tip build |
| **B-15** Push branch | No upstream | git | REC |

`.env.scoutx-230b0` / `approval.json`: **not** required for this scoped binary; creating placeholders would be wrong.

---

## 4. Analysis / identity safety (verified)

| Default | Value | Authorized? |
|---|---|---|
| C `OCR_CONSULTED_ONLY` | **True** | Yes (release default commit) |
| D appearance-only LIKELY disabled | **False** (LIKELY still allowed) | **Not promoted**; needs B-13 or B-06 |
| A/B/E | **False** | Yes |
| AI footage | **false** | Fail-closed |
| CV worker | **null** | Fail-closed; CUDA **excluded** |
| Decoder | default (not HDR) | Preserved |

**Pipeline scope shipping:** app upload/quarantine paths exist; continuous decode→track→identity worker **unavailable** in production. Still-frame AI refused until B-08. Identity leakage into attributed continuous tracking stats is gated by worker null.

**Tests this pass:** identity-focused pytest + full unit/gate (see §5). Thresholds not lowered. Full-match video replay / on-device pipeline **not** re-executed (no tip build / no footage authorization).

---

## 5. Final checks (this tip)

| Check | Command | Result |
|---|---|---|
| Unit | `npm run test:unit` | **721 pass / 0 fail** |
| Release gate | `npm run release:gate -- --skip-tests` | **BLOCKED (10)** — CODE **0** |
| Known-identity + OCR C + appearance D tests | pytest subset under `.venv` | see `.local` / terminal (run with tip) |
| Signed tip archive | — | **Not built** |
| Privacy URL | https://pitchproof.online/privacy | Resolves (live ≠ local draft) |
| Support URL | https://pitchproof.online/support | Resolves |

---

## 6. Supported product claims (honest)

**In scope:** Football Passport, match logs, media library, movement (on-device, no lat/long upload), youth/guardian gates, account deletion, IAP via RevenueCat, reporting.

**Out of scope / unavailable:** continuous player tracking, auto event detection, CUDA CV worker, AI footage analysis (until B-08).

**Review notes:** strip upload/AI promises from `app-review-notes.md` while AI flag is off (template already warns).

---

## 7. Named external actions (minimal path to submit)

### A. App Check registration (B-01) — do before relying on TestFlight
1. [Firebase Console](https://console.firebase.google.com/) → **scoutx-230b0** → App Check → Apps → PitchProof iOS.
2. Register **App Attest** (Team `833CYAZ8XT`) and **DeviceCheck** (DeviceCheck-capable `.p8`).
3. **Evidence:** Apps list no longer “not configured”; providers screenshot (no tokens).
4. Keep product Enforce **Off** until metrics after tip TestFlight (separate **approval** to turn On).

### B. Owner decisions (B-04, B-13, B-07)
1. Fill `docs/release/owner-acceptance.md` SEC-10–14, 17–18.
2. Record **REL-D-OFF** (accept appearance-LIKELY residual) **or** wait for independent D (`answers.csv`).
3. Record **REL-CPU** (defer CUDA / no-CV worker).

### C. Counsel (B-03)
1. Send files listed in `counsel-packet-2026-11-04.md`.
2. Align **live** Hosting privacy/terms with counsel-cleared text; clear `LEGAL_REVIEW_REQUIRED` only with named approval.
3. Fix live↔repo version/effective-date drift.

### D. Tip build + device (B-05, B-11, B-14) — **APPROVAL REQUIRED** to queue
```powershell
$env:NODE_OPTIONS='--use-system-ca'
git checkout release/pitchproof-5-3-candidate
git rev-parse HEAD   # freeze SHA for the build
npx eas-cli build -p ios --profile production
# later, separate approval:
npx eas-cli submit -p ios --latest
```
1. Install from TestFlight on physical iPhone.
2. Execute `real-device-protocol-5-3.md` (incl. App Check G1; AI expect refuse C2).
3. Return: device model, iOS, EAS build id, commit, date, pass/fail.
4. From archive: Privacy Report vs ASC labels (B-14).

### E. ASC materials (B-12)
1. Screenshots from tip build; fill demo accounts in `app-review-notes.md` (no AI claims if flag off).
2. Complete App Review Information per [Complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/).
3. Export compliance / encryption: confirm `ITSAppUsesNonExemptEncryption: false` with owner.

### F. Optional before public traffic
- B-02 backups/restore (**billable approval**).
- B-10 RevenueCat webhook test.
- B-06 only if promoting D (do **not** promote without independent answers).

---

## 8. Exact submission steps (after A–E evidence exists)

**Prepared now:** source tip, EAS project linkage, env names, review-notes template, privacy/support URLs, scoped honesty.

**Not executed:** tip archive upload, TestFlight of tip, ASC Submit for Review, App Check registration, counsel clear, owner rows.

1. Locate tip build on Expo: `@boddibossi/scoutx` → Builds → production finished for **frozen SHA** (not `6679226`).
2. Confirm IPA processed in App Store Connect → TestFlight for `com.scoutx.app` / `6820059284`.
3. Select that build for the App Store version **1.0.0** (or bump if required).
4. Owner confirms: privacy answers, export compliance, content rights, demo account works, App Check metrics healthy for callables.
5. Paste filled App Review notes (AI/tracking honesty matches flags).
6. Verify reviewer can sign in; backend `scoutx-230b0` up; deletion path works.
7. Final gate: `npm run release:gate` on the **same** SHA → no unexpected CODE/LEGAL blockers (EXTERNAL only if explicitly accepted).
8. Press **Submit for Review** — only after A–E complete.

---

## 9. Rollback / monitoring

| Layer | Rollback |
|---|---|
| Binary | Do not submit; expire unused TestFlight builds |
| App Check product Enforce | Console → Off (callable enforce needs Functions deploy to change) |
| Identity C | `SCOUTX_OCR_CONSULTED_ONLY=0` or revert C commit (worker) |
| AI / CV | Keep flags unset / worker null (current) |
| TLS helper | Clear User `NODE_OPTIONS` |

Monitor after release: App Check metrics, Functions errors (`failed-precondition`/App Check), RevenueCat entitlements, crash-free via Sentry, deletion job failures.

---

## 10. Minimal actions for you

1. Register App Check App Attest + DeviceCheck → return screenshot.  
2. Fill `owner-acceptance.md` (SEC + REL-D-OFF + REL-CPU).  
3. Approve **EAS production build** of `5d2447a…` (or newer intentional tip) → TestFlight → device protocol.  
4. Send counsel packet; clear LEGAL markers only after reply; sync live site.  
5. Complete ASC App Review Information → then Submit.
