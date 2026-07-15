# ScoutX Security

This document describes how ScoutX handles authentication and credentials. It is the reference for contributors working on auth, admin tools, Cloud Functions, or data storage.

## Authentication architecture

ScoutX uses **Firebase Authentication** as the sole credential authority.

| Concern | Owner |
|--------|--------|
| Password creation | Firebase Auth (`createUserWithEmailAndPassword`) |
| Password verification | Firebase Auth (`signInWithEmailAndPassword`) |
| Password reset | Firebase Auth (`sendPasswordResetEmail`) |
| Password change | Firebase Auth (`reauthenticateWithCredential` + `updatePassword`) |
| Session tokens | Firebase Auth ID tokens / refresh tokens |
| User profile metadata | Firestore `users/{uid}` (no secrets) |

The mobile app never implements custom password hashing, password storage, or password verification logic.

### Supported sign-in methods

- Email and password
- Anonymous guest sessions (upgradeable to email/password or OAuth)
- Sign in with Apple (iOS — `expo-apple-authentication` + Firebase `OAuthProvider`)
- Sign in with Google (development / EAS builds — not Expo Go)

### Application layers

1. **UI** — collects credentials in secure text fields and passes them directly to auth services.
2. **`authService.ts`** — delegates all credential operations to Firebase Auth.
3. **`userService.ts`** — writes profile metadata (name, email, role) to Firestore only.
4. **Firestore security rules** — reject credential fields and restrict client-writable roles.
5. **Cloud Functions** — authenticate via `request.auth.uid`; never accept plaintext passwords.

## Password handling guarantees

Passwords are handled **exclusively by Firebase Authentication**.

ScoutX must **never**:

- store passwords in Firestore
- store passwords in Firebase Storage
- cache passwords in AsyncStorage or local files
- log passwords to the console
- include passwords in analytics, crash reports, or telemetry
- return passwords from backend APIs
- expose passwords in user-facing error messages

Firestore user documents contain only: `uid`, `name`, `email`, `role`, `isAnonymous`, `createdAt`, `updatedAt`.

## Why administrators cannot view passwords

Firebase Authentication stores passwords using Google's managed infrastructure. Passwords are:

- hashed with industry-standard algorithms
- never returned by Firebase Admin SDK list/get user APIs
- never available to project owners, developers, database admins, or ScoutX moderators

**This is intentional and correct.** No privileged user should ever be able to read a user's password.

### What administrators can do

Administrators may:

- review verification requests and content reports (server-enforced via `ADMIN_USER_IDS`)
- disable accounts through Firebase Console / Admin SDK
- trigger standard Firebase password-reset emails for support workflows

Administrators must **not**:

- attempt to read, export, or recover user passwords
- store or transmit passwords outside Firebase Auth
- build custom "admin password reset" flows that collect plaintext passwords

## Firebase Authentication security model

Firebase Auth provides:

- salted password hashing
- secure token issuance and rotation
- built-in rate limiting and abuse protections (configurable in Firebase Console)
- email verification and password reset flows
- optional MFA, App Check, and Identity Platform upgrades

ScoutX relies on Firebase for credential security and adds app-level controls:

- production builds **fail closed** if Firebase is not configured (no mock auth fallback)
- anti-enumeration messaging on password reset
- sanitized auth error messages
- Sentry scrubbing for sensitive keys
- Firestore rules blocking credential fields and privileged role escalation

## Encrypted device storage (`SecureStorageService`)

Firebase Authentication persists sessions (ID tokens and refresh tokens) via its own Persistence API (`getReactNativePersistence(AsyncStorage)` on native). ScoutX **does not** duplicate Firebase session material in SecureStore.

`SecureStorageService` (`src/services/secureStorage/`) is the only app path for encrypted device secrets. Full architecture: [docs/SECURE_STORAGE.md](docs/SECURE_STORAGE.md).

| Platform | Implementation | Security level |
|----------|----------------|----------------|
| iOS | `expo-secure-store` Keychain, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Hardware-backed |
| Android | `expo-secure-store` Keystore-backed prefs + Auto Backup exclusion | Hardware-backed |
| Web | AES-GCM 256 (Web Crypto) + IndexedDB key | Best-effort (not Keychain-equivalent) |

### Storage policy

**Use SecureStorageService for:**

- Short-lived OAuth CSRF state / nonce (Sign in with Apple)
- Future device-bound app secrets explicitly allowlisted in `secureStorageKeys.ts`

**Never store in SecureStorageService:**

- Firebase ID tokens or refresh tokens
- Email/password credentials
- Provider OAuth tokens (`idToken`, refresh/access tokens, Apple authorization codes)
- API keys already supplied via environment variables at build time
- User profile data suitable for Firestore

**Use AsyncStorage for:**

- Non-sensitive preferences (language, onboarding flags, cached feature data)
- Firebase Auth session persistence (owned by the Firebase SDK — do not read/write tokens manually)
- Mock guest session metadata in development (no passwords)

Keys are allowlisted. Values are size-limited and scanned for forbidden credential field shapes. Sign-out clears allowlisted SecureStore entries via `clearAllowlistedItems()`.

## Firebase App Check

ScoutX initializes **Firebase App Check before any Firebase service** (Auth, Firestore, Storage, Functions). See [docs/APP_CHECK.md](../docs/APP_CHECK.md) for setup.

| Platform | Production attestation |
|----------|---------------------|
| Android | Play Integrity |
| iOS | App Attest with DeviceCheck fallback |
| Web | reCAPTCHA v3 |

Development builds use **debug providers** with tokens registered in Firebase Console. Expo Go skips App Check (requires a development/EAS build).

Cloud Functions enforce App Check by default (`enforceAppCheck: true`). Enable product-level enforcement in Firebase Console after client rollout.

## Firestore rules (users collection)

Client writes to `users/{uid}` are limited to:

- allowed fields only
- roles in `guest`, `player`, or `scout`
- no `password`, `passwordHash`, `passwordSalt`, or similar fields

Roles such as `coach` and `club` must be assigned through trusted server processes, not direct client writes.

## Cloud Functions policy

All Cloud Functions must:

1. Authenticate callers with `request.auth?.uid` when user context is required.
2. Enforce authorization server-side (admin allowlist, ownership checks).
3. **Never** accept, log, or persist plaintext passwords.
4. **Never** return credential material in responses.

Admin authorization uses the `ADMIN_USER_IDS` secret — not client-exposed environment variables.

## Development-only mock authentication

When Firebase is not configured in a **non-production** build, a mock auth module may be used for local UI development.

Mock auth rules:

- disabled entirely in production builds
- demo credentials loaded only from `EXPO_PUBLIC_MOCK_DEMO_PASSWORD` (never hardcoded)
- passwords kept in memory only for the dev session
- guest sessions persisted to AsyncStorage **without** passwords
- password reset always returns success to avoid email enumeration

## UI security practices

- Password fields use `secureTextEntry`
- Password fields use `textContentType` / `autoComplete` hints
- Form state is cleared after successful login/registration/password change
- Errors shown to users are generic and never include submitted credentials

### Sign in with Apple

- Uses `expo-apple-authentication` (Expo SDK 54) with Firebase `OAuthProvider('apple.com')`.
- Cryptographic nonce (`expo-crypto` SHA-256) is required for production Firebase Apple auth.
- Account linking is centralized in `src/features/auth/services/oauth/oauthAccountLinking.ts` and supports anonymous upgrade, email/password accounts, Google, and future OAuth providers.
- Apple Sign In is iOS-only; the official `AppleAuthenticationButton` is used per Apple HIG.
- App Store Guideline 4.8: Apple Sign In is offered on Welcome, Login, and Register wherever email/password is available on iOS.
- App Store Guideline 5.1.1(v): account deletion calls `deleteAuthenticatedAccount`, which revokes stored Apple refresh tokens via Apple's revoke API. See [docs/APPLE_SIGN_IN.md](docs/APPLE_SIGN_IN.md).
- System-level Apple credential revocation is handled by `useAppleCredentialRevokeListener` (signs the user out).

### Sign in with Google

- Uses `@react-native-google-signin/google-signin` (Expo SDK 54 **recommended** native library + config plugin) with Firebase `GoogleAuthProvider.credential(idToken)`.
- **Do not** use `expo-auth-session` Google helpers — deprecated / unmaintained by Expo.
- Requires a **development build** or **EAS production build** — not available in Expo Go.
- Configure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` with the Firebase **Web client ID** (`client_type: 3`).
- iOS: set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (URL scheme is auto-derived when `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` is omitted).
- Android requires SHA-1 fingerprints in Firebase/Google Cloud Console for debug and release builds.
- ID tokens are exchanged with Firebase only; passwords are never handled by ScoutX.
- Shares the same `signInOrLinkOAuthCredential` linking path as Apple.
- Full setup: [docs/GOOGLE_SIGN_IN.md](docs/GOOGLE_SIGN_IN.md).

## Best practices for future contributors

### Do

- Route all credential operations through Firebase Auth SDK methods
- Keep secrets in Firebase Functions secrets / server environment — not `EXPO_PUBLIC_*`
- Map Firebase errors to safe user-facing messages via `authErrorMapping.ts`
- Scrub sensitive keys before logging or crash reporting
- Require reauthentication before destructive actions (password change, account deletion)
- Validate Firestore writes with security rules

### Do not

- Add `password` fields to Firestore documents or API payloads
- Log auth payloads or Firebase error objects verbatim in production
- Build custom password hash/salt storage
- Use `EXPO_PUBLIC_*` for admin authorization
- Bypass Firebase Auth with bespoke credential endpoints

## Recommended future hardening

| Control | Purpose |
|--------|---------|
| Firebase App Check | Reduce API key abuse and unauthorized clients |
| Multi-factor authentication (MFA) | Protect high-value accounts |
| Email verification enforcement | Confirm account ownership |
| Firebase Identity Platform rate limits | Brute-force protection |
| Device integrity / attestation | Detect compromised clients |
| Custom claims for roles | Server-issued roles instead of client-writable Firestore fields |
| Callable `isAdmin` endpoint | Remove client-side admin UID hints |
| Audit logging for admin actions | Accountability for moderation operations |

## Key files

| File | Purpose |
|------|---------|
| `src/config/authSecurity.ts` | Production fail-closed and mock auth gating |
| `src/features/auth/services/authService.ts` | Firebase auth orchestration |
| `src/features/auth/services/passwordService.ts` | Reauth + password change |
| `src/features/auth/services/authErrorMapping.ts` | Safe error mapping |
| `src/features/auth/services/appleAuthService.ts` | Sign in with Apple (Expo + Firebase) |
| `src/services/secureStorage/SecureStorageService.ts` | Encrypted app secrets (never Firebase credentials) |
| `docs/SECURE_STORAGE.md` | SecureStore architecture and policy |
| `src/features/auth/services/oauth/oauthAccountLinking.ts` | Shared OAuth link / sign-in |
| `src/utils/scrubSensitiveData.ts` | Telemetry scrubbing |
| `src/config/sentry.ts` | Sentry init with `beforeSend` scrubber |
| `firestore.rules` | Credential field rejection and role constraints |
| `functions/src/adminReview.ts` | Server-side admin authorization |
| `functions/src/appleAuth.ts` | Persist Apple auth codes + delete account with revoke |
| `docs/APPLE_SIGN_IN.md` | SIWA architecture and deploy checklist |
| `docs/GOOGLE_SIGN_IN.md` | Google auth architecture and deploy checklist |

## Verification checklist

Before shipping auth-related changes:

- [ ] No password fields in Firestore reads/writes
- [ ] No password persistence outside Firebase Auth
- [ ] No password values in logs, Sentry, or analytics
- [ ] Password reset does not reveal account existence
- [ ] Login errors remain generic
- [ ] Production build fails if Firebase is missing
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
