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
**App Check live (rechecked 2026-11-04):** providers **not configured**; product Enforce **Off**. Rechecked read-only 2026-11-12: no enforcement mode set for Firestore, Storage or Auth; DeviceCheck key not configured; 0 debug tokens; App Attest registration not provable via API (CLI 2026-11-04: not configured). Full matrix and remediation: `docs/release/app-check-behaviour-2026-11-12.md`.  

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
| B-16 | Redesign ("Touchline") native validation and evidence renewal | **SUBMISSION** when merged | Every 5.3 screenshot and device result predates the redesign; native layout, VoiceOver, Dynamic Type and on-device exports are unverified | Web only: complete browser passes at `f150d49` (65 passed, 2 opt-in skips, mobile and desktop), 763 unit, 263 rules, axe 0 critical/serious; see `docs/design/REDESIGN_LEDGER.md` sections 10 to 13 | `docs/design/REDESIGN_DEVICE_PROTOCOL.md` executed on a build of the merged commit; screenshots renewed; translation sheet reviewed | Protocol, review sheet and merge proposal prepared | Billed simulator or device build; a tester; native speakers | Owner / Operator | OPEN (added 2026-11-12) | 2026-11-12 |
| B-17 | Live backend behind the release source | **TESTFLIGHT** | 14 functions missing (current analysis flow, link import), 75 of 81 deployed functions outdated, Firestore and Storage rules older than release (live rules reject the release client's quiet-hours setting); deployed projection writes `analysisSampleCount: 0` | Read-only inventory 2026-11-12 against deployed source archives; `docs/release/backend-deploy-plan-2026-11-12.md` | 80-function scoped deploy plus rules from the approved release commit; smoke tests in the plan pass | Plan, function groups, live rules snapshot, preflight (incl. git-ignored `functions/.env.scoutx-230b0`) prepared | Owner runs the deploy after approval B | Owner | OPEN (updated 2026-11-12) | 2026-11-12 |
| B-18 | Scheduled `releaseExpiredSuspensions` fails every run | **OPS_SAFE** | Suspensions never expire automatically; 239 HTTP 500s in 45 days (missing composite index `accountRestrictions(state, until)`) | Cloud Logging 2026-11-12; live and repository index sets identical (38/38) | Index present and deployed; job returns 200 | One-line fix on local branch `fix/account-restrictions-index` @ `9986c4fd320332d1f694a8e943d6c2dc3b60de87` (not pushed); query, index fields, READY check and backlog (0 documents) verified 2026-11-12; included in the integration candidate; **live index created 2026-11-13 (requested 12:41 UTC, READY by 12:53 UTC)** (`CICAgNjpgYIK`); first job run after it pending | Review, merge, deploy indexes | Owner | OPEN (added 2026-11-12) | 2026-11-12 |
| B-19 | Firebase Authentication not configured in production | **TESTFLIGHT / SUBMISSION** | No build can start a guest session, register or sign in | Read-only, 2026-11-12: admin `config`, `defaultSupportedIdpConfigs/apple.com` and `google.com`, and `accounts:query` all answer 404 `CONFIGURATION_NOT_FOUND`; the client probe `accounts:lookup` with the app's public key answers 400 `CONFIGURATION_NOT_FOUND`. Ruled out: wrong project (iOS plist `PROJECT_ID scoutx-230b0`, bundle `com.scoutx.app`, sender `141939766260`; a non-existent control project answers `PROJECT_NOT_FOUND` instead), missing permission (`testIamPermissions` grants `firebaseauth.configs.get` and `firebaseauth.users.get`; a denial would be 403), API disabled (`identitytoolkit.googleapis.com` ENABLED), network (structured Google JSON errors over verified TLS). Conclusion: Authentication was never initialised, so no accounts exist; it is not a single disabled provider | Authentication initialised with **Anonymous** (the app starts every visitor in an anonymous guest session), **Email/Password** and **Sign in with Apple**; Google only if the build sets `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`/`_IOS_CLIENT_ID` (no profile in `eas.json` does; the button stays hidden otherwise); `accounts:lookup` then answers `INVALID_ID_TOKEN` | Steps prepared (action AUTH-1 in `approval-requests-2026-11-12.md`) | Console change by the owner | Owner | OPEN (added 2026-11-12) | 2026-11-12 |
| B-20 | Back did nothing on the first tap after a cold link (web; 3 of about 200 automated attempts, 1 of 60 earlier) | **SUBMISSION** (pre-existing in the release code) | A tap in a 40-80 ms window after a cold link was swallowed | Root cause established 2026-11-12 with frame-by-frame hit testing and a forced-phase reproduction: the session curtain lifted one commit before the restored user was applied, exposing the screen; the age/guardian gate's loading curtain (`youth-gate-loading`, z-30) then covered it and received the tap (9 of 9 traces before the fix: `covered > hittable > covered > hittable`). Fixed in `0f6e3de` (`isRestoringSession` keeps the session curtain up until the user is applied; the safety record is bound to its account so no new account passes the gate on the previous account's record) | Trace never shows Back hittable and then covered; Back works on the first tap from every cold link | Regression test `routing.spec.ts` (fails on the unfixed build, passes after); unit tests `sessionGateTransitions.test.ts`; repeated runs without retries | Native confirmation on a device build (protocol row L13) | Operator | FIXED on web; native unverified | 2026-11-12 |
| B-21 | "Compare halves" answer points to a control that does not exist | **ANALYSIS ENABLEMENT** (not this release: unreachable while the vision worker is off) | `halvesUnknown` tells the user to "mark the half-time break in the match periods"; no period control exists in the release or the redesign, and its backend `setTrackingPeriods` has no caller and is held back from deployment | Found 2026-11-13 while auditing the held function (`backend-deploy-plan-2026-11-12.md` 3.1); present at `01f9459` | Either a period control that calls `setTrackingPeriods` (deployed with it, with tests) or a reworded answer in all 7 languages, before the worker is enabled | either option | none | Engineering | OPEN | 2026-11-13 |
| B-22 | All 81 live functions run on Node.js 20, which Cloud Run functions decommissioned on 2026-10-30 | **OPERATIONAL / TESTFLIGHT** | The CLI refuses to deploy Node.js 20 (BE-2/BE-3 stopped); Google states workloads on a decommissioned runtime may be disabled, which would take the whole backend down | Found 2026-11-13 by the BE-2 dry run (`Runtime Node.js 20 was decommissioned on 2026-10-30`); Cloud Run runtime lifecycle page, updated 2026-11-10 | Functions on Node.js 22 (supported until 2027-10-31): `fix/functions-node22` @ `0adacdf45f2d41f624de2f8263172771c33cf50b` changes only `engines` (dry run of group 1 passes). Redeploying the 14 unchanged held functions is then also needed to move them off Node.js 20 | approval of the revised BE-2/BE-3 (runtime change) and of BE-4 (the 14 held functions, runtime only) | dry run, then the per-group smoke tests | Engineering | **RESOLVED 2026-11-13**: all 94 functions ACTIVE on nodejs22 (80 from BE-2b/BE-3b incl. 13 new, 14 from BE-4), source `0adacdf`; 81 existing functions have new revisions; no deletions; `setTrackingPeriods` still absent | 2026-11-13 |
| B-23 | Unhandled promise rejection in Settings after sign-out (web desktop run, 1 occurrence) | **QUALITY** (no data exposure: the read was denied) | `useNotificationPreferences.reload()` is started with `void` and has no `catch`; a `pushTokens/{uid}` read denied by rules (`isOwner`, rule line 546) during the sign-out transition surfaced as a page error and failed `states.spec.ts:182` once on web-desktop (mobile passed; 0 occurrences in the four earlier complete runs). File unchanged since the release `01f9459` | Seen 2026-11-13 in the Node 22 candidate run | catch and ignore stale reads after the account changes, with a regression test | the session test passes repeatedly | none | Engineering | OPEN | 2026-11-13 |

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
