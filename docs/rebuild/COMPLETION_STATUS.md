# PitchProof Completion Status

Updated 2026-10-08 at the end of Phase 14 (production hardening, security review, external
configuration, release readiness). Initial release target: iOS only.

Overall: technically release candidate; external, legal and security validation remains.

States: **COMPLETED** (implemented and covered by automated tests in this repo), **PARTIAL**,
**NOT AVAILABLE** (deliberately not offered), **NOT VALIDATED** (implemented; needs devices,
credentials or production to verify), **LEGAL REVIEW REQUIRED**, **SECURITY REVIEW REQUIRED**,
**EXTERNAL CONFIGURATION REQUIRED**.

## Regression gate

| Check | Result |
| --- | --- |
| `npm run typecheck` (app + tests) | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 386 tests |
| `npm run test:rules` (Firestore, Storage, callables, push, deletion, deletion recent-auth, uploads with ffprobe fixtures, analysis, entitlements, data rights, guardian flow, football sources) | PASS, 197 tests |
| i18n parity across en, de, fr, es, it, nl, pt | PASS |
| `npm run legal:check` | PASS |
| `npm run test:e2e:emulators` (Auth, Firestore, Storage, Functions, Cloud Tasks emulators) | PASS, 22 tests |
| `node scripts/release-gate.mjs --allow-external` (internal / TestFlight) | PASS, 0 CODE BLOCKERs |
| `node scripts/release-gate.mjs` (public release) | BLOCKED: 2 EXTERNAL CONFIGURATION REQUIRED (AI footage approval, backups), 0 LEGAL REVIEW REQUIRED, 2 NOT VALIDATED |

## Program matrix

| Area | State | Evidence / note |
| --- | --- | --- |
| Security blockers (client AI key, rules hardening, CORS, App Check wiring) | COMPLETED | release gate, rules suites, `callableCors.test.ts` |
| Age gate, age band only, under-13 private mode with parental consent (signed form plus confirmation email) | COMPLETED (legal text not lawyer-reviewed) | `safetyPolicy.test.ts`, rules "under-13 private mode", `guardianFlow.test.mjs` |
| Guardian approval by signed email link, separate scopes, revoke | COMPLETED | `guardianFlow.test.mjs`, E2E guardian approval |
| Scout contact with minors only through PitchProof, guardian notified, trial co-approval | COMPLETED | `requestCenter.test.mjs`, rules trial tests |
| Minor display (first name + initial, youth label) | COMPLETED | `releaseCoverage.test.ts` |
| Lock-screen privacy (minors always generic, adults choose) | COMPLETED | `pushChain.test.mjs`, `notifyLinksRecovery.test.ts` |
| Privacy Center, consent records, 14 versioned legal documents in the app | COMPLETED; reviewed, effective 2026-10-08 | `legalContent.test.ts`, E2E Privacy Center |
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
| Deletion state machine, legal retention, no partial client fallback | COMPLETED; periods approved 2026-10-08 | `accountDeletion.test.mjs`, E2E teen deletion |
| Data export archive, privacy requests, retention cleanup | COMPLETED (emulator); production schedule and signed URLs NOT VALIDATED | `dataRights.test.mjs`, E2E Privacy Center |
| Movement sessions without location, km/miles | COMPLETED; on-device GPS NOT VALIDATED | `gpsIntelligence.test.ts` |
| External football source links (link only: allowlisted HTTPS hosts, private by default, Passport/scout sharing under guardian rules, reporting, export, deletion; no fetching, scraping or import) | COMPLETED; provider list LEGAL REVIEW REQUIRED | `footballSources.test.ts`, `footballSources.test.mjs`, E2E football sources, release gate link-only check, `docs/compliance/external-football-sources.md` |
| Passport privacy preview, Discoverability Health, video-to-Passport chain | COMPLETED | `productLinks.test.ts`, `reelExport.test.mjs` |
| Guardian and report deep links, AASA | COMPLETED (resolver); universal links on device NOT VALIDATED | `notifyLinksRecovery.test.ts`, release gate AASA check |
| Privacy and security documentation, consistency and label matrices | COMPLETED; LEGAL REVIEW REQUIRED | `docs/privacy/`, `docs/security/`, `docs/compliance/` |
| Store metadata 4+ with UGC and under-13 private mode | COMPLETED; questionnaire to confirm in App Store Connect | `store/listing.json`, release gate |
| Server-side recent sign-in for deletion | COMPLETED; anonymous and resume policy await owner acceptance | `deletionAuth.test.mjs`, `deletionAuth.test.ts`; client re-auth for password / Apple / Google; no local fallback |
| Guardian links: transactional single use, 32-character secret minimum, re-approval when a minor's trial changes | COMPLETED | `guardianFlow.test.mjs` |
| Trial notifications to minors need `scout_contact` | COMPLETED | `firestore.rules.test.mjs` |
| AI footage processing gate (`AI_FOOTAGE_PROCESSING_APPROVED`) | COMPLETED (code); provider review AI_PRIVACY_CONFIGURATION_REQUIRED | `aiPrivacyGate.test.ts` |
| OpenRouter timeout, typed failures, HTTPS-only base URL, neutral error copy | COMPLETED | `aiPrivacyGate.test.ts` |
| Release gate categories (CODE BLOCKER / EXTERNAL / LEGAL REVIEW / NOT VALIDATED) | COMPLETED | `scripts/release-gate.mjs` |
| Phase 14 adversarial self-review | COMPLETED; 7 residual risks need owner acceptance | `docs/security/security-findings.md` |
| Threat models (general, minor safety, privacy), validation matrix, release configuration checklist, cost audit, translations, backups | COMPLETED (documents) | `docs/security/`, `docs/release/`, `docs/compliance/translations.md` |
| Dependency advisories | PARTIAL | `docs/security/dependency-audit.md` (fixes would downgrade Expo; not applied) |
| Backups and restore drill | EXTERNAL CONFIGURATION REQUIRED (BACKUP_CONFIGURATION_REQUIRED) | `docs/security/backups.md`; post-restore deletion replay script not written yet |
| Independent security review / penetration test | SECURITY REVIEW REQUIRED | not performed |

## External configuration required before launch

Full list by area: `docs/release/release-configuration-checklist.md`.

0. AI provider privacy review, then `AI_FOOTAGE_PROCESSING_APPROVED=true` (video analysis is refused until then).
1. Done: legal contacts are `support@pitchproof.online`; Cloudflare Email Routing to the owner's mailbox must be confirmed with a test mail.
2. SMTP provider for the Trigger Email extension.
3. Secrets: `GUARDIAN_LINK_SECRET` (32+ characters), `OPENROUTER_API_KEY`, `REVENUECAT_WEBHOOK_SECRET`, `ADMIN_USER_IDS`, Apple Sign in keys. Env: `GUARDIAN_LINK_BASE_URL`, `CALLABLE_ALLOWED_ORIGINS` if a browser origin needs callables.
4. RevenueCat project (PitchProof): entitlement `pitchproven`, App Store products `PitchProven_Monthly` and `PitchProven_Yearly` (subscription group PitchProven) in the current offering, a Paywall on that offering, Customer Center, webhook, and the production `appl_` key as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (production builds refuse `test_` keys). RevenueCat sandbox events currently grant premium like production events; decide whether to ignore them in production.
5. OpenRouter: confirm zero-data-retention providers exist for the chosen vision model.
6. Deploy Cloud Tasks queues (`extractMatchSegment`, `analyzeMatchFrames`, `buildDataExport`), the `signBlob` permission for signed URLs, Firestore indexes, functions, rules.
7. App Attest registration and App Check enforcement.
8. AASA on `pitchproof.online` (both copies in `public/` now carry Team ID `833CYAZ8XT`).
9. Firestore point-in-time recovery / backups, if wanted, with matching privacy policy wording.
10. GPU CV worker (CV stays NOT AVAILABLE without it).
11. Real devices and real footage for validation; icon and splash artwork; working support URL.
12. Legal counsel review of all documents, retention periods, age thresholds for EU users, transfer safeguards and the App Store answers.

## NOT VALIDATED (needs devices, credentials or production)

Row-by-row list with test plans: `docs/release/validation-matrix.md`.

Native iOS runtime (camera roll, GPS, background behaviour, playback), push to real devices,
universal links on device, large uploads on cellular, real AI responses, production signed URLs,
scheduled cleanup in production, RevenueCat purchases/restore/grace, App Check enforcement,
Sign in with Apple and Google on device.

## Known limitations

- With `AI_FOOTAGE_PROCESSING_APPROVED` unset, video analysis is unavailable in production. If the
  store listing or review notes advertise AI video analysis, either finish the provider review
  before submission or describe the feature as coming later (App Review 2.1 / 2.3 risk).
- On web, `Alert.alert` is a no-op, so confirmation dialogs (including the Settings account deletion
  confirmation) do not appear there. The release is iOS only; E2E covers deletion through the youth
  gate path, which has no dialog.
- Age is self-declared; there is no age assurance beyond that (accepted risk T1 in `docs/security/threat-model.md`).
