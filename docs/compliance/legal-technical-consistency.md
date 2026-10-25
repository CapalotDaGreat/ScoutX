# Legal / Technical Consistency Matrix

Each public claim in `legal/documents/` or the store listing, mapped to the code that makes it
true, the test that proves it, and the evidence state. A claim without code and a test must be
removed or changed, not left in place.

States: **PASS** (code + automated test), **PARTIAL** (code, no full test or depends on
configuration), **NOT VALIDATED**, **LEGAL REVIEW REQUIRED**.

## Local Legal-Page Review: 2026-10-22

The operator confirmed CML Electronics and the configured Swiss address. Launch countries and
the guardian-email provider have not been supplied. This review is not legal advice and not
legal approval. No policy deployment or new app submission is authorised by this work.

Nine revised notices are drafts with no approved effective date. Their minor version updates
clarify existing processing and controls; they do not enable new permissions or automatically
force re-acceptance. Before publication, counsel/owner must decide whether any change needs a
major version and fresh agreement, then coordinate app, generated server versions and website
deployment. The existing TestFlight IPA does not contain these later local text/UI changes.
The separate guardian-consent workflow version constants also need review when an approved
parental notice materially changes; this pass does not change the consent mechanism or permissions.

The shared generator now provides operator and account-deletion pages, fixes nested email
anchors, and renders safe HTTPS links. The in-app deletion confirmation in all seven locales
warns that Apple renewal must be cancelled separately without blocking immediate deletion.
The direct guardian page's AI explanation was aligned without changing its consent controls.

Validation: app/test TypeScript and ESLint passed; 528 unit tests passed; eight Chromium desktop/mobile
tests checked 21 generated pages, local links/anchors, keyboard skip access, review labels and
horizontal overflow, with no captured page-script errors. Support, privacy, legal-notice and
deletion screenshots were inspected. Legal generation parity, Functions TypeScript build and a
local production iOS JavaScript/Hermes export passed. The Functions compiler also refreshed tracked
`functions/lib/legal/legalVersions.generated.js`. No physical-device acceptance or fresh signed
archive was performed. Local browser checks are not evidence that the live site has been deployed.

Outstanding owner/counsel checks (do not treat copy edits as evidence of completion):

- Verify the legal form and any required proprietor, register/UID and VAT identifiers; no numbers
  were invented. Confirm `support@pitchproof.online` receives privacy, safety and support mail.
- Confirm launch territories and applicable FADP/GDPR/UK/US and consumer/online-platform duties,
  including any required EU/UK representative, DPO or country-specific notices.
- Verify actual recipient countries, SMTP identity, Sentry region/retention, signed processor
  agreements and transfer safeguards. An internal processor register is not a substitute for
  complete public disclosures; close these gaps before the corresponding processing launches.
- Validate the under-13 consent method against current local law and the revised COPPA rule
  where applicable, including AI/provider disclosures. A typed name and email confirmation are
  not a universal identity-verification or legal-compliance certification.
- Approve the necessity and lawful basis of the implemented two-/three-year retention periods,
  backup/restore arrangements and processor-side deletion. RevenueCat deletion is not automated
  by the existing in-app account-deletion job; agree and test the manual processor procedure.
- Verify actual Apple offers, trial/renewal terms, restore/account switching, standard versus
  custom EULA selection and store privacy labels against the candidate and console settings.
- Review canonical English wording and translations, moderation staffing/appeals, copyright
  notice requirements and any designated-agent or other territory-specific obligations.
- Verify distribution licences for fonts, icons and software dependencies and permissions for
  marketing footage. A generic copyright policy does not grant rights to third-party assets.

Reference authorities checked: [FDPIC cross-border guidance](https://www.edoeb.admin.ch/en/cross-border-transfer-of-personal-data),
[Apple privacy/review requirements](https://developer.apple.com/app-store/review/guidelines/),
[Apple account deletion guidance](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
and [FTC COPPA guidance](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions).
The FTC FAQ itself directs readers to the amended rule for current requirements.

| # | Claim (source) | Code | Test | State |
| --- | --- | --- | --- | --- |
| C1 | Under 13: private mode with verified parental consent (signed form plus confirmation email), deleted without consent after 14 days (privacy policy, terms, youth policy, guardian notice, retention) | `LEGAL_CONFIG.privateModeUntilAge`, `getUserSafetyPolicy().privateOnly`, `CHILD_SCOPES`, `isChild()` in `firestore.rules`, `respondGuardianConsent`, `deleteUnconsentedChildAccounts` | `safetyPolicy.test.ts`, rules "under-13 private mode", `guardianFlow.test.mjs` | PASS |
| C2 | Only an age band is stored, never a date of birth (privacy policy) | `userSafety.ageBand`; no DOB field in any model or rule | `safetyPolicy.test.ts`, rules "youth safety" | PASS |
| C3 | 13–17 need verified guardian approval before youth features (privacy policy, guardian notice) | `youthConsent.ts`, `guardianToken.ts`, `hasGuardianScope` in rules | `safetyPolicy.test.ts`, rules "youth safety", `guardianFlow.test.mjs`, E2E guardian approval | PASS |
| C4 | Guardian chooses each permission separately and can withdraw (guardian notice) | `YOUTH_SCOPES`, revoke link (400-day token) | `safetyPolicy.test.ts` | PASS |
| C5 | Minors shown with first name + last initial, "youth" label, no exact age (privacy policy) | `applyYouthDisplay` in `publicPassport.ts` | `tests/unit/releaseCoverage.test.ts` | PASS |
| C6 | Trials for 13–17 need guardian co-approval (terms) | `firestore.rules` `trialInvitations` | rules "minor trials need ... guardian co-approval" | PASS |
| C7 | Scouts contact minors only through PitchProof requests; guardian notified (youth policy) | `evidenceRequests.ts` `notifyGuardianOfScoutContact`; no messaging feature | `requestCenter.test.mjs` | PASS |
| C8 | Minors' notifications show no details on the lock screen (youth policy) | `lockScreenCopy`, `pushDelivery.ts` | `pushChain.test.mjs` "lock-screen privacy" | PASS |
| C9 | PitchProof does not train AI on user data; requests require no-training/ZDR routing, which is not an independent provider audit (AI/privacy drafts) | `PROVIDER_PRIVACY` on every OpenRouter request; footage privacy-approval gate | `aiCallables.test.mjs`, `analysisPipeline.test.mjs`, `legalContent.test.ts` | PARTIAL: contracts, endpoint countries and provider-side ZDR NOT VALIDATED; LEGAL REVIEW REQUIRED |
| C10 | Movement sessions store no location; available to all ages (privacy policy) | `gpsTrackingService.ts` (in-memory origin, relative metres), `canRecordMovement`, background location off in `app.json` | `gpsIntelligence.test.ts`, `safetyPolicy.test.ts` | PASS (code); on-device NOT VALIDATED |
| C11 | Upload checks are not a malware scan (video policy) | `mediaScanner.ts` noop, `not_scanned` | `uploads.test.mjs` | PASS |
| C12 | Files failing checks are rejected and deleted (video policy, retention policy) | `quarantine.ts` rejection deletes bytes | `uploads.test.mjs` | PASS |
| C13 | Abandoned/failed uploads deleted within 7 days (retention policy) | `RETENTION.failedUploadDays`, `UPLOAD_LIMITS.abandonAfterDays`, cleanup jobs | `dataRights.test.mjs`, `uploads.test.mjs` | PASS (emulator); production schedule NOT VALIDATED |
| C14 | Export archive available for 7 days (data subject rights) | `dataExport.ts`, `RETENTION.exportDays` | `dataRights.test.mjs` | PASS (emulator); production signed URL NOT VALIDATED |
| C15 | Account deletion removes your data; some proof kept minimised (privacy policy, retention policy) | `accountDeletion.ts`, `legalRetention.ts`; the app never falls back to a partial client-side deletion when the server is unreachable (`appleTokenPersistenceService.ts`) | `accountDeletion.test.mjs`, E2E "a waiting 13-17 player can delete their account" | PASS; periods LEGAL REVIEW REQUIRED |
| C16 | Safety, deletion, privacy, reporting, guardian controls, match logging and basic development are never paywalled (subscription terms) | `NEVER_PAYWALLED`; quota checks only on metered features | `premium.test.ts`, `entitlements.test.mjs` | PASS |
| C17 | Apple billing, cancellation separate from account deletion, restore guidance (subscription draft and deletion page) | RevenueCat + StoreKit; all seven deletion-confirmation locales | `legalContent.test.ts`, `legal-pages.spec.ts` | Copy/link checks PASS; real sandbox purchase/restore/cancellation NOT VALIDATED |
| C18 | Access rules on every collection and storage path (privacy policy) | `firestore.rules`, `storage.rules` with deny-all fallback | rules suites | PASS |
| C19 | Encryption in transit and at rest by our cloud provider (privacy, security policy) | Google Cloud default | n/a (provider property) | PARTIAL: provider statement, not tested here |
| C20 | No configured custom backup schedule or unverified backup-expiry promise (retention draft) | No backups configured by this repo | source/config review | LEGAL REVIEW REQUIRED: owner must verify actual recovery settings, expiry and restore deletion handling |
| C21 | No advertising, analytics or cross-app tracking SDKs (privacy policy) | `package.json`; `NSPrivacyTracking: false` | release gate dependency check | PASS |
| C22 | Optional crash/performance diagnostics use redaction, not a guarantee of anonymity (privacy/cookie drafts) | `sentry.ts` `sendDefaultPii: false`, sampled traces, `scrubUnknownData` | code review and legal wording tests | PARTIAL: provider region/retention and release diagnostics NOT VALIDATED |
| C23 | PitchProof guarantees no trials or contracts (terms); no "get discovered" promise (store listing) | Copy in app and `store/listing.json` | release gate store check | PASS |
| C24 | Every Passport item shows its source; self-reported data is not "verified" (store listing) | Evidence source labels | `dataTruth.test.ts`, `evidenceGraph.test.ts` | PASS |
| C25 | Computer vision tracking is not available (AI policy, app) | `cvWorker.ts` NOT_AVAILABLE | `matchAnalysisHonesty.test.ts` | PASS |
| C26 | Contacts for privacy, security, legal | `LEGAL_CONFIG.contacts` (all `support@pitchproof.online`) | `legalContent.test.ts`, release gate | CONSISTENT; mail routing via Cloudflare to be confirmed with a test mail |
| C27 | Translations of legal documents | English canonical; UI translations flagged `LEGAL_TRANSLATION_REVIEW_REQUIRED` | `legalContent.test.ts` | LEGAL REVIEW REQUIRED |
| C29 | Anyone can report a video they appear in (reporting policy) | `TrustSafetyActions` with the Passport report on the public Passport and the scout player view | E2E "a scout reports a Passport video" | PASS |
| C28 | Universal links for reports; guardian approval only on the web | AASA maps `/report/*`, not `/guardian`; `GuardianLinkScreen` opens the browser | `notifyLinksRecovery.test.ts` | PASS (resolver); on-device NOT VALIDATED |

## Documented deviation

The plan named the report deep link `report/:mediaId`. It is implemented as
`report/:ownerId/:mediaId` because the report callable verifies the claimed owner of the media;
a media id alone is not globally unique in `players/{uid}/media`.
