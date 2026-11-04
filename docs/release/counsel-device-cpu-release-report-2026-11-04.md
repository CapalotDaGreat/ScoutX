# PitchProof counsel / device / CPU-only release report

**Date:** 2026-11-04  
**Branch:** `release/pitchproof-5-3-candidate`  
**Workspace:** `C:\ZLI\M335\ScoutX-gpu-benchmark` (Windows)  
**Pinned GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor of HEAD; exit 0)  
**productionApproval:** false  

**Scope limits:** This document prepares packets and protocols only. It does **not** deploy, contact counsel, upload footage, allocate cloud GPUs, submit to App Store Connect, or state legal conclusions / counsel approval.

---

## Part A — Legal / privacy counsel packet prep

### A.1 Product description and audience (factual, for counsel)

- **Product:** PitchProof (Expo/`com.scoutx.app`) — player-first football identity / “Football Passport”: match logs, highlight/media uploads, optional sampled-frame AI analysis, movement sessions (pitch-relative summaries), scout/coach tools, youth guardian gates, Apple IAP via RevenueCat.
- **Audience:** Players (under-13 private mode; 13–17 guardian scopes; 18+), scouts, coaches. Store age rating draft: 4+ with UGC; not Kids Category (`store/listing.json`).
- **Operator entity (config):** CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland (`src/config/legalConfig.ts`). Contacts all `support@pitchproof.online`. `registerNumber` / `vatNumber` / DPO / EU representative: **null** (not invented).
- **Primary regions claimed in drafts:** Firestore / Storage / Functions `europe-west6` (Zurich). Auth, Hosting CDN, App Check, push, RevenueCat, OpenRouter can involve other countries (`legal/documents/privacy-policy.md`, `docs/privacy/processor-register.md`).

### A.2 Data inventory (audit summary)

Authoritative inventory: `docs/privacy/data-inventory.md` (D1–D22). Cross-check against code/config:

| Flow | Client (`src/`) | Server (`functions/`) | Leaves device? |
| --- | --- | --- | --- |
| Auth (email / Apple / Google) | Firebase Auth | Auth + `users/{uid}` | Yes |
| Age band / youth / guardian | Age gate UI; guardian via web link | `userSafety`, `youthConsent`, mail | Yes (guardian email) |
| Profile / matches / goals | Firestore writes | Rules + projections | Yes |
| Photos / videos | Image picker / Files; Storage upload | Quarantine → media / analysis | Yes when uploaded |
| Sampled-frame AI | Consent gate; frames upload | OpenRouter → allowlisted `google/gemini-2.5-flash`; `PROVIDER_PRIVACY` ZDR | Yes **only if** `AI_FOOTAGE_PROCESSING_APPROVED=true` (else fail-closed) |
| Continuous CV tracking | UI honesty “unavailable” | `APPROVED_CV_WORKER=null`; needs URL + approval | **Not in production path** |
| Movement / GPS | `gpsTrackingService` relative metres | Session summaries only | Lat/long claimed never uploaded |
| Push | Expo token | `pushTokens`, delivery | Yes (token) |
| IAP | RevenueCat SDK (`purchasesService`) | `revenueCatWebhook` → entitlements | Yes (uid + purchase events) |
| Crash / perf | `@sentry/react-native` (prod) | n/a | Yes if DSN enabled; `sendDefaultPii: false` (policy claim) |
| App Check | `firebaseAppCheck.ts` / production env | Callables default `enforceAppCheck` unless `ENFORCE_APP_CHECK=false` | Attestation tokens |
| Account deletion / export | Privacy Center | `accountDeletion`, retention jobs; RC customer record **not** auto-deleted | Server-side job |

**Privacy manifest / labels:** `app.json` `ios.privacyManifests` (`NSPrivacyTracking: false`) aligns with `docs/compliance/app-store-privacy-labels.md` collected types (name, email, user ID, photos/videos, other user content, fitness, purchase history, other data types, crash, performance; location not declared).

**Permission strings:** Photo library (usage + add); location When-In-Use only (background disabled); image-picker also declares **camera** and **microphone** strings — see inconsistencies below.

### A.3 Providers / SDKs (as implemented or gated)

| Provider | Role | Gate / notes |
| --- | --- | --- |
| Firebase / Google Cloud | Auth, Firestore, Storage, Functions, Hosting, App Check | Region Zurich for core data plane; Auth/CDN global |
| OpenRouter | AI routing | `functions/src/ai/openRouter.ts` + `providerConfig.ts` |
| Gemini (`google/gemini-2.5-flash`) | Text/vision allowlist only | Footage blocked until AI flag |
| RevenueCat + StoreKit | Entitlements / paywall | Webhook auth header operator step open |
| Sentry | Crash + 20% traces | Org `scoutx` / project `scoutx-mobile` in app.json plugin; region EXTERNAL |
| Expo / Apple | Push, distribution | — |
| SMTP / Trigger Email | Guardian mail | Provider not chosen in register |
| CV worker (Cloud Run GPU) | Tracking | **Not approved / not deployed** |

### A.4 Retention / deletion (code vs drafts)

- **Code source:** `functions/src/dataRights/retention.ts`, `mediaLifecycle.ts`, mirrored in `docs/privacy/retention-matrix.md` and `legal/documents/data-retention-policy.md`.
- **Operational:** failed uploads 7d; exports 7d; abandoned jobs 30d; RC webhook receipts 90d; match video lifecycle (delete on complete unless keep; failed 24h / 7d retry); under-13 consent windows 14d / 30d grace.
- **LEGAL REVIEW REQUIRED periods:** consent proof 3y; moderation 2y; privacy requests 3y; deletion receipts 3y.
- **Explicit draft honesty:** in-app deletion does **not** auto-delete RevenueCat customer record; backups not configured in-repo (`BACKUP_CONFIGURATION_REQUIRED`).

### A.5 Policy / terms draft paths

| Path | Status in repo (front-matter) |
| --- | --- |
| `legal/documents/privacy-policy.md` | draft; `effectiveDate: LEGAL_REVIEW_REQUIRED` |
| `legal/documents/terms-of-service.md` | draft / review markers |
| `legal/documents/data-retention-policy.md` | draft; LEGAL_REVIEW_REQUIRED |
| `legal/documents/ai-use-policy.md` | draft; CV “not available yet” |
| `legal/documents/data-subject-rights.md`, `youth-safety-policy.md`, `guardian-consent-notice.md`, `subscription-terms.md`, others under `legal/documents/` | drafts / review markers |
| `docs/compliance/app-store-privacy-labels.md` | ASC answer source; LEGAL REVIEW REQUIRED |
| `docs/compliance/legal-technical-consistency.md` | claim↔code matrix |
| `docs/privacy/*` | inventory, processors, retention, deletion, DPIA |
| Hosted URLs (when deployed): | `https://pitchproof.online/privacy`, `/terms`, etc. (`app.json` extra) |

### A.6 Factual inconsistencies fixable in **local drafts** (describe only; no counsel approval invented)

1. **`docs/release/app-store-submission-checklist.md` §2.2** says legal documents are “`final` with effective date 2026-10-08” — contradicts front-matter on current drafts (`status: draft`, `effectiveDate: LEGAL_REVIEW_REQUIRED`). Fix: align checklist language to draft/review state.
2. **Camera / microphone usage strings** exist via `expo-image-picker` plugin in `app.json`, but privacy-labels matrix lists Audio as **not collected** and does not discuss camera beyond Photos. Fix: clarify whether recording uses mic/camera on-device only, or update labels/policy if audio/camera media can leave the device.
3. **Device ID / push token:** privacy labels flag Expo push token as undeclared Device ID pending legal reading; privacy policy lists “push notification token” under device/technical data. Fix: one consistent ASC + policy treatment after counsel input.
4. **Store listing `messagingAndChat: true`** vs copy “No open chat” / structured requests only — questionnaire vs narrative must stay consistent for ASC.
5. **Processor register** still lists CV worker as possible Cloud Run GPU path; AI/privacy drafts correctly say tracking unavailable. For a still-frame-only release, drafts should keep CV worker clearly **not processing** (already fail-closed) and avoid implying live GPU processing.
6. **Sentry region / retention** and **SMTP provider** called out as unconfirmed in privacy policy and processor register — public copy must not assert a region until operator supplies it.
7. **RevenueCat deletion:** policy already discloses manual processor step; ensure subscription-terms / deletion UI copy stay aligned (already partially covered by legal generator work notes).
8. **Translations:** `LEGAL_TRANSLATION_REVIEW_REQUIRED` — do not treat non-EN legal UI as counsel-cleared.

### A.7 Counsel packet outline (attach repo paths; do not claim review done)

1. **Cover / purpose** — PitchProof 5.3 candidate counsel prep; drafts only; no submission authorization.
2. **Product description and audience** — §A.1; `store/listing.json`; `docs/release/feature-inventory.md`.
3. **Data inventory + processing locations** — `docs/privacy/data-inventory.md`; Zurich vs global services; movement “no lat/long stored” claim + code pointer.
4. **Providers / SDKs** — `docs/privacy/processor-register.md`; OpenRouter/Gemini allowlist; RevenueCat; Firebase; Sentry; gated CV worker.
5. **Retention / deletion** — retention matrix + deletion matrix; account deletion job limits (RC).
6. **Policy / terms drafts** — all `legal/documents/*`; generated site pages if present under `public/`.
7. **App Store privacy labels + privacy manifest** — compliance doc + `app.json`.
8. **Youth / COPPA-adjacent controls** — under-13 private mode; guardian flows; self-declared age band (SEC-12).
9. **AI / footage** — fail-closed until flag; ZDR routing is contract request not audit proof (C9 PARTIAL).
10. **Specific unresolved legal questions** (for counsel — not answered here):
    - Lawful bases and necessity of 2y/3y legal-hold periods.
    - Under-13 verifiable consent adequacy (typed name + email confirmation) under FADP/COPPA amended rule / EU Art. 8 ages.
    - Transfer safeguards and signed DPAs for OpenRouter, model endpoints, RevenueCat, Sentry, Expo, SMTP.
    - Whether push token is “Device ID” for ASC.
    - Camera/mic/audio collection classification.
    - Launch territories → EU representative / DPO / local notices.
    - Whether draft→published changes need major version + re-acceptance.
11. **Missing owner-supplied facts:**
    - Commercial register / UID / VAT; DPO; EU/UK representative.
    - Launch country list.
    - Sentry data region + retention setting.
    - SMTP / Trigger Email provider identity.
    - Confirmed mail routing test to `support@pitchproof.online`.
    - Signed processor agreements status.
    - Owner decisions on SEC-10–14, 17–18 (`docs/release/owner-acceptance.md`).
    - Whether AI footage will be offered in the first public release (if no → keep flag unset; disclose unavailability).
    - Backup/PITR actual config + restore drill evidence.

---

## Part B — Real-device validation

### B.1 This machine / repo access reality

- **Host OS:** Windows. No local Xcode / iOS Simulator execution assumed.
- **Repo scripts with device/EAS relevance (no macOS required on this PC):**
  - `eas.json` — `development.ios.simulator: true` (cloud/sim profile only); `production` / `preview` use EAS `ios.image: latest` (remote Mac builders).
  - `npx eas-cli build -p ios --profile production` + submit (`eas.json` submit → ASC app `6820059284`).
  - `scripts/start-expo.mjs` / `sync-dev-env.mjs` — Expo Go / LAN on physical device (not App Store validation).
  - `scripts/release-gate.mjs --allow-external` — internal/TestFlight code gate.
  - Marketing helpers reference `xcrun-simctl` / `xcode-device-screenshot` as **captureMethod enums**, not runnable Windows tooling.
  - GPU shell scripts under `workers/football-cv/bench/*.sh` are **CV benchmark**, not app-device validation.
- **Simulator ≠ device validation.** Do not treat Expo web, Android emulator, iOS Simulator, or Metro export as App Review / IAP / App Attest evidence.

### B.2 Focused real-device protocol (physical iPhone; optional iPad compatibility)

Record every row in `docs/release/validation-matrix.md` (date, EAS build id, device, iOS, tester). Prefer build from **this release branch** for 5.3 candidate (note: older docs say `main` — update operator notes accordingly).

| # | Area | Steps | Expected evidence |
| --- | --- | --- | --- |
| R1 | Fresh install | Delete app → TestFlight install → first launch legal gate + age band | Screenshots; no prior Keychain entitlement assumed |
| R2 | Permissions | Photos; Location When-In-Use for movement; Notifications optional; deny each once | Feature-scoped failure only; match logging still works |
| R3 | Auth | Email/password register; Sign in with Apple; logout; recovery link if used | Success paths; no raw Firebase errors |
| R4 | Video import | Photos + Files/iCloud clip; consent gate all acknowledgements | Nothing uploads until ticked; cancel → no job |
| R5 | Backgrounding | Mid-upload home/lock; force-quit ~40%; reopen | Resume from committed offset; file-changed refuse |
| R6 | Results / abstention | Short-clip still-frame path **or** fail-closed if AI flag unset | If flag unset: clear “not available” / privacy message. If flag set after review: observable/not observable; CV stages **unavailable**; no fabricated tracks; abstention ≠ confirmed tracking |
| R7 | Correction | Dispute event / “Not me”; undo rules | Dependent coaching cleared; no silent re-confirm |
| R8 | Deletion | Export optional; Delete account with recent re-auth | Completes or clear error; Apple subscription cancel separate (copy) |
| R9 | IAP / restore | Sandbox Apple ID; purchase Premium; reinstall/restore | Server entitlement via webhook; client flag not sole authority |
| R10 | App Check (release) | Production TestFlight with `EXPO_PUBLIC_APP_CHECK_ENABLED=true` | Callables succeed **only if** App Attest/DeviceCheck registered; else document systematic failures (do not set `ENFORCE_APP_CHECK=false` to mask) |
| R11 | Crash / perf | Trigger non-fatal path; optional forced crash in non-prod | Sentry event without user id if diagnostics enabled; or “DSN unset” noted |

Use `docs/release/controlled-evaluation-checklist.md` sections A–D and `docs/video/device-test-protocol.md` for expanded video cases **only when** footage processing is approved and tester has rights to the footage.

### B.3 Exact TestFlight / EAS operator steps (evidence-oriented)

**Preconditions (operator consoles — not done by this Windows agent session):**

1. EAS production env: six `EXPO_PUBLIC_FIREBASE_*`, `GOOGLE_SERVICES_PLIST`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`), App Check enabled, no debug/emulator/legal-placeholder overrides (`docs/release/app-store-submission-checklist.md`).
2. Firebase App Check: App Attest + DeviceCheck registered (SEC-15).
3. RevenueCat webhook URL + **Authorization** `Bearer <REVENUECAT_WEBHOOK_SECRET>`; send test event → 200.
4. `AI_FOOTAGE_PROCESSING_APPROVED` unset/`false` for still-frame-only honesty **or** documented provider review then `true`.
5. Local: `node scripts/release-gate.mjs --allow-external` (internal) or without flag only when EXTERNAL/LEGAL/device closed.

**Build & distribute:**

```text
# From repo root, on a machine with EAS login (can be Windows for cloud iOS builds)
npx eas-cli build -p ios --profile production
# Note: EAS Build ID, app version/build number from logs
npx eas-cli submit -p ios --profile production
# Or App Store Connect → TestFlight when processing finishes
```

**Expected evidence pack:**

- EAS build URL + ID; ASC/TestFlight build processing state.
- Device install screenshots (R1–R11).
- RevenueCat dashboard: sandbox purchase + webhook delivery.
- Firebase App Check metrics: verified tokens from release build.
- Explicit statement: **no simulator rows** counted as PASS for public release.

Historical ASC notes (`docs/release/asc-readiness.md`) show prior build/submit attempts; **re-validate on current candidate** — do not reuse old build IDs as 5.3 evidence.

---

## Part C — GPU gap and CPU-only / no-CV-worker release proposal

### C.1 Where CUDA appears (evidence)

| Location | CUDA role | Production app path? |
| --- | --- | --- |
| `workers/football-cv/scoutx_tracker/*`, `bench/fp32_comparison.py`, GPU Docker/lockfiles, `bench/*.sh` | Optional CUDA for tracker benchmarks / FP32 investigation | **No** — worker not approved |
| `functions/src/analysis/cvConfig.ts` + `cvApproval.generated.ts` | `APPROVED_CV_WORKER = null`; needs `CV_WORKER_URL` + `CV_WORKER_APPROVED=true` + approval record | **Fail-closed unavailable** |
| App / AI path | OpenRouter + Gemini on **sampled frames** (CPU/cloud API), not local CUDA | Independent of CV worker GPU |
| `docs/video/*` | Documents GPU accuracy gap vs CPU; pinned baseline `51d41c9…` | Research / deferred |

Pinned baseline **untouched:** `git merge-base --is-ancestor 51d41c9… HEAD` → success. Do not rewrite that commit.

### C.2 GPU gap is deferred CV-worker feature gate — not App Store blocker for still-frame-only

**Evidence:**

1. Production functions ship `APPROVED_CV_WORKER: null` (`cvApproval.generated.ts`).
2. AI policy + honesty tests: continuous CV tracking shown “Not available yet” (`legal/documents/ai-use-policy.md`; consistency C25).
3. Evidence ledger / dossier: CUDA gap **NOT VALIDATED**; supported contract is still-frame / limited analysis; `productionApproval: false`.
4. CUDA tooling lives under `workers/football-cv` benchmarks, not the Expo binary.

**Therefore (release engineering statement, not legal advice):** unresolved CUDA↔CPU accuracy does **not** block an App Store submission that **does not claim** continuous GPU/CV tracking or GPU parity — provided store copy, review notes, and in-app stages stay fail-closed honest. It **does** remain a blocker for any claim of production CV tracking or GPU-validated identity accuracy.

### C.3 Explicit CPU-only / no-CV-worker release proposal

**How CUDA is excluded**

- Do **not** set `CV_WORKER_URL` / `CV_WORKER_APPROVED` / `CV_EVENTS_VALIDATED`.
- Keep `APPROVED_CV_WORKER` null (do not run `scripts/cv-approval.mjs` to pin a worker).
- Do not deploy `workers/football-cv` to Cloud Run for this release.
- Leave pinned GPU baseline immutable; no production dependence on `51d41c9` runtime.

**User-visible implications**

- Analysis (if AI footage approved) = sampled frames + model observations; **no** automatic player tracking, event counts from CV, or pitch maps from the worker.
- UI/report stages for tracking/events/pitch remain unavailable / “—”, not zeros.
- Appearance-only LIKELY identity remains possible until candidate D reviewed (separate honesty issue).

**Config safeguards**

| Safeguard | Setting |
| --- | --- |
| CV worker | unset / not approved |
| AI footage | unset until provider privacy review documented |
| App Check | enforced (do not disable) |
| productionApproval / marketing | no GPU parity or “tracks every moment” claims |
| Release gate | treat CV evaluation absence as expected for this SKU |

**Remaining CPU accuracy limits (disclose; do not overclaim)**

- Still-frame / short-clip observations can be wrong; coaching held until identity confirm.
- OCR/consulted-only (candidate C on this branch) does not create tracking.
- Historical CPU bench results ≠ CUDA validation; Windows/Linux decode notes in `docs/video/` do not close GPU gap.
- No real-footage `docs/video/evaluation/approval.json` → no verified full-match CV evaluation.

### C.4 Future GPU session — approval-request template (do not allocate)

Use when owner wants a controlled FP32/CUDA comparison on the **pinned** commit only:

```text
GPU SESSION APPROVAL REQUEST (no allocate until signed)
- Purpose: bound/explain CUDA vs CPU accuracy gap; not a production deploy
- Region / zone: europe-west4-b (fallbacks only if listed and prior create failed; max 1 VM)
- Machine: g2-standard-8 + 1× NVIDIA L4; image family as in docs/video/gpu-fp32-proposal-2026-11-02.md
- Git commit (immutable): 51d41c9f5f333c7e93a606b7181ba8cb1cee8eac
- Harness: fp32_comparison.py --execute --expected-commit 51d41c9… (commit mismatch = refuse)
- Pricing sources: refresh Cloud Billing Catalog (placeholder: attach dated JSON); VAT excluded
- Cost / duration: estimate + ceiling (prior proposal ~$0.93–1.40 compute / ≤$3.00 ceiling / max-run-duration 180m) — re-quote before start
- Cleanup: auto-delete disk; verify 0 instances/disks; delete bucket run objects; list confirmation
- Out of scope: production CV_WORKER_APPROVED, App Store claims, private footage upload without rights
- Approver name / date / ceiling / max lifetime: ________
```

---

## Other unresolved blockers (aggregate)

### From `docs/release/evidence-ledger-2026-11-04.md`

- Release gate public mode: **0 CODE BLOCKER**; remaining **EXTERNAL×4, LEGAL×3, NOT VALIDATED×3**.
- Physical device / sandbox IAP: NOT VALIDATED.
- CUDA / GPU accuracy gap: NOT VALIDATED (deferred for still-frame SKU).
- Independent review of candidate D: NOT DONE.
- Production deploy / ASC submit: BLOCKED / unauthorized.

### From `docs/release/owner-acceptance.md`

Pending: **SEC-10, 11, 12, 13, 14, 17, 18** (all `_pending_`).

### From `docs/release/controlled-evaluation-status.md`

Public release blocked by: App Check registration; backups/restore drill; AI footage approval if offered; owner acceptance; counsel not independently verified; ~60 validation-matrix NOT VALIDATED; real-footage CV evaluation absent; store “Coming soon” until launch.

### Release-gate EXTERNAL items (high priority for operators)

| Item | Evidence / action |
| --- | --- |
| **App Check / App Attest** | SEC-15; register providers; keep enforcement on |
| **AI footage flag** | EXTERNAL until provider review → then `AI_FOOTAGE_PROCESSING_APPROVED=true`; else keep off and honest |
| **Backups** | `BACKUP_CONFIGURATION_REQUIRED` |
| **RevenueCat webhook** | Authorization header + live test event (`asc-readiness.md` / submission checklist §1.10) |
| **ASC metadata** | Screenshots, questionnaires, agreements, signed archive acceptance, privacy labels in Connect |
| **EAS production secrets** | Gate may report missing local env — verify in EAS production environment |
| **CV worker partial config** | Avoid half-config; leave fully unset for CPU-only SKU |

### LEGAL / NOT VALIDATED (gate)

- LEGAL_REVIEW_REQUIRED markers on legal docs + retention matrix periods.
- Owner acceptance pending rows.
- Validation matrix incomplete (~60 device/E2E rows).
- Still-frame-only / no `approval.json` real-footage evaluation (acceptable for CPU-only SKU if claims match).

---

## Document control

- **Not legal advice.** Local draft fixes ≠ counsel approval.
- **Not a deploy authorization.**
- Related: `release-dossier-5-3-2026-11-04.md`, `evidence-ledger-2026-11-04.md`, `gpu-fp32-proposal-2026-11-02.md`.
