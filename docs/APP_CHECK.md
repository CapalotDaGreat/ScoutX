# Firebase App Check

PitchProof uses **Firebase App Check** so clients can attest to Firebase backends. **Cloud Functions callables** enforce App Check by default in code. **Firestore and Cloud Storage** security rules do **not** currently check `request.app`; data-plane enforcement is a separate Firebase Console “APIs” toggle after registration and metrics look healthy.

## Architecture

```
App launch
    ↓
FirebaseBootstrap → ensureFirebaseInitialized()
    ↓
initializeApp (Firebase JS SDK)
    ↓
initializeFirebaseAppCheck (before Auth / Firestore / Storage)
    ↓
getAuth / getFirestore / getStorage
```

Native attestation is provided by `@react-native-firebase/app-check`. Tokens are bridged into the Firebase JS SDK so services receive `X-Firebase-AppCheck` headers automatically.

| Platform | Development (non-production runtime) | Production |
|----------|-------------|------------|
| Android | Debug provider | Play Integrity |
| iOS | Debug provider | App Attest + DeviceCheck fallback |
| Web | Debug provider | reCAPTCHA v3 |

## Prerequisites

1. Download `google-services.json` and `GoogleService-Info.plist` from Firebase Console and place them in the project root (gitignored).
2. Register App Check providers in Firebase Console:
   - **Android**: Play Integrity
   - **iOS**: App Attest (with DeviceCheck fallback) for bundle `com.scoutx.app`, team `833CYAZ8XT`
   - **Web**: reCAPTCHA v3
3. Rebuild with EAS — App Check does **not** work in Expo Go.
4. Operator steps and evidence: `docs/release/operator-actions-2026-11-04.md` §1.

## Development debug tokens

Non-production runtimes **always** use the debug provider (`resolveAppCheckPolicy` → `useDebugProvider: !production`). The env flag `EXPO_PUBLIC_APP_CHECK_USE_DEBUG` does **not** select the provider at runtime; production builds **refuse** it via `productionBuildProblems` (build gate only).

1. Run a development build and copy the debug token from native logs.
2. Register the token in Firebase Console → App Check → **Manage debug tokens**.
3. Add tokens to `.env` (never commit):

```env
EXPO_PUBLIC_APP_CHECK_ANDROID_DEBUG_TOKEN=your-android-debug-token
EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN=your-ios-debug-token
EXPO_PUBLIC_APP_CHECK_WEB_DEBUG_TOKEN=your-web-debug-token
```

## Production enforcement

### Client

Production builds automatically use:

- Android: `playIntegrity`
- iOS: `appAttestWithDeviceCheckFallback`
- Web: `reCAPTCHA v3` via `EXPO_PUBLIC_APP_CHECK_RECAPTCHA_SITE_KEY`

Set `EXPO_PUBLIC_APP_CHECK_ENABLED=false` only for emergency local testing (blocked in production EAS builds).

### Cloud Functions

Callables use `enforceAppCheck: true` by default (`shouldEnforceAppCheck` in `functions/src/callableOptions.ts`), except intentional public paths (guardian consent link handlers, `submitPublicReport`).

The emulator disables enforcement when `FUNCTIONS_EMULATOR=true`. Set `ENFORCE_APP_CHECK=false` only as an emergency rollback after a deploy (not recommended for production).

**If providers are unregistered while callable enforcement is on, TestFlight/device callables fail** (looks like App Review 2.1). Register App Attest/DeviceCheck before relying on TestFlight.

### Firebase Console (product APIs)

Enable enforcement per product **after** validating tokens from a production-profile build:

1. Firebase Console → App Check → **APIs**
2. Enable enforcement for Cloud Firestore, Cloud Storage, Cloud Functions metrics as applicable, Authentication (recommended after client rollout)

Rules-level `request.app` checks are **not** present today; do not claim rules alone enforce App Check.

## Play Integrity note

Play Integrity tokens require the app to be distributed via Google Play (internal testing track is sufficient). Local APK installs may fail attestation until uploaded to Play Console.

## Expo Go

App Check is skipped in Expo Go (`storeClient` execution environment). Use a **development build** for App Check testing.
