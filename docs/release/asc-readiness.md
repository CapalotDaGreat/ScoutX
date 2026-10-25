# App Store Connect Readiness

Date: 2026-10-22. This report covers repository changes and observed local checks. It does not
certify the production backend, remote EAS variables, a signed iOS archive, or physical devices.
No production deployment, purchase, account creation, or store submission was performed.

## Connection And Build Follow-Up

- Production candidate **1.0.0 (4)** successfully built and signed on EAS, build ID
  `554e311b-541e-41dc-a01e-6a39fde4ed26`. The corrected Firebase configuration passed the native
  archive. TypeScript, ESLint, all 523 unit tests, and decoded Firebase configuration parity passed.
- The operator configured the separate App Store Connect API key in EAS. EAS accepted it for app
  `6820059284` and scheduled submission `24509ed4-34e9-488a-911e-51172d9aaf1b`, creating internal
  TestFlight group `Team (Expo)`. Last observed submission state: `IN_QUEUE`, no error. Apple has
  not yet listed build 4 in TestFlight. A scheduled submission is not a completed Apple upload.
- Native-device acceptance, sandbox purchase/restore, App Check verification on a real device,
  and the webhook Authorization header/test event remain required and are not inferred from build success.
- Expo MCP successfully read the iOS build history. RevenueCat MCP and CLI OAuth completed successfully.
- Firebase CLI has a signed-in account. EAS production has the six Firebase public variables and
  a secret `GOOGLE_SERVICES_PLIST` file variable. The verified PitchProof App Store public SDK key
  is now configured as sensitive `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in EAS production.
- RevenueCat project `projda6be3c6`, App Store app `app0bd584d430`, and bundle `com.scoutx.app`
  match. Both Apple credential types are configured. Monthly/yearly products are attached to
  `pitchproven` and the matching `$rc_monthly`/`$rc_annual` packages in the current `default`
  offering, which has a paywall. Actual StoreKit purchases and Customer Center remain unvalidated.
- Created webhook `whintgrd0c9dd042b` for the App Store app at the deployed `revenueCatWebhook`
  function in `europe-west6`. Both sandbox and production events are selected, matching the
  existing backend policy. The deployed endpoint correctly rejects unauthenticated POSTs with 401.
  RevenueCat's API cannot configure its Authorization header: the operator must set `Bearer ` plus
  the existing Firebase `REVENUECAT_WEBHOOK_SECRET` in the dashboard and verify a test event returns
  200. Until then, server-side entitlement synchronization is not operational.
- Attempted a production EAS build with frozen credentials and non-interactive mode. All expected
  production variable names loaded, but EAS stopped because distribution signing is not set up.
  No cloud build was queued. EAS advanced the reserved iOS build number from 1 to 2 before stopping.
  Complete `npx eas-cli credentials:configure-build -p ios --profile production` interactively,
  then retry the build. Signing, signed entitlements, and TestFlight submission remain unvalidated.
- After the operator completed Apple sign-in, EAS accepted the production distribution certificate
  and active provisioning profile for `com.scoutx.app`, team `833CYAZ8XT`, expiring October 22, 2027.
  Non-interactive mode did not revalidate these assets with Apple servers. Production build 1.0.0 (3)
  is being uploaded. Apple app ID `6820059284`, supplied by the operator, is now configured in the
  production submit profile. A successful signed archive and TestFlight processing are still pending.
- Build 1.0.0 (3), EAS ID `5d2948f5-7364-43bb-909a-19a845ec7e39`, failed in RNFirebase's
  Core Configuration shell script. It interpolates the entire root `firebase.json` into a Ruby
  single-quoted string; hosting CSP apostrophes and the regex backslash broke this valid JSON.
  Those characters now use JSON Unicode escapes, preserving the decoded backend configuration.
  A regression test guards Ruby-safe serialization and the original regex/security policies.
  No signed artifact was produced by this attempt.
- The previous development build `787b7a16-d0d7-43c7-b9f8-0178fab977f7` failed compiling
  `GACRecaptchaProvider`. RNFirebase 25.1.0 defaults to affected Firebase iOS 12.15.0.
  EAS profiles now set RNFirebase's supported `FIREBASE_SDK_VERSION` override to 12.18.0,
  whose source includes the upstream Swift-availability guard. This does not disable App Attest.
  See the [Firebase fix](https://github.com/firebase/firebase-ios-sdk/pull/16479).
- The override still requires validation in a new signed EAS archive; local JavaScript checks
  do not establish CocoaPods/Xcode compatibility. Revisit it when upgrading RNFirebase.
- Follow-up checks passed: TypeScript, ESLint, all 522 unit tests, diff whitespace validation,
  and native configuration introspection (correct bundle ID, plist and production App Attest).
- Firebase CLI successfully listed the existing PitchProof iOS app (`com.scoutx.app`).

## Changes

- Fixed Firebase static framework configuration when `expo-build-properties` is already present;
  preserved existing iOS/Android plugin options and deduplicated required static pods.
- Added the App Attest production entitlement. The Firebase config plugin only edits AppDelegate;
  it does not add this entitlement. See [Firebase setup](https://firebase.google.com/docs/app-check/ios/app-attest-provider).
- Added shared production build checks for missing Firebase values, native Firebase plist and
  RevenueCat App Store key; blocked debug tokens, disabled attestation, Expo Go, emulator/demo/mock
  settings, client AI secrets, disabled TLS verification and legal-placeholder overrides.
- Production runtime always selects real attestation and never returns debug tokens, even if a
  stale public environment flag is present. EAS explicitly selects its production environment.
- Corrected native dev-client environment precedence over generated Expo Go defaults.
- Removed a rejected TLS environment key from the local environment generator and the web-runner
  bypass. No TLS verification was disabled.
- Bounded unit-test and web bundler workers; excluded backend/Python/generated artifacts from Metro.
- Made manual acceptance failures block the release gate and added a production-environment check.
- Aligned review instructions with under-13 private mode and the limited, sampled-frame AI mode.

## Local Checks

| Check | Observed result |
| --- | --- |
| TypeScript (app and tests) | PASS |
| ESLint | PASS |
| Unit tests | PASS: 521, no failures or skips |
| Cloud Functions TypeScript build | PASS |
| Firebase rules/callables suite | PASS: 232, no failures or skips |
| Reference CV worker tests | PASS: 25; one upstream FastAPI/TestClient deprecation warning |
| Legal content generation parity | PASS |
| Expo dependency compatibility | PASS in offline mode; not a fresh remote SDK recommendation |
| Native config introspection | PASS: Firebase static frameworks and App Attest entitlement present |
| iOS production JavaScript/Hermes export | PASS; native mode, two workers, clean bundler cache |
| Guest-entry/public-Passport E2E | PASS: 12 across desktop and mobile browser viewports |
| Authenticated emulator E2E | PASS: 23, including under-13 parental consent, teen deletion, upload and scout flows |
| npm audit (app / Functions) | Findings remain: app 34 high + 6 moderate; Functions 9 moderate; no critical |
| Static public release gate (`--skip-tests`) | BLOCKED: 0 code blockers, 4 external, 4 unvalidated; rules suite passed separately |
| Signed Xcode archive / physical device acceptance | NOT VALIDATED: requires EAS/Apple credentials and devices |

Raw logs and bundle output are in gitignored `.local/asc-*` files. Build diagnostics report variable
names, never their values. The rules suite needed local network access outside the sandbox. The
worker suite also passed outside the sandbox after its TestClient setup stalled inside it.
The fresh npm audit succeeded using Windows system CA trust; TLS verification was never disabled.
See `docs/security/dependency-audit.md` for the affected dependency trees and pending SEC-14 decision.

## External Console Checklist

### Expo / EAS

- Production environment: set the six `EXPO_PUBLIC_FIREBASE_*` values from the intended Firebase
  project and an EAS file variable `GOOGLE_SERVICES_PLIST` containing that project's iOS app config.
  Its bundle ID must be `com.scoutx.app`. The JS Firebase config and native plist must use the same
  project. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` to the RevenueCat App Store `appl_` key.
- Remove debug tokens, mock/demo/emulator flags, client OpenRouter keys, legal overrides, and
  TLS-verification overrides. `eas.json` supplies native mode and enabled App Check.
- Confirm distribution signing, Apple team `833CYAZ8XT`, and APNs credentials for push notifications.
- Build with `npx eas-cli build -p ios --profile production`, inspect the actual Xcode/iOS SDK
  versions in its logs, and distribute the resulting candidate through TestFlight. A Metro export
  is not an Xcode archive. Apple's current minimum is Xcode 26 / iOS 26 SDK:
  [SDK requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a).

### Firebase / Google Cloud

- Confirm Blaze billing/budget alerts and deployed Firestore/Storage rules, indexes, Cloud Functions,
  Hosting and Cloud Tasks handlers in `europe-west6`. Historical provisioning notes are not a
  current smoke test. Verify required APIs, OIDC-only task invokers and task service-account access.
- Authentication: enable Email/Password and Apple. Configure Google only if offered. Verify auth
  action-link domains and Apple revocation credentials (`APPLE_TEAM_ID`, `APPLE_KEY_ID`,
  `APPLE_PRIVATE_KEY`). Do not substitute an ASC API key for a Sign in with Apple key.
- App Check: register App Attest and DeviceCheck fallback for the correct iOS app. Enable the App
  Attest capability/provisioning in Apple Developer if EAS capability synchronization requires it.
  Verify successful tokens/callables from TestFlight. Do not disable `ENFORCE_APP_CHECK` to mask errors.
- Confirm `GUARDIAN_LINK_SECRET` (32+ characters), `REVENUECAT_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`
  and real staff UIDs in `ADMIN_USER_IDS`; verify staff access to moderation cases and appeals.
- Install/configure Trigger Email on `mail`, SMTP sender credentials and SPF/DKIM/DMARC. Exercise
  guardian approval, confirmation, withdrawal, trial co-approval and contact notifications with real mail.
- Verify signed exports (`iam.serviceAccounts.signBlob`), scheduled retention/deletion cleanup,
  bucket lifecycle rules and production error monitoring. Configure backups and perform a restore
  drill, including the treatment of previously deleted accounts.

### App Store Connect / Apple Developer

- Confirm App ID `com.scoutx.app`, Apple sign-in, App Attest, associated domains and push capabilities
  in the distribution profile. Inspect signed entitlements in the actual archive.
- Complete agreements, tax/banking information if applicable, subscription group, availability,
  pricing, localized metadata and review screenshots for `PitchProven_Monthly` and
  `PitchProven_Yearly`. Attach first subscriptions to the app version for review.
- Complete accurate privacy and age-rating questionnaires, export-compliance answers and applicable
  business/trader information. A desired repository rating of 4+ is not a guaranteed ASC result.
  Declare user-generated content and structured contact; the app is not in the Kids Category.
- Upload screenshots of the real candidate and fill reviewer credentials directly in ASC. Use adult,
  permitted teen, scout and coach accounts with lawful sample data. Do not commit credentials.
  Fill remaining template fields in `app-review-notes.md` and attach an actual device recording.
- Align store claims, review notes and screenshots with enabled functionality. Continuous player
  tracking/event detection remain unavailable without the separate CV evaluation and approval.

### RevenueCat

- Connect the correct App Store app and products to entitlement `pitchproven`; publish the current
  offering (`$rc_monthly`, `$rc_annual`), Paywall and Customer Center.
- Configure the authenticated webhook at
  `https://europe-west6-scoutx-230b0.cloudfunctions.net/revenueCatWebhook` and verify delivery to the
  correct Firebase UID/entitlement. Decide explicitly how sandbox events should be handled.
- Test sandbox purchase, restoration, pending transactions, expiry and account switching in TestFlight.

### AI, Hosting, Support And Monitoring

- Complete the provider privacy/retention review, including footage of minors, and confirm an
  allowed model has zero-retention endpoints. Only then set `AI_FOOTAGE_PROCESSING_APPROVED=true`.
  Otherwise keep processing disabled and remove any launch promise that requires it.
- Verify live `/privacy/`, `/support/`, `/terms/`, guardian pages and both AASA endpoints on
  `pitchproof.online`, including TLS, JSON content type and correct Team ID. Test universal links.
- Confirm `support@pitchproof.online` receives mail and that moderation/security queues are staffed.
- If enabling Sentry, supply its DSN, configure retention/region, upload source maps with a private
  build token (production currently disables automatic upload), and verify a scrubbed release crash.

## Human Acceptance Still Required

Complete the physical iPhone/iPad compatibility, VoiceOver/Dynamic Type, offline/recovery, GPS,
video, push, purchases and deletion matrix with build number, device, tester and date. Automated
browser/emulator results must not be copied into native-device rows. Obtain counsel review and
named owner decisions for the seven pending security residuals in `owner-acceptance.md`.

The public release gate must remain blocked while these are unresolved; do not delete rows or
mark them passed merely to obtain a green command. `--allow-external` is an internal evaluation
mode, not public-release approval.
