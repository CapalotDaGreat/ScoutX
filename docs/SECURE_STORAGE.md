# SecureStorageService (Expo SDK 54)

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| `expo-secure-store` on iOS/Android | Official Expo Module for SDK 54; Keychain / Keystore backed. |
| `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | Strongest practical accessibility without mid-flow biometrics. Avoids deprecated `ALWAYS*` constants. |
| No `requireAuthentication` for OAuth CSRF | Face ID / biometrics mid Apple Sign-In breaks native OAuth UX. |
| Async `*ItemAsync` only | Sync SecureStore APIs block the JS thread — avoided. |
| Firebase owns sessions | ID/refresh tokens use Firebase Auth persistence (`getReactNativePersistence(AsyncStorage)` on native). Never duplicate in SecureStore. |
| Allowlisted keys only | Prevents accidental storage of passwords / tokens. |
| Web AES-GCM fallback | Best-effort when Keychain is unavailable; **not** hardware security. |

## Abstraction

```
SecureStorageService  (public API)
        ↓
secureStorageBackend  (platform select via Metro .native / .web)
        ↓
┌─────────────────────┬──────────────────────────────┐
│ iOS / Android       │ Web                          │
│ expo-secure-store   │ AES-GCM + IndexedDB key      │
│ Keychain / Keystore │ ciphertext in localStorage   │
└─────────────────────┴──────────────────────────────┘
```

## Allowed contents

**Store:**

- Short-lived OAuth pending state / nonce (`SECURE_STORAGE_KEYS.OAUTH_PENDING_STATE`)
- Future device-bound app secrets after explicit allowlist entry

**Never store:**

- Firebase ID tokens / refresh tokens
- Email / password credentials
- Google / Apple `idToken`, `accessToken`, `authorizationCode`, refresh tokens
- Build-time API keys (`EXPO_PUBLIC_*`)

## Public API

```ts
secureStorageService.isAvailable()
secureStorageService.isHardwareBacked()
secureStorageService.getItem(key)
secureStorageService.setItem(key, value)
secureStorageService.removeItem(key)
secureStorageService.clearAllowlistedItems() // used on sign-out
```

Values are capped (`SECURE_STORAGE_MAX_VALUE_BYTES = 2048`) and scanned for credential-shaped fields.

## Config plugin

`app.config.ts` registers:

```ts
['expo-secure-store', {
  configureAndroidBackup: true, // excludes SecureStore from Android Auto Backup
  faceIDPermission: '...',      // reserved if requireAuthentication is enabled later
}]
```

## Consumers today

| Consumer | Key | Purpose |
|----------|-----|---------|
| `oauthSecureStateService` | `OAUTH_PENDING_STATE` | Apple Sign-In nonce/state with TTL; cleared after use / on sign-out |

## Compatibility

| Runtime | Behavior |
|---------|----------|
| Expo Go | SecureStore available on device; same Keychain path |
| Development / EAS builds | Full native backend |
| Web | AES-GCM best-effort fallback |
| Android API 35+ / iOS 18+ | Supported via expo-secure-store 15.x |

## Key files

| File | Purpose |
|------|---------|
| `SecureStorageService.ts` | Facade |
| `secureStorageBackend.native.ts` | Expo SecureStore |
| `secureStorageBackend.web.ts` | Web Crypto fallback |
| `secureStorageKeys.ts` | Allowlist |
| `secureStorageValidation.ts` | Size + credential rejection |
