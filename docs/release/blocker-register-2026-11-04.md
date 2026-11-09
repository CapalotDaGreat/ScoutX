# PitchProof 5.3 verified blocker register

**Verified:** 2026-11-04 share-card preview + coaching scenarios + card labeling  
**Branch:** `release/pitchproof-5-3-candidate`  
**Full SHA (app/scout RC):** `1eebf5c009e88d9ac5adbc804abd5ac459d81cd0`  
**Engine tip (DETOUR_SPLIT):** `cd8ba966b3bc34751a06391f16952dcb4e2a1b1e`  
**Coaching tip:** `45a1ee5c789851ccb7c677a91d6b919be6be0edc`  
**Prior product RC (superseded):** `47e49cf037671d964180404ee0cfd6212ed76006`  
**Prior docs tip (superseded):** `83c760097e6bcbb8cadc1be43a745a14a9e798d3`  
**Pinned GPU baseline:** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor of HEAD)  
**Remote:** `git@github.com-CapalotDaGreat/ScoutX.git` — **no upstream**  
**productionApproval:** false  

**Handoff:** `submission-handoff-2026-11-04.md` — **READY AFTER SPECIFIC NAMED EXTERNAL ACTIONS**.  
**Engineering:** `engine-cards-progress-2026-11-04.md` (share-card field select + preview; coaching scenarios; evidence captions; E4 left xfail).  
**App Check live (rechecked 2026-11-04):** providers **not configured**; product Enforce **Off**.  

**Classification key**

| Class | Meaning |
|---|---|
| **SUBMISSION** | Confirmed or strongly tied to App Store / Apple submission readiness (official Apple sources cited) |
| **OPS_SAFE** | Product safety / operational release gate (not an Apple App Review rule by itself) |
| **REC** | Recommendation |
| **DEFER** | Deferred feature; can be excluded from this release with honest product scope |

Apple sources used: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (updated 2026-10-16), [Complete review](https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/), [User privacy & data use](https://developer.apple.com/app-store/user-privacy-and-data-use/), [Third-party SDK / privacy manifests](https://developer.apple.com/support/third-party-SDK-requirements/), [NSPrivacyTracking](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacytracking). Firebase App Check is **not** an App Store mandate; it is a backend integrity control ([Firebase App Attest provider](https://firebase.google.com/docs/app-check/ios/app-attest-provider)).

Prior fixes verified present (do not reopen without new evidence):

- C default ON: `OCR_CONSULTED_ONLY` default `"1"`
- E code default is `"1"`, which was **not** approved. Contracts say needs revision, off. Do not treat the default as accepted. Revert it to off after the in-flight full-match candidate has loaded the current tracker.
- Checklist model `google/gemini-2.5-flash`; entitlement product-ID wording
- D still not promoted; A/B still off
- E4 known wrong-player xfail retained (strict)

---

## Register

| ID | Item | Class | User / release impact | Current evidence | Acceptance criterion | Available local work | Required external action | Owner | Status | Last verified |
|---|---|---|---|---|---|---|---|---|---|---|
| B-01 | Firebase App Check registration (App Attest + DeviceCheck) | **OPS_SAFE** (not Apple mandate) | Callables enforce App Check in code; unconfigured providers → real-device callable failures (Guideline 2.1 risk) | **Live CLI 2026-11-04:** `appcheck:apps:list` → providers **not configured**; Enforce **Off** | Register App Attest+DeviceCheck; metrics from RC TestFlight; decide product Enforce | Console steps in operator-actions | Operator register + screenshots | Operator | OPEN | 2026-11-04 tip |
| B-02 | Firestore / Storage / Auth backups + restore drill | **OPS_SAFE** | Data loss / inability to recover; also interacts with deletion promises | `docs/security/backups.md` still `BACKUP_CONFIGURATION_REQUIRED`; script dry-run ready; **no** restore executed | PITR or schedules on; isolated restore test recorded; deletions re-applied | `scripts/reapply-deletions-after-restore.mjs` | GCP/Firebase; **approval** before billable PITR/restore DB | Operator | OPEN | 2026-11-04 |
| B-03 | Counsel / privacy / ASC nutrition labels | **SUBMISSION** + legal | Incorrect privacy answers / policy → rejection or legal risk | LEGAL_REVIEW_REQUIRED markers; export field-select/preview is material local change | Counsel sign-off or owner records counsel decision | Counsel packet + note share-card omit controls | Counsel review; owner facts | Counsel + Owner | OPEN | 2026-11-04 |
| B-04 | Owner acceptance SEC-10–14, 17–18 | **OPS_SAFE** | Release gate NOT VALIDATED until decisions recorded | `owner-acceptance.md` all `_pending_`; template `owner-decisions-template-5-3.md` | Each row Accept / Mitigate / Block with name+date | Template prepared | Owner decisions only | Owner | OPEN | 2026-11-04 |
| B-05 | Real-device / TestFlight / sandbox IAP | **SUBMISSION** | Crashes, broken purchases → rejection | Latest finished prod IPA **1.0.0 (4)** @ `6679226` — **not applicable** to tip | Protocol on physical device for **current** HEAD build | Need **new** EAS production build (approval A1) | Operator | OPEN | 2026-11-04 |
| B-06 | Independent review of candidate D | **OPS_SAFE** / identity safety | Appearance-only LIKELY can false-attribute | D not promoted; **PENDING** reviewer | Stage-1/2 independent human; promotion decision | Brief ready; do **not** promote | Independent reviewer | Reviewer / Owner | OPEN | 2026-11-04 |
| B-07 | GPU / CUDA accuracy gap | **DEFER** if CV worker stays off | Continuous CV not shipping | `APPROVED_CV_WORKER=null`; baseline `51d41c9` preserved; 2026-11-07 L4 STOCKOUT; cold Linux CPU full-match complete; proposal `gpu-validation-proposal-2026-11-09.md` awaits APPROVAL (Part A `51d41c9`, Part B `0584c1c`) | GPU session **or** REL-CPU scope | Next L4 envelope drafted (west3→west6) | Optional GPU VM after new APPROVAL | Owner | OPEN / DEFER | 2026-11-09 |
| B-08 | AI footage processing approval | **DEFER** if AI not offered | Uploads refuse until flag | Code gate; empty env → false | Provider privacy review if offering | Counsel packet | Owner | OPEN / DEFER | 2026-11-04 |
| B-09 | Continuous CV worker approval | **DEFER** | Tracking unavailable; honest | `cvApproval` null | Separate eval + approval.json | Keep fail-closed | Owner | DEFER | 2026-11-04 |
| B-10 | RevenueCat webhook Authorization + test event | **OPS_SAFE** | Entitlements may not sync | Live test **not** revalidated | Dashboard Authorization; test event → 200 | Steps in operator-actions | RevenueCat + Firebase secret | Operator | OPEN | 2026-11-04 |
| B-11 | EAS production env vars | **SUBMISSION** build prerequisite | Missing vars → archive fail | EAS production **names** verified previously; tip archive missing | New production build of **current tip** succeeds | Queue build (A1) | Operator | PARTIAL | 2026-11-04 |
| B-12 | ASC metadata | **SUBMISSION** | Incomplete review info → rejection | Templates ready; live ASC not validated | ASC App Review Information complete | Notes template | ASC console | Operator | OPEN | 2026-11-04 |
| B-13 | Release with D still off | **OPS_SAFE** honesty | False attribution possible when LIKELY from appearance | Default appearance-only LIKELY on | Owner accepts residual risk **or** waits for D | Risk statement ready | Owner decision | Owner | DECISION NEEDED | 2026-11-04 |
| B-14 | Xcode Privacy Report merge | **SUBMISSION** | Nutrition labels must reflect SDKs | Merge NOT VALIDATED | Privacy Report from signed tip archive | Needs A1 archive | Operator | OPEN | 2026-11-04 |
| B-15 | Branch not on remote | **REC** | Collaboration / CI | No upstream | Push when authorized | n/a | `git push -u` when approved | Operator | OPEN | 2026-11-04 |

---

## Dependencies (parallelism)

```
B-03 (counsel) ──┬── B-02 backup retention language
                 └── B-08 AI footage (if offering)
B-01 App Check ──► B-05 device (release App Check behavior)
B-11 EAS env ──► B-05 TestFlight build ──► B-12 ASC submit prep
B-06 D review ──► optional D promotion; B-13 can accept D-off
B-07 GPU ──► only if enabling CV worker (B-09); else DEFER
B-04 owner SEC ──► release gate NOT VALIDATED rows
B-02 backups ──► restore drill (needs approval for billable/new DB)
```

Work in parallel: counsel packet + owner SEC decisions + App Check console + TestFlight build request.
