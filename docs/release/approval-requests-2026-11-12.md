# Approval requests (revised 2026-11-12, evening; none granted)

Each action stands alone: approving one approves nothing else, and silence approves nothing. Merge approval does not
authorize a build; build approval does not authorize an upload; upload approval does not authorize App Review submission.
This revision **supersedes** the earlier A-F list: the integration candidate, the Authentication provider set (Anonymous
was missing) and the App Check validation wording changed, so approvals given for the earlier list would not carry over.

## Identities (verified 2026-11-12 with `git fetch` and `git ls-remote`)

| Name | Full SHA | Notes |
|---|---|---|
| Remote | `origin` = `https://github.com/CapalotDaGreat/scoutx` | the only remote; name verified with `git remote -v` |
| Release target `release/pitchproof-5-3-candidate` | `01f9459c2608bc939c96f5c7388b5e5ba98aac2d` | unchanged on the remote |
| Redesign tip `redesign/pitchproof-ux-overhaul` | see the hand-off message | contains the Back fix `0f6e3de559bd535eb326e8dfc023991fa57d5170` and the release as an ancestor |
| Integration candidate | see the hand-off message | `git merge --no-ff` of the redesign tip onto `01f9459`, no conflicts; its tree equals the redesign tip's tree |
| Index fix `fix/account-restrictions-index` | `9986c4fd320332d1f694a8e943d6c2dc3b60de87` | parent `01f9459`; local only; one added line |
| GPU baseline (immutable, untouched) | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | |

A document cannot contain the SHA of the commit that contains it, so the final redesign tip and integration SHA are given
in the hand-off message and in the integration commit itself. Earlier candidates (`212cb2e`, `0df1cb9`) are superseded.

## Dependency order

```
IDX-1 (index) ──────────────► independent; first, because the live job fails hourly
AUTH-1 (Authentication) ────► needed by every native session (BLD-1, BLD-2, BLD-4)
BE-1 (rules) ─► BE-2 (group 1) ─► BE-3 (group 2) ─► needed for analysis/link import and quiet hours on any build
APC-1 (App Attest) ─────────► needed by BLD-2 and BLD-4 (physical devices); not by the simulator
BLD-1 (simulator build) ─► APC-3 (debug token, needs the token BLD-1 prints) ─► simulator session ─► APC-3 cleanup
BLD-2 (Ad Hoc device build) ► needs AUTH-1, APC-1, BE-1..3 for full protocol coverage
GIT-1 (merge/push) ─────────► independent of all of the above; BLD-3 needs it
BLD-3 (production build) ───► needs GIT-1 and should follow BLD-1/BLD-2 results
SUB-1 (TestFlight upload) ──► needs BLD-3 (and AUTH-1, APC-1, BE-1..3 for a usable build)
```

Can run in parallel: IDX-1, AUTH-1, APC-1, BE-1..3 (BE-3 after BE-2) and GIT-1 have no dependency on each other.
Must wait: APC-3 (for BLD-1's token), BLD-2 (for AUTH-1, APC-1, BE), BLD-3 (for GIT-1), SUB-1 (for BLD-3).
Recommended sequence: **IDX-1 → AUTH-1 → BE-1 → BE-2 → BE-3 → APC-1 → BLD-1 → APC-3 → BLD-2 → GIT-1 → BLD-3 → SUB-1**.

## Actions

| ID | Exact action | Source / artifact | Target | Command or console steps | Prerequisites | Expected change | Cost / operational impact | Validation | Stop / abort if | Rollback limits | Does **not** cover |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **IDX-1** | Add composite index `accountRestrictions(state ASC, until ASC)` (B-18) | `firestore.indexes.json` at `9986c4fd320332d1f694a8e943d6c2dc3b60de87` | Firestore `(default)`, `scoutx-230b0` | clean checkout of that SHA; `firebase deploy --only firestore:indexes --project scoutx-230b0 --non-interactive` (preflight and counts in `backend-deploy-plan-2026-11-12.md` 3) | owner signed in to the Firebase CLI | 39 indexes (38 kept), field overrides unchanged | index build minutes (0 documents); no cost beyond index storage; ends 24 failed job runs a day | `gcloud firestore indexes composite list` shows it `READY`; then the next hourly `releaseExpiredSuspensions` run logs HTTP 200 and no `FAILED_PRECONDITION` | the CLI proposes deleting an index or override; the index is not READY within 30 min | deleting the index makes the job fail again; nothing else affected | pushing or merging the fix branch; rules; functions |
| **AUTH-1** | Initialise Firebase Authentication and enable **Anonymous**, **Email/Password** and **Apple** (B-19). Google only if the owner will set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`/`_IOS_CLIENT_ID` for the build | — | Authentication, `scoutx-230b0` | console: Build → Authentication → Get started → Sign-in method → Anonymous: Enable; Email/Password: Enable (email-link off); Apple: Enable (per Firebase's Apple-platform setup, native iOS sign-in needs no Services ID; the Services ID and key fields are for web/Android flows; token revocation already uses the `APPLE_*` function secrets). Authorized domains: keep defaults | owner decision on Google | sign-up, sign-in and guest sessions become possible; password-reset and verification emails are sent from Firebase's default template and sender | free at this volume; emails go to whatever address a user enters | client probe `POST accounts:lookup` with the public API key and a bogus token answers `INVALID_ID_TOKEN` instead of `CONFIGURATION_NOT_FOUND`; admin `config` readable | — | disabling providers stops new sign-ins; accounts created meanwhile remain and must be deleted individually | creating any account; App Check; email template or domain changes |
| **BE-1** | Deploy Firestore and Storage rules (B-17) | `firestore.rules`, `storage.rules` at the approved release commit (identical at `01f9459`, the redesign and the candidate) | `scoutx-230b0` | `firebase deploy --only firestore:rules,storage --project scoutx-230b0` after the preflight in the plan | IDX-1 not required; preflight passes (`npm run test:rules` 263/263) | quiet-hours save accepted; server-only `mediaImportSources`; owner-read `tracking` data and images | none | live ruleset IDs change; enabling quiet hours on a test account succeeds (after AUTH-1) | the CLI reports a compile error or a different project | redeploy the saved live rulesets (`live-snapshot-2026-11-12/`) | functions; indexes |
| **BE-2** | Deploy function group 1: 33 background functions (28 updated + 5 new task-queue functions; list in `backend-deploy-group1.txt`) | `functions/` at the approved release commit; manifest `backend-deploy-manifest-2026-11-12.json` | Cloud Functions gen 2, europe-west6 | `firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group1.txt)"` | BE-1; `functions/.env.scoutx-230b0` with `GUARDIAN_LINK_BASE_URL` present locally; live archives backed up (plan 3) | 33 functions with today's update time; 5 new queues | Cloud Build minutes; no minimum instances; new task queues idle until used | all 33 ACTIVE; no new ERROR logs for 1 h; analysis env vars absent | any deletion prompt; a function not ACTIVE; new ERROR lines | redeploy old code from the saved archives; data written, tasks queued and notifications sent meanwhile stay | group 2; enabling the vision worker (`CV_WORKER_*`, `TRACKING_V3_ENABLED`) |
| **BE-3** | Deploy function group 2: 47 app-facing functions (39 updated + 8 new callables) | as BE-2, `backend-deploy-group2.txt` | as BE-2 | `firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group2.txt)"` | BE-2 complete and healthy | 94 functions in total, 80 updated today | as BE-2 | function count 94; App Check probe P4 with log correlation (`app-check-behaviour-2026-11-12.md` 4.1); error log quiet | as BE-2; count not 94 | as BE-2 | the 15 held functions; product enforcement |
| **APC-1** | Register App Attest for the iOS app (B-01) | — | App Check, app `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` | console: App Check → Apps → iOS app → App Attest → Save (TTL 1 h) | Team ID on the app (present) | physical-device builds obtain tokens; no enforcement change | none | after BLD-2: App Check metrics show verified Cloud Functions requests; protocol S9 | — | unregister (device callables are then rejected again where enforced) | DeviceCheck (APC-2), debug tokens, product enforcement |
| **APC-2** (optional) | Register DeviceCheck fallback | Apple DeviceCheck key (.p8) and key ID, team `833CYAZ8XT`, handled by the owner only | as APC-1 | same screen → DeviceCheck → upload | owner creates the key in Apple Developer | devices without App Attest obtain tokens | none | as APC-1 on an older device | the key would have to pass through chat, git or a ticket | unregister; revoke the key | anything else |
| **APC-3** | Add the one simulator debug token, then delete it after the session | token printed by BLD-1's app in the Simulator log | as APC-1 | Manage debug tokens → Add (name: tester + date); afterwards delete it in the same screen | BLD-1 | that simulator passes App Check | anyone holding the token string can too: keep it short-lived, never in git or chat | protected screens work in the Simulator | token would need to be shared outside the owner's console | delete the token | physical-device or App Attest evidence |
| **BLD-1** | One iOS simulator build plus EAS simulator session time | candidate SHA (hand-off) | Expo `@boddibossi/scoutx`, profile `simulator` (extends `production`, `EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG=simulator`) | `eas build --platform ios --profile simulator --non-interactive` from a clean checkout of the SHA; then an EAS simulator session (iPhone SE 3rd gen, iPhone 16, iPad 10th gen) or a Mac with Xcode (free) | AUTH-1 for any signed-in row; BE-1..3 for analysis rows | a simulator `.app`; no build-number use (`autoIncrement: false`); app talks to **production** | about $2 per iOS build (medium) and $0.10 per simulator minute, less plan credit (expo.dev pricing as read 2026-11-12); no Apple signing | EAS record shows the SHA and profile `simulator`; build log prints no "Build blocked"; protocol rows of section 0 incl. L13 | build record SHA differs; the app shows the App Check warning for a missing flag | delete the build | App Attest, DeviceCheck, physical performance, VoiceOver on hardware, purchases, TestFlight |
| **BLD-2** | Register the tester's iPhone and make one Ad Hoc build | candidate SHA | Expo, profile `preview` (internal; production Firebase env) | `eas device:create`, then `eas build --platform ios --profile preview --non-interactive` | AUTH-1, APC-1, BE-1..3; owner signs in to Apple when EAS asks | Ad Hoc profile with the device; `preview` does not auto-increment the build number | about $2 per build | install on the registered iPhone; protocol S2-S9, A1-A3, E1-E2, L13 | build signed for another team or bundle | delete the build; revoke the profile | TestFlight, App Store |
| **GIT-1** | Fast-forward the release branch to the integration candidate | integration SHA (hand-off) | GitHub `origin` | `git fetch origin && test "$(git rev-parse origin/release/pitchproof-5-3-candidate)" = 01f9459c2608bc939c96f5c7388b5e5ba98aac2d && git merge-base --is-ancestor 01f9459c2608bc939c96f5c7388b5e5ba98aac2d <SHA> && git push origin <SHA>:refs/heads/release/pitchproof-5-3-candidate` (plain push; no `--force`, no history rewrite) | none; abort if the release tip moved | release branch contains the redesign and the Back fix; every 5.3 screenshot and device result becomes outdated (B-16) | none | `git ls-remote origin refs/heads/release/pitchproof-5-3-candidate` prints the SHA | the release tip is not `01f9459` (re-integrate, re-test, re-request) | `git revert -m 1 <SHA>` on the release branch (a new commit) | any deploy, build, upload or submission; pushing the index-fix branch |
| **BLD-3** | Production iOS build | the merged release commit (= integration SHA) | Expo, profile `production`, bundle `com.scoutx.app`, version 1.0.0 | `eas build --platform ios --profile production --non-interactive` | GIT-1; BLD-1/BLD-2 findings resolved | store-signed `.ipa`; build number auto-increments remotely (latest 4, next expected 5) | about $2; consumes a build number (never reused) | EAS record shows the SHA; App Check provider App Attest (no simulator flag: the build gate blocks it) | build gate prints "Build blocked" | builds expire; numbers are not reused | upload; submission |
| **SUB-1** | Upload BLD-3 to App Store Connect for TestFlight only | BLD-3 build ID | App Store Connect app `6820059284` | `eas submit --platform ios --id <BLD-3 build id>` | BLD-3; AUTH-1, APC-1, BE-1..3 for a usable build | build appears in TestFlight after processing | none | TestFlight shows the build number and processing complete | the submit targets another app ID | expire the TestFlight build | external testing, App Review submission, release |

## Production test plan (prepared; not executed; needs its own approval TEST-1)

There is no staging project, so native sessions use production `scoutx-230b0`.

| Topic | Plan |
|---|---|
| Accounts | the owner creates at most four throwaway accounts after AUTH-1: player adult, player under 18 (guardian address = an owner-controlled mailbox), scout, coach; names `PP Test <role> <date>`, emails on an owner-controlled domain or `+test` aliases |
| Fixtures | only what the app creates through its own flows; no admin writes, no seeded documents |
| Real users | none exist today (Auth never initialised, all collection groups empty, 2026-11-12); test accounts keep Discover visibility **off**, so no future real user sees them; never message, request, watch or rate a non-test profile |
| Notifications | push tokens register on the test devices only; scheduled reminders (`sendDevelopmentReminders`, weekly reports) would reach test accounts only |
| Email | Firebase verification/reset emails and guardian-consent emails go only to the owner-controlled addresses |
| Payments | RevenueCat in sandbox (TestFlight/Ad Hoc use the App Store sandbox); no purchase with a real Apple ID; webhook events from sandbox are recorded by `revenueCatWebhook` against test accounts only |
| Analysis | stays off (no `CV_WORKER_*`); test footage is the owner's own, never uploaded outside the app's flow |
| Cleanup | at the end delete each account in the app (protocol S6), then check by count only that `profiles`, `discoverablePlayers`, `users` are back to 0 and the default bucket has 0 objects; delete APC-3's token; record what was deleted |
| Permissions | owner approval TEST-1 covers account creation and the session; it does not cover BLD-* or APC-* |

## Verdict inputs

Evidence for each action is in `backend-deploy-plan-2026-11-12.md`, `backend-deploy-manifest-2026-11-12.json`,
`app-check-behaviour-2026-11-12.md`, `blocker-register-2026-11-04.md` (B-16 to B-20) and `docs/design/REDESIGN_LEDGER.md`
section 16 (tests on the candidate tree).
