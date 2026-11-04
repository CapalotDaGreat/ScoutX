# External blocker verification pass (2026-11-04 evening)

**Branch:** `release/pitchproof-5-3-candidate`  
**Full SHA:** `86b59bae2ab113ccfbde035763a1d31719d52a48`  
**Note:** User-reported HEAD `4cebc63` is an ancestor; pricing-quota commit `86b59ba` is current.  
**Working tree:** clean  
**Remote:** `git@github.com-CapalotDaGreat/ScoutX.git` — **no upstream** for this branch  
**GPU baseline:** `51d41c9…` still ancestor  
**productionApproval:** false · D not promoted · CV worker null · AI footage flag false  

This pass **re-verified** prior local completions and **did not** re-do them. It does **not** prove console/deployed behavior.

Canonical pack (do not duplicate): `blocker-register-2026-11-04.md`, `operator-actions-2026-11-04.md`, `counsel-packet-2026-11-04.md`, `real-device-protocol-5-3.md`, `d-review-operator-brief-2026-11-04.md`, `scripts/reapply-deletions-after-restore.mjs`.

---

## Re-verified local facts (source)

| Claim | Evidence (this pass) |
|---|---|
| `APP_CHECK.md` aligned; debug flag = build gate only; rules ≠ product enforcement | `docs/APP_CHECK.md` L3, L39, L78 |
| Privacy camera/mic / Audio / messaging wording | `docs/compliance/app-store-privacy-labels.md` |
| `shouldEnforceAppCheck` tests | `tests/unit/releaseBuild.test.ts` describe `callable App Check enforcement` |
| Unit suite **721** pass | `npm run test:unit` → `# tests 721` `# pass 721` `# fail 0` |
| Restore script defaults dry-run; refuses `(default)` | `scripts/reapply-deletions-after-restore.mjs`; exit 2 without `--project` |
| Callable enforce default on; emu off | `shouldEnforceAppCheck({})===true`; emu `false` |
| AI footage / CV fail-closed | `isFootageProcessingApproved({})===false`; `APPROVED_CV_WORKER===null` |
| C ON / D not promoted | `OCR_CONSULTED_ONLY` default `"1"`; `APPEARANCE_ONLY_LIKELY` default `"1"` |
| D packet v2 | 25 items; `privateMappingSha256` matches file SHA-256 of `mapping_v2.json` |

## Still **not** verified (need your consoles / people / devices)

| Area | Unknown because |
|---|---|
| App Check Apps registration + API metrics | Firebase Console not readable (`projects:list` / MCP auth unavailable on this host) |
| Firestore/Storage product enforcement toggles | Console only ([enable enforcement](https://firebase.google.com/docs/app-check/enable-enforcement)) |
| PITR / backups / restore timing | `BACKUP_CONFIGURATION_REQUIRED`; no billable enablement |
| Counsel sign-off | LEGAL_REVIEW_REQUIRED markers remain |
| Physical device / TestFlight | Windows; no Xcode; EAS whoami previously failed TLS |
| Independent D answers | Packet PENDING; no reviewer |

**IDs to use everywhere:** Firebase `scoutx-230b0` · iOS `com.scoutx.app` · Team `833CYAZ8XT` · ASC `6820059284` · Host `pitchproof.online`

---

## 1. App Check — exact steps

**Blocks:** safe TestFlight / App Review (Guideline **2.1** if callables reject) — **not** an ASC binary entitlement rule.  
Sources: [App Attest setup](https://firebase.google.com/docs/app-check/ios/app-attest-provider), [Monitor metrics](https://firebase.google.com/docs/app-check/monitor-metrics), [Enable enforcement](https://firebase.google.com/docs/app-check/enable-enforcement), [Functions enforceAppCheck](https://firebase.google.com/docs/app-check/cloud-functions).

### A. Register (low risk — do this first)
1. [Firebase Console](https://console.firebase.google.com/) → **scoutx-230b0** → **App Check** → **Apps**.
2. Open iOS app **com.scoutx.app**.
3. Register **App Attest** (Team ID **833CYAZ8XT**). TTL default 1h OK.
4. Register **DeviceCheck** with a DeviceCheck-capable `.p8` (not ASC API / not IAP key).
5. Apple Developer → Identifiers → `com.scoutx.app` → App Attest capability present; refresh profile if needed.

**Evidence:** screenshot Apps tab showing both providers; no tokens in chat.

### B. Metrics before product enforcement
1. Install a **production-profile** TestFlight build at commit **`86b59ba…`** (or later on this branch).
2. Sign in; exercise 2–3 authenticated callables (e.g. usage summary / consent).
3. App Check → **APIs** → review Cloud Functions / Firestore / Storage metrics ([monitor](https://firebase.google.com/docs/app-check/monitor-metrics)): prefer almost all **Verified**.

**Evidence:** metrics screenshots + EAS build ID + device OS.

### C. Staged validation (device)
| Case | Expected |
|---|---|
| Valid release client | Callables succeed; no App Check failed-precondition storm |
| Debug/Expo Go | Not a release proof; debug provider excluded in production |
| After product Enforce ON without tokens | Requests rejected ([enforcement](https://firebase.google.com/docs/app-check/enable-enforcement)); user sees auth/backend errors — have recovery copy |
| Token refresh | Leave app ~30+ min; resume; still works (client auto-refresh enabled in code) |

### D. Product enforcement — **APPROVAL REQUIRED**
**Impact:** Unverified clients lose Firestore/Storage (and Auth if enforced) access within ~15 minutes.

1. Only after metrics look healthy.
2. Console → App Check → **APIs** → Enforce per product (start with none → Functions already code-enforced via `enforceAppCheck`).
3. **Rollback:** same screen → turn Enforce **Off**.

Callable code already defaults `enforceAppCheck: true` when deployed; do **not** set `ENFORCE_APP_CHECK=false` to “fix” registration gaps without a separate deploy approval.

---

## 2. Restore testing — exact plan

**Blocks:** OPS_SAFE / release-gate EXTERNAL — not Apple submission by itself.  
Marker: `docs/security/backups.md` → `BACKUP_CONFIGURATION_REQUIRED`.  
Script: dry-run default; refuses `(default)` without `--allow-default-database`.

### Non-mutating checks done
- Script syntax / CLI guards verified.
- No backup listing obtainable without your GCP login.

### Isolated restore plan (**APPROVAL REQUIRED** — billable)

| Field | Value |
|---|---|
| Project | `scoutx-230b0` |
| Source | Firestore `(default)` PITR or scheduled backup (**must exist first**) |
| Destination | **New** database id e.g. `restore-drill-YYYYMMDD` — never overwrite `(default)` |
| Storage | Soft-delete restore of **one** non-sensitive object in a test prefix if soft-delete enabled |
| Cost | PITR storage + restore/clone $/GiB per [Firestore pricing](https://cloud.google.com/firestore/pricing) — confirm live; estimate ≠ cap |

**Commands (after PITR/backup exists and approval):**
```powershell
# 1) Restore/clone into NEW database via Console Disaster Recovery OR gcloud firestore databases restore
# 2) Dry-run deletion re-apply (ADC / gcloud auth application-default login)
node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id restore-drill-YYYYMMDD --dry-run
# 3) Only on clone, after reviewing counts:
node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id restore-drill-YYYYMMDD --execute
# 4) Delete restore-drill database when done
```

**Evidence that establishes recovery (required to clear marker):**
1. PITR/schedule screenshot or `gcloud` describe output.
2. Restore DB id + wall-clock duration.
3. Doc-count comparison table (users / matchAnalysisJobs sample).
4. Dry-run JSON: `matchedDeletionReceipts` count.
5. Optional execute: remaining=0 for a receipt-matched subjectHash prefix.
6. One Storage soft-delete undelete checksum.
7. Paste summary into `docs/security/backups.md` then remove `BACKUP_CONFIGURATION_REQUIRED`.

A script dry-run alone is **not** a successful recovery test.

---

## 3. Counsel review

**Blocks:** SUBMISSION (accurate privacy answers / policy).  
**Send:** `docs/release/counsel-packet-2026-11-04.md` + `legal/documents/*` + `docs/compliance/app-store-privacy-labels.md` + `docs/privacy/data-inventory.md` + `docs/privacy/retention-matrix.md` + `docs/privacy/processor-register.md`.  
**Do not send:** match footage, user exports, secrets.

**Owner facts to supply:** launch markets; whether footage AI ships day-1; backup retention days if enabling PITR; Sentry retention; SMTP provider; UID/VAT/DPO if any.

**Ask counsel to return:** yes/no on each question in counsel packet §7; ASC Device ID for push token; Audio category for video-with-audio; legal bases; retention periods.

**Record approval in:** `docs/release/owner-acceptance.md` (or counsel email filed) + clear LEGAL_REVIEW_REQUIRED only when counsel/owner names a decision — do not invent it.

---

## 4. Real-device release testing

**Blocks:** SUBMISSION (Guideline 2.1; IAP).  
Protocol: `docs/release/real-device-protocol-5-3.md`.  
Host: Windows — **no** local Xcode archive this session.

### Build (**APPROVAL REQUIRED** to queue EAS)
```powershell
git checkout release/pitchproof-5-3-candidate
git rev-parse HEAD   # expect 86b59ba… or newer intentional tip
npx eas-cli login
npx eas-cli env:list --environment production   # return NAMES only
npx eas-cli build -p ios --profile production
# separate approval:
npx eas-cli submit -p ios --latest
```

Run protocol sections A–H on a **physical** iPhone. Log: device model, iOS, EAS build #, commit SHA, date, pass/fail.

Simulator / Expo Go ≠ device evidence. App Check cases in protocol §G depend on §1 registration.

---

## 5. Independent D review

**Blocks:** D promotion / identity honesty (B-06); not sole ASC stopper if D stays off and copy is honest (B-13).  
**Do not promote D.**

| Give reviewer | Path |
|---|---|
| README v2 + build cmd | `workers/football-cv/bench/results/5.3/identity-review-packet-20261103/README.md` |
| Items | `.../items_v2.json` (25 items R01–R25) |
| Video | Local `IMG_4809_proxy_10fps.exact.mp4` only |
| Brief | `docs/release/d-review-operator-brief-2026-11-04.md` |

**Withhold until stage-1 committed:** `.../identity-review-private-20261104/` (mapping SHA verified this pass).

**Suitable reviewer:** has not read PitchProof identity reports/scores/traces; not packet author; not this agent.

**Decision:** see D brief §5–6. Owner still needs REL-D-OFF or wait-for-review in `owner-acceptance.md`.

---

## Approval requests (not authorization)

| ID | Ask |
|---|---|
| A1 | Queue EAS iOS production build (+ later submit TestFlight) for commit `86b59ba…` |
| A2 | Enable Firestore PITR/schedules / Storage soft-delete (billable) |
| A3 | Run isolated restore into new DB id + optional `--execute` on clone only |
| A4 | Turn on App Check **product** Enforce for Firestore/Storage (after metrics) |
| A5 | Contact counsel with packet files listed above |
| A6 | Push branch upstream / ASC submit / set AI or CV flags — separately, later |

---

## Shortest sequence for you

1. Firebase login / Console: **register App Attest + DeviceCheck** for `com.scoutx.app` → return screenshots.  
2. `eas login` + `eas env:list --environment production` (names only) → approve **A1** build.  
3. Install TestFlight → run `real-device-protocol-5-3.md` (incl. App Check) → return checklist.  
4. Fill `owner-acceptance.md` (SEC-10–14, 17–18 + REL-D-OFF / REL-CPU).  
5. Send counsel packet files (§3) → record reply.  
6. Assign independent D reviewer (§5) with local packet only.  
7. Approve **A2/A3** when ready for backups; only then clear backup marker with evidence.  
8. Approve **A4** only after green App Check metrics.

## Readiness

**Not ready** for App Store submission.  
**Ready for submission preparation** once steps 1–5 produce evidence.  
No deploy / ASC submit / D promotion / production enforce / billable restore was performed in this pass.
