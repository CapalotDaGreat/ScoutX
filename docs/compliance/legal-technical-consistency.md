# Legal / Technical Consistency Matrix

Each public claim in `legal/documents/` or the store listing, mapped to the code that makes it
true, the test that proves it, and the evidence state. A claim without code and a test must be
removed or changed, not left in place.

States: **PASS** (code + automated test), **PARTIAL** (code, no full test or depends on
configuration), **NOT VALIDATED**, **LEGAL REVIEW REQUIRED**.

| # | Claim (source) | Code | Test | State |
| --- | --- | --- | --- | --- |
| C1 | Minimum age 13; under-13 blocked (privacy policy, terms, youth policy) | `LEGAL_CONFIG.minimumAge`, `getUserSafetyPolicy().blocked`, age-band onboarding | `safetyPolicy.test.ts` | PASS |
| C2 | Only an age band is stored, never a date of birth (privacy policy) | `userSafety.ageBand`; no DOB field in any model or rule | `safetyPolicy.test.ts`, rules "youth safety" | PASS |
| C3 | 13–17 need verified guardian approval before youth features (privacy policy, guardian notice) | `youthConsent.ts`, `guardianToken.ts`, `hasGuardianScope` in rules | `safetyPolicy.test.ts`, rules "youth safety", `guardianFlow.test.mjs`, E2E guardian approval | PASS |
| C4 | Guardian chooses each permission separately and can withdraw (guardian notice) | `YOUTH_SCOPES`, revoke link (400-day token) | `safetyPolicy.test.ts` | PASS |
| C5 | Minors shown with first name + last initial, "youth" label, no exact age (privacy policy) | `applyYouthDisplay` in `publicPassport.ts` | `tests/unit/releaseCoverage.test.ts` | PASS |
| C6 | Trials for 13–17 need guardian co-approval (terms) | `firestore.rules` `trialInvitations` | rules "minor trials need ... guardian co-approval" | PASS |
| C7 | Scouts contact minors only through ScoutX requests; guardian notified (youth policy) | `evidenceRequests.ts` `notifyGuardianOfScoutContact`; no messaging feature | `requestCenter.test.mjs` | PASS |
| C8 | Minors' notifications show no details on the lock screen (youth policy) | `lockScreenCopy`, `pushDelivery.ts` | `pushChain.test.mjs` "lock-screen privacy" | PASS |
| C9 | We do not train AI on your data; data collection denied, ZDR required (AI policy, privacy policy) | `PROVIDER_PRIVACY` on every OpenRouter request | `aiCallables.test.mjs`, `analysisPipeline.test.mjs` | PARTIAL: provider-side ZDR NOT VALIDATED; LEGAL REVIEW REQUIRED |
| C10 | Movement sessions store no location; available to all ages (privacy policy) | `gpsTrackingService.ts` (in-memory origin, relative metres), `canRecordMovement`, background location off in `app.json` | `gpsIntelligence.test.ts`, `safetyPolicy.test.ts` | PASS (code); on-device NOT VALIDATED |
| C11 | Upload checks are not a malware scan (video policy) | `mediaScanner.ts` noop, `not_scanned` | `uploads.test.mjs` | PASS |
| C12 | Files failing checks are rejected and deleted (video policy, retention policy) | `quarantine.ts` rejection deletes bytes | `uploads.test.mjs` | PASS |
| C13 | Abandoned/failed uploads deleted within 7 days (retention policy) | `RETENTION.failedUploadDays`, `UPLOAD_LIMITS.abandonAfterDays`, cleanup jobs | `dataRights.test.mjs`, `uploads.test.mjs` | PASS (emulator); production schedule NOT VALIDATED |
| C14 | Export archive available for 7 days (data subject rights) | `dataExport.ts`, `RETENTION.exportDays` | `dataRights.test.mjs` | PASS (emulator); production signed URL NOT VALIDATED |
| C15 | Account deletion removes your data; some proof kept minimised (privacy policy, retention policy) | `accountDeletion.ts`, `legalRetention.ts`; the app never falls back to a partial client-side deletion when the server is unreachable (`appleTokenPersistenceService.ts`) | `accountDeletion.test.mjs`, E2E "a waiting 13-17 player can delete their account" | PASS; periods LEGAL REVIEW REQUIRED |
| C16 | Safety, deletion, privacy, reporting, guardian controls, match logging and basic development are never paywalled (subscription terms) | `NEVER_PAYWALLED`; quota checks only on metered features | `premium.test.ts`, `entitlements.test.mjs` | PASS |
| C17 | Subscriptions billed by Apple, cancellable in Apple ID settings (subscription terms) | RevenueCat + StoreKit | none | NOT VALIDATED (needs products) |
| C18 | Access rules on every collection and storage path (privacy policy) | `firestore.rules`, `storage.rules` with deny-all fallback | rules suites | PASS |
| C19 | Encryption in transit and at rest by our cloud provider (privacy, security policy) | Google Cloud default | n/a (provider property) | PARTIAL: provider statement, not tested here |
| C20 | Encrypted backups may exist (retention policy) | No backups configured | n/a | LEGAL REVIEW REQUIRED: align wording with `docs/security/disaster-recovery.md` |
| C21 | No advertising, analytics or cross-app tracking SDKs (privacy policy) | `package.json`; `NSPrivacyTracking: false` | release gate dependency check | PASS |
| C22 | Crash reports scrubbed (privacy policy) | `sentry.ts` `sendDefaultPii: false`, `scrubUnknownData` | code review only | PARTIAL |
| C23 | ScoutX guarantees no trials or contracts (terms); no "get discovered" promise (store listing) | Copy in app and `store/listing.json` | release gate store check | PASS |
| C24 | Every Passport item shows its source; self-reported data is not "verified" (store listing) | Evidence source labels | `dataTruth.test.ts`, `evidenceGraph.test.ts` | PASS |
| C25 | Computer vision tracking is not available (AI policy, app) | `cvWorker.ts` NOT_AVAILABLE | `matchAnalysisHonesty.test.ts` | PASS |
| C26 | Contacts for privacy, security, legal | `LEGAL_CONFIG.contacts` (all null, shown as `LEGAL_CONTACT_REQUIRED`) | `legalContent.test.ts`, release gate | EXTERNAL CONFIGURATION REQUIRED; production build blocked until set |
| C27 | Translations of legal documents | English canonical; UI translations flagged `LEGAL_TRANSLATION_REVIEW_REQUIRED` | `legalContent.test.ts` | LEGAL REVIEW REQUIRED |
| C29 | Anyone can report a video they appear in (reporting policy) | `TrustSafetyActions` with the Passport report on the public Passport and the scout player view | E2E "a scout reports a Passport video" | PASS |
| C28 | Universal links for reports; guardian approval only on the web | AASA maps `/report/*`, not `/guardian`; `GuardianLinkScreen` opens the browser | `notifyLinksRecovery.test.ts` | PASS (resolver); on-device NOT VALIDATED |

## Documented deviation

The plan named the report deep link `report/:mediaId`. It is implemented as
`report/:ownerId/:mediaId` because the report callable verifies the claimed owner of the media;
a media id alone is not globally unique in `players/{uid}/media`.
