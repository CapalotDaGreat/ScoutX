# App Check: implemented and live behaviour (2026-11-12)

Scope: PitchProof iOS, Firebase project `scoutx-230b0` (number 141939766260), Expo project `@boddibossi/scoutx`.
Sources: the code at redesign tip `459defc` (identical App Check code to `release/pitchproof-5-3-candidate` @ `01f9459`),
the installed SDK sources (`firebase` 12.15.0, `@react-native-firebase/app-check` 25.1.0, `firebase-functions` 6.6.0),
and read-only reads of the live project. Nothing was changed in the live project. No token, key or credential is recorded here.

## 1. What the code does

| Question | Answer | Where |
|---|---|---|
| Does the client try to get a token? | Yes in every non-development build (`!__DEV__`): `preview`, `simulator`, `production`. Development builds also try unless `EXPO_PUBLIC_APP_CHECK_ENABLED=false`. Skipped in Expo Go and whenever the local emulators are used | `src/config/appCheckPolicy.ts`, `firebaseAppCheck.ts`, `firebase.ts` |
| Which provider on iOS? | Non-development builds: **App Attest with DeviceCheck fallback** (`appAttestWithDeviceCheckFallback`). Development builds: **debug** provider, with `EXPO_PUBLIC_APP_CHECK_IOS_DEBUG_TOKEN` if set | `src/config/appCheckConfig.ts` |
| Simulator vs physical device | A non-development build in the iOS Simulator cannot attest: App Attest and DeviceCheck are unavailable there, so it gets **no token**. A physical device can, once the providers are registered (section 2) | Apple platform limitation |
| Can a release build use the debug provider? | No. `useDebugProvider = !production`, and a unit test pins it (`releaseBuild.test.ts`: "production always enables attestation and never selects debug") | `appCheckPolicy.ts` |
| Does a failed token block requests on the device? | No. Firestore sends the request with a placeholder App Check header; callable functions send it with no App Check header. The server decides | installed SDK: `@firebase/firestore` RN build (`FirebaseAppCheckTokenProvider`), `@firebase/functions` `getAppCheckToken` |
| Which backend endpoints require a valid token? | Every app-facing callable built with `createCallableOptions()` (all except the three below) when `FUNCTIONS_EMULATOR` is not `true` and `ENFORCE_APP_CHECK` is not `false`. Not enforced: `submitPublicReport`, `getGuardianConsentRequest`, `respondGuardianConsent` (public guardian web page). `revenueCatWebhook` is server-to-server | `functions/src/callableOptions.ts` |
| What does the SDK do with a missing token on an enforcing callable? | Rejects with `unauthenticated` / "Unauthenticated" **before** the function runs. Note: it logs "Callable request verification passed" first, so that log line does not prove enforcement is off | `firebase-functions/lib/common/providers/https.js` lines 281-305, 461-472 |
| What does the user see? | Before `459defc`: "Your session expired. Please sign in again." (wrong: the user is signed in). From `459defc`: "PitchProof couldn't verify this copy of the app. Make sure it's up to date and try again. If it keeps happening, sign out and back in, or contact support." Our own functions' "Sign in required." still shows the session message | `src/utils/userFacingError.ts`, `userFacingError.test.ts` |
| Initialisation failure | App Check initialisation is awaited before Auth, Firestore and Storage with no `catch`; if it ever threw, Firebase would stay uninitialised for that app session. Not observed; recorded as a risk, not changed | `src/config/firebase.ts` |

Onboarding depends on enforced callables: `confirmRole` (role selection), `setAgeBand` (age gate), `recordConsent` (legal gate).
So do Discover search, Plan and usage, uploads, analysis, playback, data export, evidence requests and account deletion
(`deleteAuthenticatedAccount`).

## 2. Live configuration (read-only, 2026-11-12)

| Item | Live state | How read |
|---|---|---|
| iOS app | `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1`, bundle `com.scoutx.app`, Team ID set, ACTIVE. No Android or web app registered | Firebase Management API `iosApps` |
| App Attest | Resource readable with default 1 h token TTL; the API returns this default whether or not App Attest was ever saved, so registration is **not provable from this read**. The CLI check on 2026-11-04 reported providers **not configured** | App Check API `appAttestConfig` |
| DeviceCheck | **Not configured**: no key ID, no private key | App Check API `deviceCheckConfig` |
| Debug tokens | **0** registered | App Check API `debugTokens` |
| Enforcement, Firestore / Storage / Auth | **Off** (no enforcement mode set; never updated) | App Check API `services/*` |
| Entitlement in the app | `com.apple.developer.devicecheck.appattest-environment = production` | `app.json` |
| Deployed functions | 81 deployed (70 on 2026-10-08, 11 on 2026-10-24); `ENFORCE_APP_CHECK` unset on all | Cloud Functions API |
| Deployed code vs source | **Behind.** 14 functions in the release source are not deployed: `answerTrackingQuestion, coordinateAnalysisTarget, discoverTrackingTask, explainTrackingMoment, extractTrackingSegmentTask, inspectVideoSource, processLinkImportTask, refreshTrackingOcrTask, resolveTrackingTask, saveAnalysisTargetAnchor, setTrackingPeriods, startLinkImport, startPlayerAnalysis, undoTrackingAnswer`. The repository history starts 2026-10-25, so the deployed code cannot be matched to a commit | function list vs `functions/lib` exports |
| Callable enforcement as deployed | **Not verified.** Logs hold one callable request in 45 days (`purgeLegacyGpsLocation`, 2026-10-22, no token, no sign-in, HTTP 401), which either check would produce. A direct test request was blocked by this workspace's network allowlist | Cloud Logging; see 4.1 for the one-line test |
| Unrelated live fault found | `releaseExpiredSuspensions` fails every run (239 x HTTP 500 in 45 days): missing composite index `accountRestrictions(state, until)`. Fix prepared on local branch `fix/account-restrictions-index` @ `9986c4f`, not deployed | Cloud Logging |

## 3. Behaviour matrix

"Token" = App Check token obtained by the app. Firestore, Storage and Auth enforcement are off today, so they work without a token.

| Build | Where | Provider | Token today | Firestore / Storage / Auth | Enforced callables (onboarding role/age/consent, Discover, Plan, upload, analysis, deletion) | Evidence |
|---|---|---|---|---|---|---|
| `development` (dev client) | Simulator | debug | No (0 debug tokens registered) | work | **rejected** if deployed functions enforce; message from 1. | code + live config; needs native run |
| `development` + registered debug token | Simulator | debug | Yes | work | work | needs approval A2 and native run |
| `simulator` (new, release code) | Simulator | App Attest → DeviceCheck | **No, never** (Simulator cannot attest) | work | **rejected** if deployed functions enforce | code + Apple limitation; needs native run |
| `preview` (internal, Ad Hoc) | iPhone | App Attest → DeviceCheck | No until App Attest is registered | work | **rejected** if enforced | needs approval A1 and a device |
| `production` / TestFlight | iPhone | App Attest → DeviceCheck | No until App Attest is registered; yes after | work | rejected until registered, then work | needs approvals A1 and D and a device |
| Any build after Firestore/Storage/Auth enforcement is turned on | any | as above | as above | **rejected without a token** | as above | do not turn on until device metrics show valid tokens |
| Web build against emulators (test only) | browser | none (skipped) | n/a | work | work (emulator never enforces) | **verified**: 65/65 browser runs |

Consequence: until App Attest is registered, no build of this app can complete onboarding on a real or simulated iPhone
**if** the deployed callables enforce App Check, which the source says they do. Separately, analysis and link import cannot
work against the live backend at all until the backend is deployed, whatever App Check does.

## 4. Remediation (prepared, not done)

### 4.1 Confirm live callable enforcement (read-only test, run from any normal network)

```
curl -sS -X POST -H 'Content-Type: application/json' -d '{"data":{}}' \
  https://europe-west6-scoutx-230b0.cloudfunctions.net/getUsageSummary
```
No sign-in, no token, read-only callable, no side effect. Answer `{"error":{"message":"Unauthenticated","status":"UNAUTHENTICATED"}}`
means App Check is enforced; `"message":"Sign in required."` means it is not enforced on that deployed function.

### 4.2 Register providers (approval A1). Registration does not turn enforcement on

1. Firebase console → project `scoutx-230b0` → Build → App Check → Apps → iOS app `com.scoutx.app`
   (`1:141939766260:ios:c23d6b9fe65e8a65bd3fa1`).
2. **App Attest**: Register. Needs only the Team ID, which is already set on the app. No Apple key. Token TTL: keep 1 h.
3. **DeviceCheck** (fallback for devices without App Attest): needs an Apple **DeviceCheck private key** (.p8) and its
   key ID from Apple Developer → Certificates, IDs & Profiles → Keys, with DeviceCheck enabled, team `833CYAZ8XT`.
   Upload in the same App Check screen. The key is a secret: never commit it, paste it, or send it in chat.
4. Do **not** click Enforce for Firestore, Storage or Authentication.
5. Compatibility: none for existing users (enforcement unchanged). Callables start receiving valid tokens from physical
   devices running a store/TestFlight/Ad Hoc build with the App Attest entitlement (already present).
6. Validation: on a physical iPhone running a build of the candidate, complete onboarding (role, age, consent) and open
   Discover and Plan and usage; then App Check console → Metrics shows verified requests for Cloud Functions.
7. Rollback: unregister the provider in the same screen (callables would again reject device requests if enforced).
8. Evidence without secrets: console screenshot of the provider list showing "Registered" (no key shown), metrics chart,
   device protocol rows S9-S11 (below).

### 4.3 Debug token for simulator journeys (approval A2, optional)

Only for a `development` build in the Simulator. Start the dev build once, copy the debug token the native SDK prints in the
Xcode/simulator log, then App Check → Apps → iOS app → Manage debug tokens → Add. Name it after the tester and date. Revoke
it after testing (same screen). Never put it in `eas.json`, git or a release build. A debug token proves nothing about
App Attest or DeviceCheck on a phone.

### 4.4 Product enforcement (later, separate approval)

Turn on enforcement for Firestore, Storage and Auth only after App Check metrics show that nearly all requests from current
app versions carry valid tokens. Rollback: switch the product back to Unenforced (takes effect within minutes).

### 4.5 Never

Do not set `ENFORCE_APP_CHECK=false`, change `EXPO_PUBLIC_APP_CHECK_ENABLED` for release profiles, or ship the debug
provider to make a build work.
