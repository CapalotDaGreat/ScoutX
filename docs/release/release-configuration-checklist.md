# Release Configuration Checklist

Everything here lives outside the repository (consoles, secrets, DNS, contracts). No value below is
filled in by the code; `CONFIG_REQUIRED` means "nobody has provided this yet". Never commit any of
these values. Step-by-step console instructions are in `app-store-submission-checklist.md`.

Owner decisions that the code deliberately does not make: legal contacts, retention periods,
jurisdiction and legal basis, legal translations, pricing, AI provider acceptance, backup sufficiency,
acceptance of open security findings.

## Environment separation

| Environment | Firebase project | RevenueCat key | AI footage | Notes |
| --- | --- | --- | --- | --- |
| Local / CI | `demo-scoutx` (emulators only) | none or `test_` in gitignored `.env` | allowed (emulator) | `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` |
| Development builds | CONFIG_REQUIRED (a separate dev project is recommended) | `test_` key | off unless approved | |
| Production (TestFlight, App Store) | `scoutx-230b0` | `appl_` key (production builds refuse `test_`) | off until `AI_FOOTAGE_PROCESSING_APPROVED=true` | `eas.json` production profile |

Production builds also refuse `EXPO_PUBLIC_OPENROUTER_API_KEY` and mock data (`app.config.ts`,
release gate). Test accounts, demo data and emulator hosts must never point at production.

## LEGAL

- [ ] `privacyEmail`, `securityEmail`, `supportEmail` in `src/config/legalConfig.ts` (currently PRIVACY_CONTACT_REQUIRED / SECURITY_CONTACT_REQUIRED / LEGAL_CONTACT_REQUIRED; production builds are blocked until set)
- [ ] Counsel review of all documents in `legal/documents/` and of the effective date
- [ ] Retention periods in `docs/privacy/retention-matrix.md` (LEGAL REVIEW REQUIRED)
- [ ] Legal basis, jurisdiction, EU age-of-consent thresholds, international transfer safeguards
- [ ] Legal translations (English is canonical; see `docs/compliance/translations.md`)
- [ ] App Store privacy answers match `docs/compliance/app-store-privacy-labels.md`

Legal entity (fixed): CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland.

## SECURITY

- [ ] Owner acceptance of open findings in `docs/security/security-findings.md`
- [ ] Independent security review / penetration test (not performed)
- [ ] `ADMIN_USER_IDS` secret: real staff uids only (CONFIG_REQUIRED)

## FIREBASE

- [ ] Enable Firestore, Cloud Functions, Cloud Tasks, Secret Manager, Eventarc APIs on `scoutx-230b0`
- [ ] Deploy `firestore.rules`, `storage.rules`, `firestore.indexes.json`, functions, hosting
- [ ] Secrets: `GUARDIAN_LINK_SECRET` (32+ random characters), `REVENUECAT_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `ADMIN_USER_IDS`
- [ ] Env: `GUARDIAN_LINK_BASE_URL` (default `https://pitchproof.online`), `REVENUECAT_ENTITLEMENT_ID` (default `pitchproven`), `CALLABLE_ALLOWED_ORIGINS` only if a browser origin needs callables
- [ ] Budget alerts on the Google Cloud billing account (see `docs/release/cost-audit.md`)

## AI

- [ ] Provider privacy review of OpenRouter and the routed model provider for footage of minors (AI_PRIVACY_CONFIGURATION_REQUIRED)
- [ ] Confirm zero-data-retention endpoints exist for the allowlisted model (`google/gemini-2.0-flash-001` default)
- [ ] Only after both: set `AI_FOOTAGE_PROCESSING_APPROVED=true` for the functions (until then uploads for analysis are refused with a translated "not available yet" message)
- [ ] `OPENROUTER_MODEL` / `OPENROUTER_VISION_MODEL` are server env only and ignored unless allowlisted
- [ ] OpenRouter spend limit on the key

## EMAIL

- [ ] Trigger Email extension installed on collection `mail`, real SMTP provider and sender domain (CONFIG_REQUIRED)
- [ ] SPF, DKIM, DMARC for the sender domain
- [ ] Run the guardian email test plan in `validation-matrix.md`

## REVENUECAT

- [ ] Entitlement `pitchproven`; products `PitchProven_Monthly`, `PitchProven_Yearly` in the current offering
- [ ] Paywall on the offering, Customer Center enabled
- [ ] Webhook to `https://europe-west6-scoutx-230b0.cloudfunctions.net/revenueCatWebhook` with the `REVENUECAT_WEBHOOK_SECRET` authorization header
- [ ] Production `appl_` key as `EXPO_PUBLIC_REVENUECAT_IOS_KEY` in EAS production env
- [ ] Decide whether sandbox events may grant premium in production (owner decision)

## APPLE

- [ ] App Store Connect app, subscription group, prices (owner decision), review notes and demo account (`app-review-notes.md`)
- [ ] Sign in with Apple key (`APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`) for token revocation on deletion
- [ ] APNs key uploaded to Expo for push notifications

## GOOGLE

- [ ] Google sign-in OAuth clients (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`)
- [ ] `GOOGLE_SERVICES_PLIST` EAS file secret (never committed)

## APP ATTEST

- [ ] Register the iOS app with App Check using App Attest (DeviceCheck fallback)
- [ ] `EXPO_PUBLIC_APP_CHECK_ENABLED=true` in production; no debug tokens in production env
- [ ] Monitor App Check metrics, then keep `ENFORCE_APP_CHECK` unset (enforced by default)

## UNIVERSAL LINKS

The domain is `pitchproof.online` (not `scoutx.app`).

- [x] DNS for `pitchproof.online` pointing to Firebase Hosting; TLS certificate issued (2026-10-08)
- [x] `/.well-known/apple-app-site-association` served with `application/json` (Team ID `833CYAZ8XT` already in the file)
- [ ] Associated domains entitlement in the production build

## CLOUD TASKS

- [ ] Queues `extractMatchSegment`, `analyzeMatchFrames`, `buildDataExport` deployed with retry limits
- [ ] Task handlers invokable only by the queue service account (OIDC)

## STORAGE

- [ ] Bucket region and lifecycle rules for `quarantine/` and `exports/`
- [ ] Service account has `iam.serviceAccounts.signBlob` for expiring signed URLs

## BACKUPS

- [ ] See `docs/security/backups.md` (BACKUP_CONFIGURATION_REQUIRED)

## MONITORING

- [ ] Alerting on function error rate, Cloud Tasks backlog, OpenRouter failures (`OpenRouter request failed` / `did not complete` log entries), deletion failures (`Account deletion step failed`)
- [ ] Someone on call for `securityEmail` and moderation queues

## SENTRY

- [ ] `EXPO_PUBLIC_SENTRY_DSN` for production; confirm scrubbing with one test crash (`src/config/sentry.ts`)
- [ ] Data region and retention set in the Sentry project (processor register)

## NOTIFICATIONS

- [ ] Expo push with APNs credentials; `EXPO_PUSH_URL` left at default
- [ ] Verify generic lock-screen text for minors on a real device
