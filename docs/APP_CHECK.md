# Firebase App Check

ScoutX uses **Firebase App Check** to protect Firestore, Cloud Storage, Cloud Functions, and Firebase Authentication from abuse.

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

Native attestation is provided by `@react-native-firebase/app-check`. Tokens are bridged into the Firebase JS SDK so all existing services receive `X-Firebase-AppCheck` headers automatically.

| Platform | Development | Production |
|----------|-------------|------------|
| Android | Debug provider | Play Integrity |
| iOS | Debug provider | App Attest + DeviceCheck fallback |
| Web | Debug provider | reCAPTCHA v3 |

## Prerequisites

1. Download `google-services.json` and `GoogleService-Info.plist` from Firebase Console and place them in the project root (gitignored).
2. Register App Check providers in Firebase Console:
   - **Android**: Play Integrity
   - **iOS**: App Attest (with DeviceCheck fallback)
   - **Web**: reCAPTCHA v3
3. Rebuild with EAS — App Check does **not** work in Expo Go.

## Development debug tokens

1. Set `EXPO_PUBLIC_APP_CHECK_USE_DEBUG=true` (optional — non-production builds default to debug).
2. Run a development build and copy the debug token from native logs.
3. Register the token in Firebase Console → App Check → **Manage debug tokens**.
4. Add tokens to `.env`:

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

Set `EXPO_PUBLIC_APP_CHECK_ENABLED=false` only for emergency local testing.

### Cloud Functions

All callable functions use `enforceAppCheck: true` by default (`functions/src/callableOptions.ts`).

The emulator disables enforcement when `FUNCTIONS_EMULATOR=true`. Set `ENFORCE_APP_CHECK=false` to disable server enforcement in a deployed environment (not recommended for production).

### Firebase Console

Enable enforcement per product after validating tokens:

1. Firebase Console → App Check → **APIs**
2. Enable enforcement for:
   - Cloud Firestore
   - Cloud Storage
   - Cloud Functions
   - Authentication (recommended after client rollout)

## Play Integrity note

Play Integrity tokens require the app to be distributed via Google Play (internal testing track is sufficient). Local APK installs may fail attestation until uploaded to Play Console.

## Expo Go

App Check is skipped in Expo Go (`storeClient` execution environment). Use a **development build** for App Check testing.
