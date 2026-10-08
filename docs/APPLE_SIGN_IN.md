# Sign in with Apple (Expo SDK 54)

## Architecture decisions

| Decision | Rationale |
|----------|-----------|
| `expo-apple-authentication` | Official Expo Module for SDK 54; provides HIG button, nonce, credential state, and revoke listener. |
| Firebase `OAuthProvider('apple.com')` | Current Firebase JS SDK path for native Apple identity tokens — not legacy web OAuth redirects. |
| Shared `signInOrLinkOAuthCredential` | One linking path for Apple, Google, and future providers (anonymous upgrade, email/password link, conflict errors). |
| Server-side Apple token revoke | App Store Guideline 5.1.1(v) requires revoking Sign in with Apple tokens on account deletion. Authorization codes expire quickly; exchange immediately and store refresh tokens only on the server. |
| Prefer Expo Modules over community Apple libs | Avoid deprecated/community Apple Sign-In packages. |

## Runtime matrix

| Environment | Sign in with Apple | Token revoke on delete |
|-------------|--------------------|-------------------------|
| Expo Go (iOS) | Supported when device supports SIWA | Best-effort (requires deployed Functions + secrets) |
| Development Build | Supported | Supported when secrets configured |
| EAS / App Store | Supported (`usesAppleSignIn` + plugin) | Required for review — configure secrets |

## Client flow

1. Generate raw nonce → SHA-256 hash (`expo-crypto` / Secure Store pending state).
2. `AppleAuthentication.signInAsync({ nonce: hashedNonce, scopes: FULL_NAME + EMAIL })`.
3. Build Firebase credential: `OAuthProvider('apple.com').credential({ idToken, rawNonce })`.
4. `signInOrLinkOAuthCredential` (sign-in, link, or anonymous upgrade).
5. Call `persistAppleAuthorizationCode` with the short-lived `authorizationCode`.

## Server flow

1. Cloud Function creates Apple `client_secret` JWT (ES256, Team ID + Key ID + `.p8`).
2. Exchange authorization code → refresh token (`https://appleid.apple.com/auth/token`).
3. Store tokens in `authProviderTokens/{uid}` (Admin SDK only; Firestore rules deny client access).
4. On `deleteAuthenticatedAccount`, revoke token via Apple, then delete Firestore + Auth user.

## Required Firebase / Apple setup

1. Apple Developer → Certificates, Identifiers & Profiles → Keys → enable **Sign in with Apple**.
2. Firebase Console → Authentication → Sign-in method → Apple → enable.
3. For native iOS, Services ID is typically not required; `APPLE_CLIENT_ID` = bundle id `com.scoutx.app`.
4. Set Cloud Function secrets:

```bash
firebase functions:secrets:set APPLE_TEAM_ID
firebase functions:secrets:set APPLE_KEY_ID
firebase functions:secrets:set APPLE_PRIVATE_KEY
# Optional override (defaults to com.scoutx.app):
# firebase functions:secrets:set APPLE_CLIENT_ID
```

Optionally set `APPLE_CLIENT_ID` in the Functions runtime environment if the Services ID differs from the bundle id. For native iOS PitchProof builds, leave the default `com.scoutx.app`.

5. Deploy:

```bash
firebase deploy --only functions:persistAppleAuthorizationCode,functions:deleteAuthenticatedAccount,firestore:rules
```

## Account linking

- **Email/password → Apple**: Settings → Security → Link Apple (signed-in, non-anonymous).
- **Anonymous → Apple**: Welcome / Login / Register OAuth upgrades the anonymous session.
- **Google ↔ Apple**: Link while signed in; conflicting emails surface a safe “sign in with existing method” error.

## Guideline 4.8

Apple Sign In is offered on Welcome, Login, and Register whenever email/password account creation/sign-in is available on iOS.
