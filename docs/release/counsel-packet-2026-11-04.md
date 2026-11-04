# Counsel review packet — PitchProof (draft for counsel; not a legal opinion)

**Prepared:** 2026-11-04  
**Branch / SHA:** `release/pitchproof-5-3-candidate` @ `103931cf54286eff67e2a040ba32a5aa7ab6e31d`  
**Controller (as coded):** CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland  
**Privacy / support contact:** support@pitchproof.online  
**Governing law stated in inventory:** Swiss FADP; GDPR considered for EU/EEA users  

**This packet does not claim counsel approval.** All LEGAL_REVIEW_REQUIRED markers remain open until counsel (or owner recording counsel’s decision) closes them.

---

## 1. Product and audience

PitchProof (bundle `com.scoutx.app`) is a football player / scout / coach app: Passport profiles, match logs, on-device movement summaries (pitch-relative metres — **no stored lat/long**), media library, optional AI-assisted match still-frame / short analysis (server-gated), subscriptions via RevenueCat / App Store.

**Age:** Store listing 4+ with UGC; under-13 private mode with parental consent; **not** Kids Category. Self-declared age bands (`under13` / `13-17` / `18plus`) — no DOB.

**Intended release honesty for this candidate:** continuous automatic player tracking and auto event detection remain **unavailable** unless a separately approved CV worker is configured. AI footage processing stays off until `AI_FOOTAGE_PROCESSING_APPROVED=true` after provider review.

---

## 2. Data inventory (summary)

Full table: `docs/privacy/data-inventory.md` (D1–D22). High level:

| Area | Stored | Notes |
|---|---|---|
| Account / role / age band | Firebase Auth + Firestore | No DOB |
| Guardian consent | Firestore + email link | Under-13 signed form + email |
| Profile / match logs | Firestore | |
| Media / quarantine / analysis | Storage + Firestore | Source video often deleted after job unless keep flags |
| Movement | Firestore + Storage | Pitch-relative only |
| Purchases | RevenueCat + entitlement docs | |
| Push | Expo push token on server | **Device ID declaration open** — see questions |
| Diagnostics | Sentry (prod), scrubbed, no uid | |
| Legal retention | Hashed subject ids | After deletion |

**Not collected (as documented):** advertising ID, cross-app tracking, analytics events, contacts, precise/coarse location persistence.

---

## 3. Providers / SDKs (processing locations where known)

| Provider | Role | Notes |
|---|---|---|
| Firebase (Google) — project `scoutx-230b0`, region historically `europe-west6` | Auth, Firestore, Storage, Functions, Hosting, App Check | Confirm DPA / transfer |
| OpenRouter → allowlisted `google/gemini-2.5-flash` | AI text/vision when footage AI approved | Zero-data-retention confirmation still checklist item |
| RevenueCat | Subscriptions / entitlements | App Store IAP |
| Expo / EAS | Build & push | |
| Sentry | Crashes / perf | Retention EXTERNAL |
| Apple | Sign in with Apple, IAP, App Attest / DeviceCheck | |

Processor register: `docs/privacy/processor-register.md`.

---

## 4. Retention / deletion

Source of truth mirrored in `docs/privacy/retention-matrix.md` ↔ `functions/src/dataRights/retention.ts` and media lifecycle.

Key behaviors:

- Account deletion server-enforced; recent sign-in required (guest exception = SEC-10).
- Match source video often deleted on job completion unless user opted to keep.
- Uncited frames removed; cited evidence retained until user deletes analysis/account.
- After deletion, minimised `legalRetention` receipts (hashed uid).
- **If backups are enabled**, backup retention must be disclosed; restores must re-apply deletions (`scripts/reapply-deletions-after-restore.mjs`).

Periods marked LEGAL_REVIEW_REQUIRED: closed privacy requests (3y), consent proof (3y), moderation decisions (2y), deletion receipt (3y).

---

## 5. Policy / terms drafts to review

| Document | Path |
|---|---|
| Privacy policy | `legal/documents/privacy-policy.md` (and built site `public/privacy/`) |
| Terms | `legal/documents/` (terms of use) |
| Other bundled legal | `legal/documents/*` — gate reports 9 docs `LEGAL_REVIEW_REQUIRED` |
| ASC privacy answers matrix | `docs/compliance/app-store-privacy-labels.md` |
| App privacy manifest | `app.json` → `ios.privacyManifests` (`NSPrivacyTracking: false`) |
| Store listing age / UGC | `store/listing.json` |

Website `public/privacy/index.html` still has review/effective-date placeholders per release gate.

---

## 6. App Store privacy / Apple requirements (factual)

- Accurate App Privacy answers and privacy policy are required for distribution; tracking declaration must be truthful ([User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/)).
- Privacy manifests / required-reason APIs / listed third-party SDK manifests apply to submissions ([Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)).
- Xcode Privacy Report after archive is still **NOT VALIDATED** (Sentry/RC/Firebase merge).
- Firebase App Check is **not** listed as an App Review Guideline requirement.

---

## 7. Questions requiring legal judgment

1. Confirm each legal basis in `data-inventory.md` §2 (contract vs consent for adult AI; Art. 8 age thresholds for EU states).
2. Confirm retention periods marked LEGAL_REVIEW_REQUIRED.
3. Confirm whether Expo push token must be declared as **Device ID** in ASC nutrition labels.
4. Confirm backup retention language once PITR/schedules are chosen.
5. Confirm AI subprocessor disclosures (OpenRouter / Google Gemini) and zero-retention claims before enabling footage AI.
6. Confirm under-13 / guardian email controller model (SEC-17) and self-declared age (SEC-12).
7. Confirm EU representative / DPO necessity for intended markets.
8. Confirm website privacy/support pages are counsel-ready (remove placeholders).

---

## 8. Missing owner-supplied facts

| Fact | Why needed |
|---|---|
| Markets / storefronts at launch | Transfer / representative |
| Whether footage AI will be offered in first public version | Provider review urgency |
| Chosen backup retention (days) | Policy text |
| Sentry retention setting | Diagnostics disclosure |
| Whether any additional analytics will be added | Tracking / ATT |
| Counsel identity and engagement letter | Close LEGAL markers |

---

## 9. What engineering will **not** do without authorization

- Contact counsel or transmit user data / footage.
- Claim “counsel approved.”
- Set `AI_FOOTAGE_PROCESSING_APPROVED=true`.
- Change production privacy copy on live hosting without deploy approval.
