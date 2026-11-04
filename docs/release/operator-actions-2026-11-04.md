# Exact operator actions (credentials / consoles)

**Project:** Firebase `scoutx-230b0` · Bundle `com.scoutx.app` · ASC app `6820059284` · Team `833CYAZ8XT` · Host `pitchproof.online`  
**Do not paste secrets, `.p8` keys, or API tokens into chat.**  
**Do not enable billable features or production enforcement flips without reading the impact notes.**

This file is **instructions**. Items marked **APPROVAL REQUIRED** must not be treated as authorization to execute production changes.

---

## 1. App Check registration (B-01) — OPS_SAFE

### Why still blocked
Source has App Attest entitlement + production provider + callable `enforceAppCheck` default **on**. Console registration and live metrics were **not** verified (`firebase projects:list` failed this session; EAS whoami failed TLS; Firebase MCP auth timed out).

**Not an App Store rule** by itself. Firebase docs: tokens are sent after client setup; **product-level** Firestore/Storage enforcement is a separate console step ([App Check + App Attest](https://firebase.google.com/docs/app-check/ios/app-attest-provider)).

**Compatibility warning:** Deployed callables use `enforceAppCheck: true` by default. If App Attest/DeviceCheck are **not** registered in the Firebase console, **production/TestFlight devices can fail every protected callable** (looks like App Review Guideline **2.1** “app doesn’t work”, even though App Check itself is not an Apple mandate). Register providers and verify metrics **before** relying on TestFlight for review.

### Prerequisites
- Firebase Console access to `scoutx-230b0`
- Apple Developer access for DeviceCheck key (if registering DeviceCheck as fallback)
- A **TestFlight or device** build that initializes App Check (production path uses `appAttestWithDeviceCheckFallback`)

### Steps — register (low risk)
1. Open [Firebase Console](https://console.firebase.google.com/) → project **scoutx-230b0**.
2. **Build** → **App Check** (or **Security** → **App Check**).
3. **Apps** tab → select iOS app **com.scoutx.app**.
4. Register provider **App Attest**. Keep TTL default (1 hour) unless you have a reason to change it.
5. (Recommended for older iOS) Also register **DeviceCheck**:
   - Apple Developer → **Keys** → create key with **DeviceCheck** enabled (not the ASC API key, not IAP key).
   - Upload/register that key in the Firebase App Check DeviceCheck provider UI.
6. **Do not** enable enforcement on Firestore/Storage/Functions yet if metrics are empty.

### Expected result
- App shows App Attest (and DeviceCheck) as registered.
- After installing a production-signed build: App Check **metrics** show requests with valid tokens for Cloud Functions (and Firestore/Storage if used from client).

### Evidence to return (no secrets)
- Screenshot of App Check Apps tab (providers registered).
- Screenshot of metrics after one TestFlight session (valid vs invalid counts).
- Note: build number / EAS ID used.

### Enforcement flip — **APPROVAL REQUIRED**
**Impact:** Once enforcement is ON for Cloud Functions / Firestore / Storage, clients **without** valid App Check tokens fail. Old TestFlight builds without App Check, simulators, and scripts break.

**Before flipping:**
1. Confirm metrics ≈ all legitimate traffic has valid tokens.
2. Confirm production EAS build uses App Attest (not debug).
3. Have rollback: Firebase Console → App Check → Enforcement → **Off** for the affected product.

**Rollout suggestion:** Monitor 24–48h → enable Functions first → then Firestore/Storage.

### Rollback
Turn enforcement **Off** in the same App Check console screens. Client entitlement can stay.

### Blocks?
- **Submission:** No (not an Apple requirement).
- **Safe operation:** Yes for public backend hardening; callables already *request* App Check when deployed with default env.

---

## 2. Backups + isolated restore (B-02) — OPS_SAFE · **billable APPROVAL**

### Why still blocked
Nothing in-repo enables backups; marker `BACKUP_CONFIGURATION_REQUIRED` remains.

### Prerequisites
- GCP project linked to Firebase `scoutx-230b0`, region **europe-west6** (Zurich) per historical docs
- Billing account (Blaze) — **enabling PITR/schedules can incur cost**

### Pricing note (official; not a billing cap)
Source: [Firestore pricing](https://cloud.google.com/firestore/pricing) (checked 2026-11-04). For Zurich (`europe-west6`) list prices include PITR data storage (no free tier) and restore/clone operations charged per GiB. Confirm current numbers in console before enable — estimates are not caps. See also [PITR overview](https://firebase.google.com/docs/firestore/pitr).

### Steps — configure (APPROVAL REQUIRED before enable)
1. GCP Console → **Firestore** → database `(default)` → **Disaster recovery** / **Backups**.
2. Enable **Point-in-time recovery** (7-day window) **or** create a **backup schedule** (`gcloud firestore backups schedules create` — exact flags per current gcloud docs).
3. Cloud Storage bucket `scoutx-230b0.firebasestorage.app` (confirm name in console):
   - Soft delete retention **or** object versioning.
   - Prefer **not** retaining disposable quarantine/source match footage longer than product lifecycle (see retention matrix). Exclude analytics access from backup buckets.
4. Optional: periodic `firebase auth:export` to a restricted bucket (decide retention with counsel).

### Isolated restore test (APPROVAL REQUIRED — may create a **new** database)
1. Restore PITR/backup into a **new** Firestore database ID (never overwrite `(default)` for a drill).
2. Dry-run deletions re-apply:
   ```powershell
   node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id <RESTORE_DB_ID> --dry-run
   ```
3. If dry-run looks correct and you authorize write on the **restore** DB only:
   ```powershell
   node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id <RESTORE_DB_ID> --execute
   ```
4. Spot-check: document counts; one Storage soft-delete restore; `verifyUserDataDeleted` for a receipt-matched uid.
5. Delete the restore database when done (cost control).

### Evidence to return
- Date, operator, PITR/schedule settings (no keys).
- Restore DB ID, duration observed, limitations.
- Dry-run / execute log summary (uids hashed or counted, not emails).
- Then update `docs/security/backups.md` to remove `BACKUP_CONFIGURATION_REQUIRED` **only after** evidence is pasted there.

### Blocks?
- **Submission:** No Apple rule.
- **Safe operation:** Yes for production data stewardship; release gate EXTERNAL.

---

## 3. Firebase / EAS CLI auth (this machine)

### Observed (updated 2026-11-04 reauth pass)
- Root cause of prior Firebase/EAS failures: **AVG HTTPS scanning** MITM; Node default CA failed (`unable to verify the first certificate`). Fix: `NODE_OPTIONS=--use-system-ca` (TLS verification **on**). See `reauth-verification-2026-11-04.md`.
- Firebase: logged in; `projects:list` includes **scoutx-230b0 (current)**; iOS app `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1`.
- EAS: authenticated; project `@boddibossi/scoutx`.
- Host: Windows (no Xcode).
- `functions/.env.scoutx-230b0` **absent** locally (**expected** for AI-off; do not create placeholders).
- `docs/video/evaluation/approval.json` **absent** (**expected** for no-CV-worker; keeps `APPROVED_CV_WORKER=null`).

### Steps (new shells)
```powershell
$env:NODE_OPTIONS='--use-system-ca'   # or: .\.local\use-system-ca.ps1
npx firebase-tools projects:list
npx firebase-tools experiments:enable appcheckadmin   # once per machine; enables providers/services CLI
npx firebase-tools appcheck:providers:list --project scoutx-230b0 --app 1:141939766260:ios:c23d6b9fe65e8a65bd3fa1
npx eas-cli whoami
npx eas-cli env:list --environment production   # return NAMES only
```

---

## 4. RevenueCat webhook auth (B-10) — OPS_SAFE

### Why
Server entitlement sync needs Authorization header; RevenueCat API cannot set it.

### Steps
1. RevenueCat → Project (historical: `projda6be3c6`) → **Integrations** → **Webhooks**.
2. Endpoint (historical): `https://europe-west6-scoutx-230b0.cloudfunctions.net/revenueCatWebhook`
3. Authorization: `Bearer ` + value of Firebase secret `REVENUECAT_WEBHOOK_SECRET` (copy from Secret Manager / prior password manager — **do not paste into chat**).
4. Send **test event**; expect **HTTP 200**.
5. Evidence: screenshot of 200 response / webhook delivery log (redact secret).

### Blocks?
Entitlement sync OPS_SAFE. IAP UI may still work client-side via StoreKit/RevenueCat SDK.

---

## 5. EAS production env + TestFlight build (B-11 / B-05) — **APPROVAL to upload**

### Verify env (read-only)
```powershell
npx eas-cli env:list --environment production
```
Required names: six `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`), `GOOGLE_SERVICES_PLIST`, App Check enabled flags per `eas.json`.

### Build (APPROVAL REQUIRED to queue cloud build)
```powershell
git checkout release/pitchproof-5-3-candidate
git rev-parse HEAD
npx eas-cli build -p ios --profile production --non-interactive
```
Then submit to TestFlight only with separate approval:
```powershell
npx eas-cli submit -p ios --latest
```

### Evidence
- Commit SHA, EAS build ID, TestFlight processing state, device OS used for install.

---

## 6. App Check DeviceCheck key note

DeviceCheck requires its **own** `.p8` with DeviceCheck capability. ASC API key and IAP key do **not** work ([prior release checklist](app-store-submission-checklist.md)). Do not share `.p8` contents in chat.

---

## 7. Owner SEC decisions (B-04)

Open `docs/release/owner-acceptance.md`. For each SEC-10–14, 17–18: Accept / Mitigate / Block + name + date.  
Until done, release gate keeps **NOT VALIDATED**.

---

## 8. Counsel (B-03)

Provide `docs/release/counsel-packet-2026-11-04.md` + linked policy drafts under `legal/documents/`.  
**Do not** email user footage. Ask counsel only the listed questions.

---

## 9. Independent D review (B-06)

See `docs/release/d-review-operator-brief-2026-11-04.md`. Keep footage local.

---

## 10. AI footage flag / CV worker — DEFER unless offering

Do **not** set `AI_FOOTAGE_PROCESSING_APPROVED=true` or `CV_WORKER_APPROVED=true` without documented reviews and explicit approval. Default product scope: still-frame / limited modes; continuous tracking unavailable.

---

## 11. GPU session — APPROVAL REQUIRED (billable)

Only if enabling CV worker. Template in `docs/release/cpu-only-release-proposal-5-3.md` §GPU approval request. Baseline commit must remain `51d41c9…` for comparison.
