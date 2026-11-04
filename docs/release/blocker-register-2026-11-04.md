# PitchProof 5.3 verified blocker register

**Verified:** 2026-11-04 engine/cards engineering + handoff refresh  
**Branch:** `release/pitchproof-5-3-candidate`  
**Full SHA:** `3c9f9835365d0a1bf1637dc7721947e426a85cc2` (prior docs tip `6d1266c` **superseded** for shipping)  
**Pinned GPU baseline:** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor of HEAD)  
**Remote:** `git@github.com-CapalotDaGreat/ScoutX.git` — **no upstream**  
**productionApproval:** false  

**Handoff:** `submission-handoff-2026-11-04.md` — **READY AFTER SPECIFIC NAMED EXTERNAL ACTIONS**.  
**Engineering:** `engine-cards-progress-2026-11-04.md` (E default ON; export privacy; coaching sufficiency; report corrections).  
**App Check live (rechecked):** providers **not configured**; DeviceCheck **No**; Enforce **Off**.  

**Classification key**

| Class | Meaning |
|---|---|
| **SUBMISSION** | Confirmed or strongly tied to App Store / Apple submission readiness (official Apple sources cited) |
| **OPS_SAFE** | Product safety / operational release gate (not an Apple App Review rule by itself) |
| **REC** | Recommendation |
| **DEFER** | Deferred feature; can be excluded from this release with honest product scope |

Apple sources used: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (updated 2026-10-16), [Complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/), [User privacy & data use](https://developer.apple.com/app-store/user-privacy-and-data-use/), [Third-party SDK / privacy manifests](https://developer.apple.com/support/third-party-SDK-requirements/), [NSPrivacyTracking](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacytracking). Firebase App Check is **not** an App Store mandate; it is a backend integrity control ([Firebase App Attest provider](https://firebase.google.com/docs/app-check/ios/app-attest-provider)).

Prior fixes verified present (do not reopen without new evidence):

- C default ON: `OCR_CONSULTED_ONLY` default `"1"` (`6ebdd5c`)
- E default ON: `OCR_CACHE_PROVENANCE` default `"1"` (engine/cards pass; opt-out `=0`)
- Checklist model `google/gemini-2.5-flash`; entitlement product-ID wording (`0ebfbd8`)
- D still not promoted; A/B still off

---

## Register

| ID | Item | Class | User / release impact | Current evidence | Acceptance criterion | Available local work | Required external action | Owner | Status | Last verified |
|---|---|---|---|---|---|---|---|---|---|---|
| B-01 | Firebase App Check registration (App Attest + DeviceCheck) | **OPS_SAFE** (not Apple mandate) | Callables enforce App Check in code; unconfigured providers → real-device callable failures (Guideline 2.1 risk) | **Live CLI 2026-11-04:** `appcheck:apps:list` → providers **not configured**; DeviceCheck **No**; product Enforce **Off** for Firestore/Storage/Auth/…; debug tokens none; callable enforce still on in source | Register App Attest+DeviceCheck; metrics from RC TestFlight; decide product Enforce | Console + DeviceCheck `.p8`; see `reauth-verification-2026-11-04.md` | Operator | OPEN | 2026-11-04 reauth |
| B-02 | Firestore / Storage / Auth backups + restore drill | **OPS_SAFE** | Data loss / inability to recover; also interacts with deletion promises | `docs/security/backups.md` still `BACKUP_CONFIGURATION_REQUIRED`; no restore evidence | PITR or schedules on; soft-delete/versioning policy set; isolated restore test recorded; deletions re-applied | Runbook + `scripts/reapply-deletions-after-restore.mjs` (dry-run) | GCP/Firebase console; **approval** before billable backup/PITR or restore DB | Operator | OPEN | 2026-11-04 |
| B-03 | Counsel / privacy / ASC nutrition labels | **SUBMISSION** (accurate privacy answers + policy) + legal | Incorrect privacy answers / policy → App Review rejection or legal risk | Manifest `NSPrivacyTracking: false`; labels matrix; LEGAL_REVIEW_REQUIRED markers; website placeholders | Counsel sign-off or owner records counsel decision; ASC answers match manifests; website placeholders cleared | Counsel packet prepared | Counsel review; owner facts | Counsel + Owner | OPEN | 2026-11-04 |
| B-04 | Owner acceptance SEC-10–14, 17–18 | **OPS_SAFE** | Release gate NOT VALIDATED until decisions recorded | `owner-acceptance.md` all `_pending_` | Each row Accept / Mitigate / Block with name+date | Packet of findings for owner | Owner decisions only | Owner | OPEN | 2026-11-04 |
| B-05 | Real-device / TestFlight / sandbox IAP | **SUBMISSION** (Guideline 2.1 functional review; IAP testing) | Crashes, broken purchases, incomplete review → rejection | EAS auth OK; latest finished prod IPA **1.0.0 (4)** @ commit `6679226` (**86 commits behind** tip) — **not applicable** to RC; protocol blank; ~60 NOT VALIDATED | Protocol on physical device for **current** HEAD build | Need **new** EAS production build of tip (approval) | Operator | OPEN | 2026-11-04 reauth |
| B-06 | Independent review of candidate D | **OPS_SAFE** / identity safety | Appearance-only LIKELY can false-attribute; promoting D without review is forbidden | D not promoted; packet v2 + private mapping exist; **PENDING** reviewer | Stage-1 answers + stage-2 corrections from independent human; promotion decision recorded | Brief + packet paths ready; do **not** promote | Independent reviewer + coordinator | Reviewer / Owner | OPEN | 2026-11-04 |
| B-07 | GPU / CUDA accuracy gap | **DEFER** for App Store if CV worker stays off | Continuous CV tracking not shipping; gap blocks **CV worker productionApproval**, not still-frame Passport release | `APPROVED_CV_WORKER=null`; `productionApproval=false`; baseline `51d41c9…` preserved | Either approved GPU session vs baseline, **or** explicit CPU-only / no-CV release scope accepted | CPU-only proposal written | Optional: approve GPU VM (billable) | Owner | OPEN / DEFER | 2026-11-04 |
| B-08 | AI footage processing approval | **OPS_SAFE** / **DEFER** if footage AI not offered | Uploads/analysis refuse until flag; offering AI without review is a privacy risk | Code gate; empty env → false | Provider privacy review documented; then env `true` **only if** feature offered | Counsel/AI section in packet | Provider review + secret/env (needs approval) | Owner | OPEN / DEFER | 2026-11-04 |
| B-09 | Continuous CV worker approval | **DEFER** | Tracking unavailable in product; honest | `cvApproval.generated.ts` null; no `approval.json` | Evaluation + `approval.json` + deploy under separate auth | Keep fail-closed | Explicit deploy/eval approval later | Owner | DEFER | 2026-11-04 |
| B-10 | RevenueCat webhook Authorization header + test event | **OPS_SAFE** (entitlements sync) | Server entitlements may not update from store events | Historical docs claim webhook exists; live test **not** revalidated | Dashboard Authorization set; test event → 200 | Steps in operator actions | RevenueCat dashboard + Firebase secret (do not paste secret in chat) | Operator | OPEN | 2026-11-04 |
| B-11 | EAS production env vars | **SUBMISSION** build prerequisite | Missing vars → production build policy / archive fail | **EAS production names verified** (all 8 gate-required names present); local shell still EXTERNAL (expected) | New production build of **current tip** succeeds | Queue build (approval) | Operator | PARTIAL — env OK; tip archive missing | 2026-11-04 reauth |
| B-12 | ASC metadata (screenshots, demo account, agreements) | **SUBMISSION** | Incomplete App Review info → rejection ([complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/)) | Templates in `app-review-notes.md`; live ASC not validated | ASC App Review Information complete | Notes template ready | ASC console + demo account | Operator | OPEN | 2026-11-04 |
| B-13 | Release with D still off (appearance-only LIKELY) | **OPS_SAFE** honesty | False attribution possible when LIKELY from appearance alone | Default `APPEARANCE_ONLY_LIKELY=true`; D = env `0` | Owner accepts residual risk **or** waits for D review then promotes; UI must not treat LIKELY as confirmed track | Risk statement in D brief + dossier | Owner decision | Owner | DECISION NEEDED | 2026-11-04 |
| B-14 | Xcode Privacy Report merge (3rd-party SDKs) | **SUBMISSION** (manifest accuracy) | Nutrition labels must reflect SDK data ([privacy manifests](https://developer.apple.com/app-store/user-privacy-and-data-use/)) | App-level manifest only; merge NOT VALIDATED | Privacy Report from signed archive reviewed vs ASC answers | Documented in counsel packet | Signed archive on Mac/EAS artifact | Operator | OPEN | 2026-11-04 |
| B-15 | Branch not on remote | **REC** | Collaboration / CI | No upstream | Push when authorized | n/a | `git push -u` when approved | Operator | OPEN | 2026-11-04 |

---

## Dependencies (parallelism)

```
B-03 (counsel) ──┬── B-02 backup retention language
                 └── B-08 AI footage (if offering)
B-01 App Check ──► B-05 device (release App Check behavior)
B-11 EAS env ──► B-05 TestFlight build ──► B-12 ASC submit prep
B-06 D review ──► optional D promotion (separate decision); B-13 can accept D-off
B-07 GPU ──► only if enabling CV worker (B-09); else DEFER
B-04 owner SEC ──► release gate NOT VALIDATED rows
B-02 backups ──► restore drill (needs approval for billable/new DB)
```

Work in parallel: counsel packet + owner SEC decisions + App Check console + EAS env verify + D reviewer assignment + TestFlight build request.
