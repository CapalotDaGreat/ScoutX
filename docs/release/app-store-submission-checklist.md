# App Store submission checklist

Every item here maps to a rejection seen on an earlier app (TradeAcademy, Sept–Oct 2026) or to a
common App Review guideline. Work top to bottom; later steps depend on earlier ones.

Status on 2026-10-08: `scoutx-230b0` is on Blaze. APIs enabled; Firestore `(default)` and the
Storage bucket created in `europe-west6` (Zurich); all functions run in `europe-west6`. Secrets set:
`GUARDIAN_LINK_SECRET`, `REVENUECAT_WEBHOOK_SECRET`, `OPENROUTER_API_KEY`, `APPLE_TEAM_ID`,
`APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (Sign in with Apple key `H92VR9XJ8R`). `ADMIN_USER_IDS`
exists but is blank (treated as not configured) until real staff uids are provided.
`pitchproof.online` is live on Firebase Hosting with TLS (DNS at Cloudflare, records DNS-only);
`www` redirects to it, guardian links use `https://pitchproof.online`. Still open in section 1:
steps 4, 5, 7, 10.

## 1. Backend (Guideline 2.1(a): "error message after tapping Enter")

1. Firebase console → Usage and billing → upgrade `scoutx-230b0` to **Blaze**. Set a budget alert.
2. Firestore → Create database, **Native mode**. The region is permanent; pick one and record it in
   `docs/privacy/processor-register.md` (for example `europe-west6` Zurich or `eur3`).
3. Storage → Get started (bucket `scoutx-230b0.firebasestorage.app`).
4. Authentication → Sign-in method: enable **Email/Password** and **Apple**. Google is optional; the
   button hides itself when `EXPO_PUBLIC_GOOGLE_*` is not set.
5. App Check → Apps → iOS app → register **App Attest** and **DeviceCheck**. DeviceCheck needs its
   own `.p8` key with the DeviceCheck capability (Apple Developer → Keys); the App Store Connect API
   key and the In-App Purchase key do not work here. Callables enforce App Check, so without this
   every server call fails on real devices.
6. Server secrets (run from the repo root):

   ```powershell
   npx firebase-tools functions:secrets:set OPENROUTER_API_KEY
   npx firebase-tools functions:secrets:set REVENUECAT_WEBHOOK_SECRET
   npx firebase-tools functions:secrets:set GUARDIAN_LINK_SECRET   # random, at least 32 characters (shorter disables guardian links)
   npx firebase-tools functions:secrets:set ADMIN_USER_IDS         # comma-separated staff uids
   npx firebase-tools functions:secrets:set APPLE_TEAM_ID          # 833CYAZ8XT
   npx firebase-tools functions:secrets:set APPLE_KEY_ID           # Sign in with Apple key id
   npx firebase-tools functions:secrets:set APPLE_PRIVATE_KEY      # Sign in with Apple .p8 contents
   ```

   Functions env (`functions/.env.scoutx-230b0`, not committed): `GUARDIAN_LINK_BASE_URL=https://pitchproof.online`.
   Add `AI_FOOTAGE_PROCESSING_APPROVED=true` **only** after the AI provider privacy review
   (AI_PRIVACY_CONFIGURATION_REQUIRED); until then video analysis uploads are refused with a
   translated "not available yet" message and the rest of the app works normally.

   Internal TestFlight builds while legal contacts are still missing need
   `ALLOW_LEGAL_PLACEHOLDERS=1` in the EAS build environment; App Store builds must not set it.
7. Extensions → install **Trigger Email from Firestore** on collection `mail` with an SMTP account.
   Guardian approval and moderation emails depend on it.
8. Deploy:

   ```powershell
   npx firebase-tools deploy --only firestore,storage,functions,hosting
   ```

9. Hosting → Add custom domain `pitchproof.online` and `www.pitchproof.online`; add the DNS records
   at the registrar and wait for the certificate. Then check that
   `https://pitchproof.online/privacy/`, `/support/` and `/.well-known/apple-app-site-association` load.
10. RevenueCat → Integrations → Webhooks: `https://europe-west6-scoutx-230b0.cloudfunctions.net/revenueCatWebhook`,
    authorization header = the `REVENUECAT_WEBHOOK_SECRET` value.

## 2. App configuration

1. **Icon and splash (2.3.8, rejected twice on TradeAcademy).** Done: the PitchProof shield with the
   gold check badge, rendered by `scripts/generate-icons.ps1` into `assets/` (1024×1024 opaque icon,
   transparent splash mark and Android foreground on `#121110`). The App Store icon is taken from the
   build, so it matches the home-screen icon. The release gate fails if a placeholder returns.
2. **Legal contacts.** Set `privacyEmail`, `securityEmail`, `legalEmail`, `supportEmail` in
   `src/config/legalConfig.ts` (mailboxes that actually receive mail, for example `support@pitchproof.online`).
   Finish legal review, set `effectiveDate` and `status` in `legal/documents/*.md`, then
   `node scripts/build-legal.mjs`. Production builds are blocked until contacts are set.
3. **EAS production environment** (`npx eas-cli env:create --environment production`):
   - `EXPO_PUBLIC_REVENUECAT_IOS_KEY` = RevenueCat App Store key (`appl_…`). Missing today: the
     paywall would say purchases are unavailable (3.1.1).
   - Optional: `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.
   - Do not set `EXPO_PUBLIC_APP_CHECK_USE_DEBUG`, `EXPO_PUBLIC_USE_MOCK_DATA` or any OpenRouter key.
4. `node scripts/release-gate.mjs` must report **PASS** (no `--allow-external`).

## 3. In-app purchases (3.1.1)

1. App Store Connect: `PitchProven_Monthly` and `PitchProven_Yearly` complete (availability, price,
   localized display name and description, review screenshot) → status **Ready to Submit**.
2. RevenueCat: both products attached to entitlement `pitchproven`, offering `default` is current with
   `$rc_monthly` and `$rc_annual`, paywall published, Customer Center configured.
3. On the app version page, add both subscriptions under **In-App Purchases and Subscriptions** before
   submitting (first subscriptions must ship with a new version).
4. The paywall and the App Store description must link working Terms (`/terms/`) and Privacy (`/privacy/`) pages.

## 4. Test like App Review (2.1)

App Review installs a fresh build on an iPhone and on an iPad (iPhone-only apps run in compatibility
mode on iPad), on the latest iOS, signed out.

1. `npx eas-cli build -p ios --profile production`, then distribute through **TestFlight**.
2. On a physical iPhone **and** a physical iPad: delete any old build, install from TestFlight, and run:
   - [ ] Launch → onboarding → register a new **player 18+** with email/password. No error.
   - [ ] Register with **Sign in with Apple**.
   - [ ] Register a **scout** and a **coach**.
   - [ ] Register a **13–17** player: guardian email arrives, approval link works, features unlock.
   - [ ] Under-13 is blocked with a clear message.
   - [ ] Log a match, upload a video, run an AI analysis, open the Football Passport.
   - [ ] Report a video and a profile; block a user.
   - [ ] Plan & usage → See plans → sandbox purchase → plan updates; Restore purchases; Manage subscription.
   - [ ] Settings → Delete account completes and signs out.
   - [ ] Airplane mode on a screen that loads data shows a friendly error, not a crash.
3. Record the full flow as one screen recording on the iPhone (Control Center → Screen Recording),
   starting from launching the app.

## 5. Reviewer access (2.1 Information Needed)

1. Create the demo accounts **through the production app** (this also proves registration works):
   player 18+, scout, coach, and a 13–17 player approved by a guardian address you control.
   Give the player sample content: a logged match, an uploaded clip and one analysis.
2. Enter the player 18+ account in App Review Information → Sign-in required; list the others in Notes.
3. Paste `docs/release/app-review-notes.md` (filled in) into the Notes field and attach the screen recording.

## 6. Store listing

1. Screenshots from the real app in use (not splash or login) at the required iPhone size (6.9").
   iPad screenshots are not required because `supportsTablet` is `false`.
2. Privacy policy URL `https://pitchproof.online/privacy/`, support URL `https://pitchproof.online/support/`.
3. App Privacy labels match `docs/compliance/app-store-privacy-labels.md`; age rating questionnaire
   matches `store/listing.json` (13+, user-generated content, no open chat).
4. Export compliance: `ITSAppUsesNonExemptEncryption` is already `false`.
5. Name: the app is PitchProof everywhere. In App Store Connect, set the app name to PitchProof
   (App Information → Name) and check that no screenshot or description still says ScoutX. The bundle
   ID `com.scoutx.app`, the Expo slug `scoutx` and the Firebase project `scoutx-230b0` stay; users never see them.
