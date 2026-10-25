# Validation Matrix

Historical baseline: 2026-10-08 (Phase 14). Fresh local results are recorded in `asc-readiness.md`.
Only results that were actually observed are marked PASS. Every row
marked `NOT VALIDATED` is counted by the release gate ("Real-device and end-to-end validation").
When a row is executed, replace the state with `PASS` or `FAIL`, and record the date, build number and
tester. A `FAIL` or `FAIL (manual)` state is a code blocker in the release gate; it cannot be cleared
by simply removing `NOT VALIDATED`.

States: **PASS (automated)** = covered by a test in this repo; **PASS (manual)** = observed by a
person on the stated build; **NOT VALIDATED**; **NOT AVAILABLE** (feature deliberately absent).

## Automated evidence in this repository

| Area | State | Evidence |
| --- | --- | --- |
| Type safety, lint | PASS (automated) | `npm run typecheck`, `npm run lint` |
| Unit tests (policy, mapping, AI, uploads, premium, deletion auth) | PASS (automated) | `npm run test:unit` |
| Firestore / Storage rules and callables against emulators | PASS (automated) | `npm run test:rules` |
| End-to-end flows against all emulators (web build) | PASS (automated) | `npm run test:e2e:emulators` |
| Deletion requires recent sign-in on the server | PASS (automated) | `tests/rules/deletionAuth.test.mjs`, `tests/unit/deletionAuth.test.ts` |
| Guardian link single use under concurrency | PASS (automated) | `tests/rules/guardianFlow.test.mjs` |
| AI footage gate, OpenRouter timeouts and failures | PASS (automated) | `tests/unit/aiPrivacyGate.test.ts` |

## Real device matrix (iOS only)

Minimum: one older supported iPhone and one current iPhone, on the lowest and newest supported iOS.
iPad is not supported (`supportsTablet: false`) but App Review runs iPhone apps on iPad: run the iPad
row.

| Scenario | Device / iOS | State | Notes |
| --- | --- | --- | --- |
| Install from TestFlight, first launch, legal gate, age band | iPhone (older) | NOT VALIDATED | |
| Install from TestFlight, first launch, legal gate, age band | iPhone (current) | NOT VALIDATED | |
| Same flow in iPhone compatibility mode | iPad | NOT VALIDATED | App Review 2.1(a) risk |
| Sign in with Apple (new account, returning account) | iPhone | NOT VALIDATED | |
| Google sign-in | iPhone | NOT VALIDATED | |
| Email sign-up, email verification link opens the app | iPhone | NOT VALIDATED | |
| Account deletion: fresh session deletes; stale session asks for re-auth (password, Apple, Google) then deletes | iPhone | NOT VALIDATED | server side PASS (automated) |
| Account deletion failure shows "We couldn't complete account deletion" and retry | iPhone (airplane mode mid-flow) | NOT VALIDATED | |
| Camera roll picker, 10 / 45 / 90 min video upload on Wi-Fi | iPhone | NOT VALIDATED | see large-file plan |
| Upload resumes after app kill and on cellular | iPhone | NOT VALIDATED | |
| Movement session (foreground GPS only), km / miles | iPhone outdoors | NOT VALIDATED | |
| Push notification delivery, generic lock-screen text for minors | iPhone | NOT VALIDATED | needs APNs key |
| Universal link `https://pitchproof.online/report/...` opens the app | iPhone | NOT VALIDATED | needs AASA served |
| Guardian link opens in Safari (not the app) | iPhone | NOT VALIDATED | |
| Paywall, purchase, restore, Customer Center (sandbox) | iPhone | NOT VALIDATED | needs `appl_` key |
| Free tier: match logging and basic development work without premium | iPhone | NOT VALIDATED | automated PASS for quota logic |
| VoiceOver labels on the main flows, Dynamic Type at the largest size | iPhone | NOT VALIDATED | |
| Dark and light appearance | iPhone | NOT VALIDATED | |
| All 7 UI languages render without truncation (en, de, fr, es, it, pt, nl) | iPhone | NOT VALIDATED | |

## Guardian email test plan

Requires the Trigger Email extension with a real SMTP provider (EMAIL configuration) and
`GUARDIAN_LINK_SECRET` (32+ characters).

| Step | State | Notes |
| --- | --- | --- |
| Teen account requests consent; email arrives (inbox, not spam) at Gmail, Outlook, iCloud | NOT VALIDATED | |
| Email shows only the player's first name and no other personal data | NOT VALIDATED | template PASS (automated) |
| Link opens `https://pitchproof.online/guardian/`, token removed from the address bar | NOT VALIDATED | |
| Approve with selected scopes; confirmation email with revoke link arrives | NOT VALIDATED | flow PASS (automated, emulator) |
| Reusing the approval link fails; revoke link works once | NOT VALIDATED | PASS (automated, emulator) |
| Link older than 7 days is refused | NOT VALIDATED | expiry PASS (automated) |
| Trial co-approval email for a minor's trial invitation | NOT VALIDATED | |
| Scout-contact notification email to the guardian | NOT VALIDATED | |
| Bounce / wrong address: player can change the guardian email; old link stops working | NOT VALIDATED | superseding PASS (automated) |

## Large-file test plan

Requires deployed Storage, Cloud Tasks queues, `AI_FOOTAGE_PROCESSING_APPROVED=true` (after the AI
provider review) and real footage that the tester has the right to use.

| Case | State | Expectation |
| --- | --- | --- |
| 10 min 1080p MP4 | NOT VALIDATED | upload, validation, analysis complete |
| 45 min 1080p MP4 | NOT VALIDATED | chunked upload, segmented extraction |
| 90 min 1080p MOV (HEVC from iPhone) | NOT VALIDATED | same; function memory stays below limit |
| 120 min 4K | NOT VALIDATED | refused or accepted according to plan limits |
| 4 GB+ file | NOT VALIDATED | refused before upload with plan message |
| Corrupted / renamed non-video | NOT VALIDATED | rejected in quarantine (PASS automated with fixtures) |
| Network drop at 60 %, resume | NOT VALIDATED | resumes from last chunk |
| Cancel during extraction | NOT VALIDATED | quota refunded before analysis starts |

## Video intelligence (see `docs/video/device-test-protocol.md`)

| Case | State | Expectation |
| --- | --- | --- |
| Consent sheet: nothing uploads until all four points are ticked; options default off | NOT VALIDATED | server enforcement PASS (automated) |
| 20 s short clip: only frames upload, video never leaves the phone, clip review shown | NOT VALIDATED | flow PASS (automated, emulator) |
| Files / iCloud picker with an iCloud-only 45 min MOV | NOT VALIDATED | preparing state, then upload |
| Segment progress "X/Y" visible during a 45 min analysis | NOT VALIDATED | server PASS (automated, emulator) |
| "Is this you?" confirm releases held-back coaching; reject discards it | NOT VALIDATED | PASS (automated, emulator) |
| After completion: source deleted (keep off), only cited frames remain in Storage | NOT VALIDATED | PASS (automated, emulator) |
| Keep match video on: video appears in media library after completion | NOT VALIDATED | PASS (automated, emulator) |
| Evidence clips requested: ≤ 6 short silent clips play in the report | NOT VALIDATED | cutter interface PASS (automated, stubbed ffmpeg) |
| Withdraw consent mid-analysis stops processing and removes temporary media | NOT VALIDATED | PASS (automated, emulator) |
| Computer-vision worker evaluated on annotated real footage (`workers/football-cv/eval`) | NOT VALIDATED | worker NOT DEPLOYED; approval record absent (`docs/video/accuracy-report.md`) |
| Upload resumes after kill from the last committed chunk; changed file refused | NOT VALIDATED | logic PASS (automated, fake resumable endpoint) |
| Server rejects a corrupted upload (CRC32C mismatch) | NOT VALIDATED | PASS (automated, emulator) |
| Preflight facts match the file; warnings never block | NOT VALIDATED | PASS (automated, unit) |
| Corrections: feedback stored, report unchanged, other accounts cannot read it | NOT VALIDATED | PASS (automated, emulator) |
| Trends locked below 3 comparable analyses | NOT VALIDATED | PASS (automated, unit) |
| Legacy media dry run on production | NOT VALIDATED | tool PASS (automated, emulator); needs operator credentials |

Server code never reads a whole video into memory: frames are size-capped (`MAX_FRAME_BYTES`), reel
rendering streams to `/tmp`, quarantine reads the first 16 bytes. This is a code review result, not a
load test.

## Production configuration checks

| Item | State | Notes |
| --- | --- | --- |
| Firestore and Cloud Functions APIs enabled on `scoutx-230b0` | NOT VALIDATED | Historical 403 on 2026-10-07; provisioning reported 2026-10-08, needs current production smoke test |
| Firestore indexes deployed (`firestore.indexes.json`) | NOT VALIDATED | |
| Cloud Tasks queues deployed, OIDC-only invokers | NOT VALIDATED | |
| App Check with App Attest enforced | NOT VALIDATED | |
| Signed download URLs (`signBlob` permission) for exports | NOT VALIDATED | |
| Scheduled retention cleanup runs | NOT VALIDATED | |
| Sentry receives a scrubbed crash from a release build | NOT VALIDATED | |
| Backup restore drill | NOT VALIDATED | `docs/security/backups.md` |
