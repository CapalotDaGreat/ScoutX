# ScoutX Completion Status

Updated 2026-10-07 at the end of the Gap Closure Program. Initial release target: iOS only.

States: **COMPLETED** (implemented and covered by automated tests in this repo), **PARTIAL**,
**NOT AVAILABLE** (deliberately not offered), **NOT VALIDATED** (implemented; needs devices,
credentials or production to verify), **LEGAL REVIEW REQUIRED**, **SECURITY REVIEW REQUIRED**,
**EXTERNAL CONFIGURATION REQUIRED**.

## Regression gate

| Check | Result |
| --- | --- |
| `npm run typecheck` (app + tests) | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 354 tests |
| `npm run test:rules` (Firestore, Storage, callables, push, deletion, uploads with ffprobe fixtures, analysis, entitlements, data rights, guardian flow) | PASS, 168 tests |
| i18n parity across en, de, fr, es, it, nl, pt | PASS |
| `npm run legal:check` | PASS |
| `npm run test:e2e:emulators` (Auth, Firestore, Storage, Functions, Cloud Tasks emulators) | PASS, 17 tests |
| `npm run release:gate` | PASS except legal contacts (EXTERNAL CONFIGURATION REQUIRED) |

## Program matrix

| Area | State | Evidence / note |
| --- | --- | --- |
| Security blockers (client AI key, rules hardening, CORS, App Check wiring) | COMPLETED | release gate, rules suites, `callableCors.test.ts` |
| Age gate (13+), age band only, under-13 blocked and deleted | COMPLETED | `safetyPolicy.test.ts`, rules "youth safety", E2E |
| Guardian approval by signed email link, separate scopes, revoke | COMPLETED | `guardianFlow.test.mjs`, E2E guardian approval |
| Scout contact with minors only through ScoutX, guardian notified, trial co-approval | COMPLETED | `requestCenter.test.mjs`, rules trial tests |
| Minor display (first name + initial, youth label) | COMPLETED | `releaseCoverage.test.ts` |
| Lock-screen privacy (minors always generic, adults choose) | COMPLETED | `pushChain.test.mjs`, `notifyLinksRecovery.test.ts` |
| Privacy Center, consent records, 14 versioned legal documents in the app | COMPLETED; text LEGAL REVIEW REQUIRED | `legalContent.test.ts`, E2E Privacy Center |
| Legal translations | LEGAL REVIEW REQUIRED | English canonical; UI flagged `LEGAL_TRANSLATION_REVIEW_REQUIRED` |
| Media rights, visibility, moderation cases/actions/appeals, staff claims, audit log | COMPLETED | `moderation.test.mjs`, rules media tests |
| Reporting incl. "I appear in this video" | COMPLETED | E2E scout report, `moderation.test.mjs` |
| Chunked resumable upload, dedupe, quotas, restart recovery | COMPLETED (emulator); real GCS on cellular NOT VALIDATED | `chunkedUpload.test.ts`, `uploads.test.mjs`, `notifyLinksRecovery.test.ts` |
| Quarantine and ffprobe validation (10/45/90/120 min, too long, corrupted, unsupported codec, not video) | COMPLETED | `uploads.test.mjs` with `ffmpeg-static` fixtures |
| Malware scanning | NOT AVAILABLE | seam only, never claimed |
| Full-match analysis pipeline, Cloud Tasks workers, coverage and confidence | COMPLETED (emulator); production queues NOT VALIDATED | `analysisPipeline.test.*` |
| Computer vision (tracking, event detection) | NOT AVAILABLE | needs a GPU worker |
| AI privacy (`data_collection: deny`, `zdr: true`, server-only key, output validation) | COMPLETED; provider ZDR NOT VALIDATED | `aiCallables.test.mjs`, injection fixtures |
| Premium via RevenueCat, server-owned entitlement, quotas, never-paywalled list | COMPLETED (simulated webhook); purchases NOT VALIDATED | `entitlements.test.mjs`, `premium.test.ts`, E2E plan screen |
| RevenueCat SDK 10.12 client: `pitchproven` entitlement, Paywall, Customer Center, restore, error handling | COMPLETED (code); paywall and Customer Center on device NOT VALIDATED | `purchases.test.ts`; needs a development build |
| Deletion state machine, legal retention, no partial client fallback | COMPLETED; periods LEGAL REVIEW REQUIRED | `accountDeletion.test.mjs`, E2E teen deletion |
| Data export archive, privacy requests, retention cleanup | COMPLETED (emulator); production schedule and signed URLs NOT VALIDATED | `dataRights.test.mjs`, E2E Privacy Center |
| Movement sessions without location, km/miles | COMPLETED; on-device GPS NOT VALIDATED | `gpsIntelligence.test.ts` |
| Passport privacy preview, Discoverability Health, video-to-Passport chain | COMPLETED | `productLinks.test.ts`, `reelExport.test.mjs` |
| Guardian and report deep links, AASA | COMPLETED (resolver); universal links on device NOT VALIDATED | `notifyLinksRecovery.test.ts`, release gate AASA check |
| Privacy and security documentation, consistency and label matrices | COMPLETED; LEGAL REVIEW REQUIRED | `docs/privacy/`, `docs/security/`, `docs/compliance/` |
| Store metadata 13+ with UGC | COMPLETED; questionnaire LEGAL REVIEW REQUIRED | `store/listing.json`, release gate |
| Server-side recent sign-in for deletion | PARTIAL / SECURITY REVIEW REQUIRED | export enforces it; deletion relies on Firebase client re-auth |
| Dependency advisories | PARTIAL | `docs/security/dependency-audit.md` (fixes would downgrade Expo; not applied) |
| Backups and restore drill | EXTERNAL CONFIGURATION REQUIRED | `docs/security/disaster-recovery.md` |
| Independent security review / penetration test | SECURITY REVIEW REQUIRED | not performed |

## External configuration required before launch

1. Legal contacts (privacy, security, support) in `src/config/legalConfig.ts`; production builds are blocked until set.
2. SMTP provider for the Trigger Email extension.
3. Secrets: `GUARDIAN_LINK_SECRET`, `OPENROUTER_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `ADMIN_USER_IDS`, Apple Sign in keys. Env: `GUARDIAN_LINK_BASE_URL`, `CALLABLE_ALLOWED_ORIGINS` if a browser origin needs callables.
4. RevenueCat project (PitchProof): entitlement `pitchproven`, App Store products `monthly` and `yearly` in the current offering, a Paywall on that offering, Customer Center, webhook, and the production `appl_` key as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (production builds refuse `test_` keys). RevenueCat sandbox events currently grant premium like production events; decide whether to ignore them in production.
5. OpenRouter: confirm zero-data-retention providers exist for the chosen vision model.
6. Deploy Cloud Tasks queues (`extractMatchSegment`, `analyzeMatchFrames`, `buildDataExport`), the `signBlob` permission for signed URLs, Firestore indexes, functions, rules.
7. App Attest registration and App Check enforcement.
8. AASA on `scoutx.app` (both copies in `public/` now carry Team ID `833CYAZ8XT`).
9. Firestore point-in-time recovery / backups, if wanted, with matching privacy policy wording.
10. GPU CV worker (CV stays NOT AVAILABLE without it).
11. Real devices and real footage for validation; icon and splash artwork; working support URL.
12. Legal counsel review of all documents, retention periods, age thresholds for EU users, transfer safeguards and the App Store answers.

## NOT VALIDATED (needs devices, credentials or production)

Native iOS runtime (camera roll, GPS, background behaviour, playback), push to real devices,
universal links on device, large uploads on cellular, real AI responses, production signed URLs,
scheduled cleanup in production, RevenueCat purchases/restore/grace, App Check enforcement,
Sign in with Apple and Google on device.

## Known limitations

- On web, `Alert.alert` is a no-op, so confirmation dialogs (including the Settings account deletion
  confirmation) do not appear there. The release is iOS only; E2E covers deletion through the youth
  gate path, which has no dialog.
- Age is self-declared; there is no age assurance beyond that (accepted risk T1 in `docs/security/threat-model.md`).
