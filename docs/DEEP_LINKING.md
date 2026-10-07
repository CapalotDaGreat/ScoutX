# ScoutX Deep Linking (Expo SDK 57)

ScoutX uses **Expo Linking** (`expo-linking` ~8) with **React Navigation** linking for custom schemes, universal links (iOS), and App Links (Android).

## URL schemes

| Type | Example |
|------|---------|
| Custom scheme | `scoutx://auth/action?mode=verifyEmail&oobCode=...` |
| Universal / App link | `https://<EXPO_PUBLIC_APP_LINK_HOST>/auth/action?mode=verifyEmail&oobCode=...` |
| Firebase hosted handler | `https://<project>.firebaseapp.com/__/auth/action?...&continueUrl=...` |

Incoming Firebase auth URLs (including `__/auth/action` and nested `link=` params) are normalized to `scoutx://auth/action` before navigation.

## Email verification flow

1. App sends verification / reset mail with `ActionCodeSettings` (`handleCodeInApp: true`).
2. `url` / continue URL is `https://<host>/auth/action`.
3. Hosted bridge (`public/auth/action.html`) opens `scoutx://auth/action?...` with `mode` + `oobCode`.
4. `expo-linking` delivers the URL → `AuthActionScreen` → `applyActionCode` / password reset.
5. **Continue to ScoutX** returns to the authenticated Player/Scout shell when signed in, otherwise Login.

## Architecture

```
Email → Firebase / Hosted bridge
              ↓
expo-linking (getInitialURL + url events)
              ↓
normalizeIncomingDeepLink + pendingAuthDeepLinkService
              ↓
NavigationContainer (always mounted; bootstrap overlay only)
              ↓
AuthActionScreen → authActionLinkService → Firebase Auth
              ↓
Continue → PlayerApp / ScoutApp / Login
```

Business logic lives in `authActionLinkService.ts` and `deepLinking.ts`. Screens stay thin.

## App routes (`src/navigation/deepLinkResolver.ts`)

| Path | Auth | Opens |
|------|------|-------|
| `player/<id>`, `evidence/<id>` | Sign-in | Player / evidence |
| `match/<id>`, `request/<id>`, `reel/<id>` | Sign-in, player only | Match report, request, reel |
| `trial/<id>` | Sign-in, per role | Trial |
| `report/<ownerId>/<mediaId>` | Sign-in | Report form for that media (`ReportLinkScreen`) |
| `guardian/<token>` or `guardian?t=<token>` | None | `GuardianLinkScreen`, which opens the guardian page in the browser |

- Ids are validated before navigation; malformed links open `LinkUnavailable`.
- `report` carries the owner id because the server checks the claimed owner of the media.
- `/guardian` is deliberately **not** in the AASA file: a guardian opens the link on their own
  device, usually without the app, and the decision is made only on the Hosting page
  (`public/guardian/`). If the app does receive such a link it hands it to the browser and never
  records a decision itself.

## Production setup

### 1. Choose an app-link host you control

Prefer your **Firebase Hosting** domain until you own a branded domain:

```env
EXPO_PUBLIC_APP_LINK_HOST=<your-project-id>.web.app
EXPO_PUBLIC_FIREBASE_PROJECT_ID=<your-project-id>
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=<your-project-id>.firebaseapp.com
```

If `EXPO_PUBLIC_APP_LINK_HOST` is omitted, ScoutX defaults to `<projectId>.web.app` when the project id is present.

> Do not point continue URLs at a domain you do not control. Universal Links will fail.

### 2. Deploy hosting (bridge + well-known)

```bash
firebase deploy --only hosting
```

This publishes:

- `/auth/action` → bridge that opens ScoutX
- `/.well-known/apple-app-site-association`
- `/.well-known/assetlinks.json`

### 3. Firebase Console

1. Authentication → Settings → **Authorized domains**: add your app-link host.
2. Authentication → Templates → **Customize action URL** (optional but recommended):  
   `https://<host>/auth/action`  
   so emails land on the ScoutX bridge with `mode` + `oobCode`.

### 4. iOS Universal Links

1. Replace `TEAMID` in `public/.well-known/apple-app-site-association` with your Apple Team ID.
2. Redeploy hosting.
3. Rebuild the iOS binary after changing `associatedDomains` / host (`app.config.ts`).

### 5. Android App Links

1. Replace SHA-256 placeholders in `public/.well-known/assetlinks.json` (debug + release / EAS).
2. Redeploy hosting.
3. Rebuild Android after changing `intentFilters` / host.

### 6. EAS Build

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

Set `EXPO_PUBLIC_APP_LINK_HOST` in EAS env for each profile so native entitlements match the hosted domain.

## Expo Go limitations

| Capability | Expo Go | Development / EAS build |
|------------|---------|-------------------------|
| `scoutx://` custom scheme | Limited / unreliable | Supported |
| Universal Links / App Links | Not supported | Supported after hosting + rebuild |
| Email verification end-to-end | Incomplete | Supported |

Use `npm run start:dev-client` with an installed development build to validate auth deep links.

## Local smoke test

With a development build:

```text
npx uri-scheme open "scoutx://auth/action?mode=verifyEmail&oobCode=TEST" --ios
```

Invalid codes should surface a safe error on `AuthActionScreen`; valid codes from a real email should verify and offer **Continue to ScoutX**.

## Key files

| File | Purpose |
|------|---------|
| `src/config/deepLinking.ts` | Prefixes, ActionCodeSettings, parse/normalize |
| `src/navigation/linking.ts` | Expo Linking ↔ React Navigation |
| `src/navigation/RootNavigator.tsx` | Always-mounted container + pending deep-link apply |
| `src/features/auth/screens/AuthActionScreen.tsx` | Verification UX + return to app |
| `src/features/auth/services/authActionLinkService.ts` | Firebase `applyActionCode` / reset |
| `public/auth/action.html` | Web bridge → `scoutx://` |
| `public/.well-known/*` | AASA + assetlinks |
| `firebase.json` | Hosting for bridge + well-known |
