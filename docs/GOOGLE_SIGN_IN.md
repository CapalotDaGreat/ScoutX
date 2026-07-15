# Google Sign-In (Expo SDK 54)

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| `@react-native-google-signin/google-signin` + Expo config plugin | **Current Expo-recommended** Google authentication for SDK 54. Native account picker, ID token for Firebase. |
| Do **not** use `expo-auth-session` Google helpers | Deprecated / unmaintained by Expo. Maintainers redirect apps to the native Google Sign-In libraries. |
| Firebase `GoogleAuthProvider.credential(idToken)` | Current Firebase JS Auth API for Google ID tokens — not custom token minting. |
| Shared `signInOrLinkOAuthCredential` | Same linking path as Apple (anonymous upgrade, email/password link, conflict errors). |
| Expo Go unavailable | Native module requires a development or EAS build (Expo official guidance). |

## Runtime matrix

| Environment | Google Sign-In |
|-------------|----------------|
| Expo Go | **Not available** (button hidden; Metro stub in place) |
| Development Build (`npm run start:dev-client`) | Supported when client IDs are set |
| EAS Preview / Production | Supported — set EAS env vars and rebuild |

## Client flow

1. Config plugin injects native Google Sign-In (iOS URL scheme + Android).
2. `GoogleSignin.configure({ webClientId, iosClientId? })` — **webClientId must be the Firebase Web client ID** (`client_type: 3`).
3. Android: `hasPlayServices()` then `signIn()`.
4. `GoogleAuthProvider.credential(idToken)` → `signInOrLinkOAuthCredential`.
5. On ScoutX sign-out, `clearGoogleSignInSession()` clears the native Google session so the next login can choose another account.

## Required configuration

### 1. Firebase Console

Authentication → Sign-in method → **Google** → Enable.

### 2. Environment variables

Set in `.env` / EAS secrets (see `.env.example`):

| Variable | Required | Notes |
|----------|----------|-------|
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | **Yes** | Firebase **Web** OAuth client ID |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | iOS | iOS OAuth client ID from Firebase / Google Cloud |
| `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` | Optional | Reversed iOS client ID; auto-derived from `IOS_CLIENT_ID` when omitted |

Example scheme derivation:

`1234567890-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.1234567890-abc`

### 3. Android SHA-1

Register **debug** and **release/EAS** SHA-1 fingerprints in Firebase (Project settings → Your apps → Android).

```bash
# Debug keystore example
keytool -list -v -keystore %USERPROFILE%\.android\debug.keystore -alias androiddebugkey -storepass android -keypass android
```

### 4. Build

```bash
# Development client (Google native module included)
npx eas build --profile development --platform ios
npx eas build --profile development --platform android

# Metro against a installed d.dev client
npm run start:dev-client
```

Do **not** expect Google Sign-In inside `npm start` (Expo Go).

## Account linking

- **Email/password → Google**: Settings → Security → Link Google (signed-in, non-anonymous).
- **Anonymous → Google**: Welcome / Login / Register OAuth upgrades the anonymous session.
- **Apple ↔ Google**: Link while signed in; conflicting emails surface a safe “use existing method” error.

## Guideline 4.8 (App Store)

When the app offers third-party login, Apple Sign In is also offered on Welcome, Login, and Register (iOS). Google appears on those screens when the native module + client IDs are available.

## Key files

| File | Purpose |
|------|---------|
| `src/features/auth/services/googleAuthService.ts` | Native Google → Firebase credential |
| `src/config/googleAuth.ts` | Client ID / URL scheme helpers |
| `src/features/auth/services/oauth/oauthAccountLinking.ts` | Shared link/sign-in |
| `app.config.ts` | Expo config plugin (`iosUrlScheme`) |
| `metro.config.js` | Expo Go stub for the native module |
| `scripts/start-expo.mjs` | Sets `EXPO_PUBLIC_EXPO_GO` only for Expo Go sessions |
