# Approval requests (revised 2026-11-13; none granted)

Each action is approved on its own. Approving one approves nothing else, and silence approves nothing. Approving the merge
does not authorize a build, approving a build does not authorize an upload, and approving an upload does not authorize App
Review submission. This revision **supersedes** the 2026-11-12 lists, both the A-F list and the evening list. Since then the
candidate has gained the index fix, IDX-1 has changed to a single `gcloud` create and the deployment preflight has
changed. An approval given for an earlier version does not carry over.

## Identities (re-verified 2026-11-13 with `git fetch origin` and `git ls-remote origin`)

| Name | Full SHA | Notes |
|---|---|---|
| Remote | `origin` → `https://github.com/CapalotDaGreat/scoutx` (GitHub reports the new location `CapalotDaGreat/ScoutX`; pushes are redirected) | the only remote (`git remote -v`) |
| Release target `release/pitchproof-5-3-candidate` | `01f9459c2608bc939c96f5c7388b5e5ba98aac2d` | has not moved on the remote |
| Index fix `fix/account-restrictions-index` | `9986c4fd320332d1f694a8e943d6c2dc3b60de87` | parent `01f9459`; adds one line to `firestore.indexes.json`; local only. **Included in the candidate** |
| Redesign tip `redesign/pitchproof-ux-overhaul` | given in the hand-off message (it contains this document) | contains the Back fix `0f6e3de559bd535eb326e8dfc023991fa57d5170`; pushed |
| Integration candidate | given in the hand-off message | parents: `9986c4f` (release + index fix) and the redesign tip. Both merges are clean. Its tree is the redesign tree plus the one index line |
| GPU baseline (immutable, not touched) | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | |

The candidate merge commit exists only in the preparation workspace. GIT-1 therefore pushes it from there, and only after
approval. Every other action uses commits that are already on the remote (`01f9459` and the redesign tip) or needs no
checkout at all.

## Dependencies

```
                 ┌──────────── IDX-1 index ── gate: READY, then job HTTP 200
 independent ────┼──────────── AUTH-1 Auth ── gate: accounts:lookup → INVALID_ID_TOKEN ──► TEST-1 test accounts
                 ├── BE-1 rules ── BE-2 group 1 ══► BE-3 group 2 ── gate: 94 functions + App Check probe 4.1
                 ├──────────── APC-1 App Attest (registration only; proven later by BLD-2 + TEST-1)
                 ├──────────── GIT-1 merge/push ══► BLD-3 production build ══► SUB-1 TestFlight upload ─ ─► REV-1 review (not ready)
                 └──────────── BLD-1 simulator build ══► APC-3 debug token ══► simulator session (signed-in rows need TEST-1)
 BLD-2 Ad Hoc build: builds on its own; device validation needs AUTH-1, APC-1, TEST-1, BE-1..3
 ══► hard prerequisite      ── recommended order      ─ ─► later, separate decision
```

| Action | Hard prerequisites (cannot work without) | Recommended before | Can run in parallel with | Gate before anything that depends on it |
|---|---|---|---|---|
| IDX-1 | none | — | all | index `READY`, then a 200 run of `releaseExpiredSuspensions` |
| AUTH-1 | none | — | all | client probe answers `INVALID_ID_TOKEN`; admin `config` readable |
| TEST-1 | AUTH-1 | BE-1..3 (quiet hours, new callables) | builds | accounts exist, named as tests, Discover visibility off |
| BE-1 | preflight (section 3 of the deploy plan) | IDX-1 | IDX-1, AUTH-1, APC-1, GIT-1, BLD-1 | both rules releases updated |
| BE-2 | preflight: `.env` key list is exactly `GUARDIAN_LINK_BASE_URL` | BE-1 | as BE-1 | 33 functions ACTIVE, 10 queues RUNNING, schedules unchanged, no new errors |
| BE-3 | BE-2 gate passed: the new callables enqueue into group-1 queues | — | as BE-1 | 94 functions; App Check probe with log correlation |
| APC-1 | none (the iOS app and Team ID exist) | — | all | registration visible. Token acquisition can only be shown on a physical device (BLD-2) |
| BLD-1 | none to build | AUTH-1, BE-1..3 | all | EAS record shows the SHA and profile `simulator` |
| APC-3 | BLD-1 running once (it prints the token) | — | — | protected screens load in that simulator |
| BLD-2 | tester's iPhone registered (`eas device:create`); owner's Apple sign-in | AUTH-1, APC-1, BE-1..3, TEST-1 | BLD-1 | install works; protocol rows recorded |
| GIT-1 | remote release tip is still `01f9459`; candidate commit present (preparation workspace) | BLD-1/BLD-2 results, so that a fix found on device does not need a second merge | all deploys | `git ls-remote` equals the candidate |
| BLD-3 | GIT-1 (provenance: build the merged release commit) | AUTH-1, APC-1, BE-1..3, native results | — | EAS record SHA equals the release tip |
| SUB-1 | BLD-3 | AUTH-1, APC-1, BE-1..3 (otherwise testers get a non-working app) | — | TestFlight processing complete |
| REV-1 (not requested) | SUB-1 plus blockers B-01..B-21 | — | — | — |

Circular dependencies, and how the plan breaks them:
1. APC-3 needs the debug token, which only the BLD-1 app can print, while the simulator session needs APC-3. The order is: build, launch once to read the token, add the token, run the session, delete the token.
2. AUTH-1 validation would need an account, but TEST-1 needs AUTH-1. AUTH-1 is validated with an account-free probe, and signing in is first shown under TEST-1.
3. APC-1 can only be proven by device traffic, and devices need APC-1. Registration goes first; the proof is collected during BLD-2.
4. Native builds would ideally use the merged commit, but the merge should wait for the native results. BLD-1 and BLD-2 build the pushed redesign tip, whose app source is identical to the candidate (the only difference is `firestore.indexes.json`, which is not bundled). BLD-3 builds the merged commit.

"Independent" above means that an action can be executed and its own gate checked without the others. Where its full
validation needs another action, the table says so.

## Actions

| ID | Purpose / exact scope | Source / artifact | Target | Command or console steps | Expected change | Cost / impact | Validation to collect | Stop / abort | Rollback limits | Not authorized |
|---|---|---|---|---|---|---|---|---|---|---|
| **IDX-1** | Add the missing composite index `accountRestrictions(state ASC, until ASC)` (B-18) | equals the entry in `firestore.indexes.json` at `9986c4f` (in the candidate) | Firestore `(default)`, `scoutx-230b0` | three `gcloud firestore indexes composite …` commands in `backend-deploy-plan-2026-11-12.md` section 3, Step A | 39 indexes; nothing else | index storage only; ends the hourly HTTP 500 | READY state; first 200 run (plan section 4) | a count other than 38 before; not READY after 30 min | `gcloud firestore indexes composite delete <id>` brings the failures back | any other index or rule; deploying `firestore:indexes` from a file |
| **AUTH-1** | Initialise Authentication; enable **Anonymous**, **Email/Password**, **Apple**. Google only if the owner will set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`/`_IOS_CLIENT_ID` (no build profile does today) | — | Authentication, `scoutx-230b0` | console: Build → Authentication → Get started → Sign-in method: Anonymous → Enable; Email/Password → Enable (email-link off); Apple → Enable (native iOS needs no Services ID; Apple token revocation already uses the `APPLE_*` function secrets). Keep the default authorized domains and email templates | guest sessions, sign-up and sign-in become possible; verification and password-reset emails are sent from Firebase's default sender when users ask for them | free at this volume | `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=<public iOS API key>` with body `{"idToken":"x"}` answers `INVALID_ID_TOKEN` (before: `CONFIGURATION_NOT_FOUND`) | the console offers an Identity Platform upgrade with billing: decline and stop | providers can be disabled; accounts created in the meantime stay | creating accounts; email template, domain or SMTP changes; App Check |
| **TEST-1** | Owner creates at most 4 throwaway accounts and runs native sessions against production | — | `scoutx-230b0` | plan below | test accounts and their own data | free | the cleanup counts below | contact with any non-test profile; a non-test email address | delete in the app (protocol S6) | builds, App Check changes |
| **BE-1** | Deploy Firestore and Storage rules (B-17) | `01f9459c2608bc939c96f5c7388b5e5ba98aac2d` (rules identical in the candidate) | `scoutx-230b0` | `firebase deploy --only firestore:rules,storage --project scoutx-230b0` after preflight | quiet-hours save accepted; server-only `mediaImportSources`; owner-read `tracking` | none | both releases updated (plan section 4) | compile error; wrong project | redeploy `live-snapshot-2026-11-12/*.rules.live` | functions, indexes |
| **BE-2** | Deploy group 1: 33 functions (28 updated, 5 new task queues) | `01f9459…`; list `docs/release/backend-deploy-group1.txt`; manifest `backend-deploy-manifest-2026-11-12.json` | Cloud Functions gen 2, europe-west6, `scoutx-230b0` | `firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group1.txt)"` | 33 updated/new functions; 5 queues created automatically by the CLI | Cloud Build minutes; no minimum instances | plan section 4 "After BE-2" | deletion prompt; a function not ACTIVE; new ERROR lines; any analysis flag in the env | redeploy from the saved source archives; data written and tasks queued in the meantime stay | group 2; enabling the vision worker or video reasoning |
| **BE-3** | Deploy group 2: 47 functions (39 updated, 8 new callables) | as BE-2, `backend-deploy-group2.txt` | as BE-2 | `firebase deploy --project scoutx-230b0 --only "$(cat docs/release/backend-deploy-group2.txt)"` | 94 functions; the 15 held ones unchanged | as BE-2 | plan section 4 "After BE-3", including the App Check probe | as BE-2; a count other than 94 | as BE-2 | the 15 held functions (incl. `setTrackingPeriods`); App Check product enforcement |
| **APC-1** | Register App Attest for the iOS app (B-01) | — | App Check, `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` | console: App Check → Apps → iOS app → App Attest → Save | devices can obtain tokens; no enforcement change | none | after BLD-2: App Check metrics show verified requests; protocol S9 | — | unregister | DeviceCheck (APC-2), debug tokens, enforcement |
| **APC-2** (optional) | DeviceCheck fallback | Apple DeviceCheck key, handled only by the owner | as APC-1 | same screen → DeviceCheck → upload the key | older devices obtain tokens | none | as APC-1 | the key would have to pass through chat, git or a ticket | unregister; revoke the key | anything else |
| **APC-3** | One simulator debug token for one session, deleted afterwards | the token printed by the BLD-1 app in the Simulator log | as APC-1 | Manage debug tokens → Add (name: tester + date); afterwards delete it | that simulator passes App Check | anyone holding the token can too; keep it short-lived, never in git or chat | protected screens load in the Simulator | the token would need to leave the owner's console | delete the token | physical-device or App Attest evidence |
| **BLD-1** | One iOS simulator build + EAS simulator session time (or a Mac with Xcode, free) | the pushed redesign tip (hand-off SHA); app source identical to the candidate | Expo `@boddibossi/scoutx`, profile `simulator` (extends `production`; `EXPO_PUBLIC_APP_CHECK_SIMULATOR_DEBUG=simulator`) | from a clean checkout of that SHA: `eas build --platform ios --profile simulator --non-interactive` | a simulator `.app`; no build-number use (`autoIncrement: false`); talks to **production** | about $2 per iOS build (medium) and $0.10 per simulator minute, less plan credit (expo.dev pricing, read 2026-11-12) | EAS record shows the SHA and profile; the log shows no "Build blocked"; device protocol section 0 rows including L13 | the record SHA differs; the app shows the App Check configuration warning | delete the build | App Attest, DeviceCheck, physical performance, VoiceOver on hardware, purchases, TestFlight |
| **BLD-2** | Register the tester's iPhone; one Ad Hoc build | as BLD-1 | Expo profile `preview` (internal; production Firebase env) | `eas device:create`, then `eas build --platform ios --profile preview --non-interactive` | Ad Hoc provisioning profile with that device; `preview` does not auto-increment the build number | about $2 per build | install on the registered iPhone; rows S2-S9, A1-A3, E1-E2, L13 | signed for another team or bundle | delete the build; revoke the profile | TestFlight, App Store |
| **GIT-1** | Fast-forward `release/pitchproof-5-3-candidate` to the candidate | the candidate SHA (hand-off) | GitHub `origin` | from the preparation workspace: `git fetch origin && test "$(git rev-parse origin/release/pitchproof-5-3-candidate)" = 01f9459c2608bc939c96f5c7388b5e5ba98aac2d && git merge-base --is-ancestor 01f9459c2608bc939c96f5c7388b5e5ba98aac2d <SHA> && git push origin <SHA>:refs/heads/release/pitchproof-5-3-candidate`. A plain push: Git refuses it if the remote advanced (not a fast-forward); no `--force`, no history rewrite | the release branch gets the redesign, the Back fix and the index entry; every 5.3 screenshot and device result becomes outdated (B-16) | none | `git ls-remote origin refs/heads/release/pitchproof-5-3-candidate` prints the SHA | release tip ≠ `01f9459`: stop, re-integrate, re-test, re-request | `git revert -m 1 <SHA>` (a new commit) | any deploy, build, upload or submission; pushing the index-fix branch |
| **BLD-3** | Production iOS build | the merged release commit (= candidate) | Expo profile `production`, bundle `com.scoutx.app`, version 1.0.0 | `eas build --platform ios --profile production --non-interactive` from a clean checkout of the release tip | store-signed `.ipa`; remote build number auto-increments (latest 4, next expected 5) | about $2; uses a build number permanently | EAS record SHA equals the release tip; the build gate passes (no simulator flag, no debug token) | "Build blocked"; SHA mismatch | builds expire; build numbers are never reused | upload; submission |
| **SUB-1** | Upload BLD-3 to App Store Connect for TestFlight only | BLD-3 build ID | App Store Connect app `6820059284` | `eas submit --platform ios --id <BLD-3 build id>` | the build appears in TestFlight after processing | none | build number and processing status | the submit targets another app ID | expire the TestFlight build | external testing, App Review submission, release |

## Production test plan (TEST-1; prepared, not executed)

There is no staging project, so native sessions run against production `scoutx-230b0`. During preparation no user was
created and no notification or email was sent.

| Topic | Plan |
|---|---|
| Accounts | after AUTH-1 the owner creates at most four: adult player, under-18 player (guardian = an owner-controlled mailbox), scout, coach. Names `PP Test <role> <date>`; emails on an owner-controlled domain or `+test` aliases |
| Fixtures | only what the app creates through its own flows; no admin writes, no seeded documents |
| Real users | none exist (Auth never initialised; every collection group empty, 2026-11-12). Test accounts keep Discover visibility **off**; never message, request, watch or rate a non-test profile |
| Notifications | push tokens register on the test devices only; scheduled reminders and weekly reports would reach test accounts only |
| Email | verification, reset and guardian-consent emails go only to owner-controlled addresses |
| Payments | RevenueCat with the App Store sandbox (TestFlight and Ad Hoc builds use it); never a purchase with a real Apple ID |
| Analysis / AI | stays off (no `CV_WORKER_*`, `TRACKING_V3_ENABLED`, `VIDEO_REASONING_ENABLED`, `AI_FOOTAGE_PROCESSING_APPROVED`); test footage is the owner's own |
| Cleanup | delete each account in the app (protocol S6). Then, counts only: `profiles`, `users`, `discoverablePlayers` back to 0 and the default bucket at 0 objects. Delete the APC-3 token and record what was deleted |
| Approval | TEST-1 covers account creation and the sessions; it does not cover any BLD-* or APC-* action |

## Ready for approval now (dependency order)

IDX-1 · AUTH-1 · BE-1 · BE-2 · BE-3 (after the BE-2 gate) · APC-1 · BLD-1 · APC-3 (once BLD-1 has printed the token) ·
TEST-1 (once AUTH-1 is done) · BLD-2 · GIT-1

Not ready: **BLD-3** until GIT-1 is done (recommended also after the BLD-1/BLD-2 results); **SUB-1** until BLD-3 exists;
**REV-1** (App Review) until the blocker register's submission items are closed: counsel review (B-03), device
validation, backups (B-02), screenshots on the merged commit (B-16) and the other open B-items.

## Status after the approved execution (2026-11-13)

IDX-1 executed (index READY; first job run pending) · BE-1 completed and verified · APC-1 executed (device proof pending) ·
GIT-1 see the hand-off · **BE-2, BE-3 stopped** (Node.js 20 runtime decommissioned; source must change) · AUTH-1, TEST-1,
BLD-1, APC-3, BLD-2, BLD-3, SUB-1 not executed (owner console step; no EAS build route from the preparation workspace).
Details: `docs/design/REDESIGN_LEDGER.md` section 18.

### Revised requests that replace BE-2/BE-3 (new approval needed: source and runtime changed)

| ID | Exact scope | Source | Command | Changes vs. the approved BE-2/BE-3 | Validation / stop | Rollback limits |
|---|---|---|---|---|---|---|
| **BE-2b** | group 1 (33 functions), runtime **Node.js 22** | `fix/functions-node22` @ `0adacdf45f2d41f624de2f8263172771c33cf50b` (= `01f9459` + engines 20→22) or the merged release commit, clean | as BE-2 | every deployed function changes runtime from Node.js 20 to Node.js 22; function code unchanged | as BE-2; dry run passed 2026-11-13 | rollback to Node.js 20 is impossible (decommissioned): repair forward only |
| **BE-3b** | group 2 (47 functions), Node.js 22 | as BE-2b | as BE-3 | as BE-2b | as BE-3 | as BE-2b |
| **BE-4** (new) | the 14 held functions whose code is unchanged or refactor-only, runtime change only (`setTrackingPeriods` stays excluded) | as BE-2b | `firebase deploy --project scoutx-230b0 --only "functions:mediaLifecycleSweep,functions:onDiscoverableSearchIndexWritten,functions:onMatchJobDeleted,functions:onMatchJobMediaLifecycle,functions:onVerificationWrittenSyncTrust,functions:scheduleWeeklyFootballReports,functions:confirmRole,functions:generateHighlightReelPlan,functions:listAdminReviewQueue,functions:purgeLegacyGpsLocation,functions:resolveVerificationRequest,functions:setStaffRole,functions:submitPrivacyRequest,functions:updatePrivacyRequest"` | moves them off the decommissioned runtime, which "may be disabled" | ACTIVE on nodejs22; schedules unchanged; no new errors | forward repair only |

## Owner steps that this workspace cannot perform (2026-11-13)

1. **GIT-1** (approved; the push from the preparation workspace was refused by its safety control). From any clone:
   ```
   git fetch origin
   test "$(git rev-parse origin/release/pitchproof-5-3-candidate)" = 01f9459c2608bc939c96f5c7388b5e5ba98aac2d
   git fetch origin integration/redesign-into-5-3-r4
   test "$(git rev-parse FETCH_HEAD)" = 5cc7af234619c7944dfe8f8fdf9e20ae828ee45e
   git merge-base --is-ancestor 01f9459c2608bc939c96f5c7388b5e5ba98aac2d 5cc7af234619c7944dfe8f8fdf9e20ae828ee45e
   git push origin 5cc7af234619c7944dfe8f8fdf9e20ae828ee45e:refs/heads/release/pitchproof-5-3-candidate
   ```
   A plain push; Git refuses it if the release branch moved. Rollback: `git revert -m 1 5cc7af234619c7944dfe8f8fdf9e20ae828ee45e`.
2. **AUTH-1**: Firebase console → project `scoutx-230b0` → Build → Authentication → Get started → Sign-in method:
   Anonymous → Enable → Save; Email/Password → Enable (leave "Email link" off) → Save; Apple → Enable → Save (no
   Services ID needed for the iOS app). Decline any Identity Platform upgrade. Then tell the preparation session, which
   checks it with the account-free `accounts:lookup` probe.
3. **Builds** (EAS has no linked GitHub repository, so builds start from your machine where `eas` is signed in; or link
   the repository in expo.dev → project → GitHub so the session can start them):
   * BLD-1: `git clone https://github.com/CapalotDaGreat/ScoutX pp-bld1 && cd pp-bld1 && git checkout 5cc7af234619c7944dfe8f8fdf9e20ae828ee45e && npm ci && npx eas-cli build --platform ios --profile simulator --non-interactive`
   * BLD-2: `npx eas-cli device:create` (open the link on the designated iPhone), then in the same checkout
     `npx eas-cli build --platform ios --profile preview --non-interactive`
   * BLD-3 (after GIT-1): fresh clone, `git checkout 5cc7af234619c7944dfe8f8fdf9e20ae828ee45e`, `npm ci`,
     `npx eas-cli build --platform ios --profile production --non-interactive`. Send the build ID; SUB-1 can then be run
     by the preparation session through the Expo connection after it has checked the build's commit.
4. **Simulator session limit**: give a maximum duration and spending cap for the EAS simulator session (none is in this
   packet), or run the protocol on a Mac.
5. **Callable App Check probe** (after BE-3b; this workspace cannot reach `cloudfunctions.net`): run 4.1 of
   `app-check-behaviour-2026-11-12.md` from your network and send the full response with the UTC time; the session
   correlates it with the server log and revision.
