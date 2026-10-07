# ScoutX Completion Status

Updated 2026-10-07. Initial release target: iOS only.

States: **PASS** (verified by an automated test or run in this repo), **FAIL**, **NOT VALIDATED**
(implemented but needs a device, credentials or production access to verify), **BLOCKED**
(cannot be built or verified without an external dependency).

## Regression gate (all PASS)

| Check | Result |
| --- | --- |
| `npm run typecheck` (app + tests) | PASS |
| `npm run lint` | PASS |
| `npm run test:unit` | PASS, 221 tests |
| `npm run test:rules` (Firestore, Storage, callables, push chain, deletion, reels, requests) | PASS, 85 tests |
| i18n parity across en, de, fr, es, it, nl, pt | PASS |
| `functions` build | PASS |
| `npm run test:e2e:emulators` (Auth, Firestore, Storage, Functions emulators, seeded) | PASS, 11 tests |

## Testing expansion matrix

| Area | State | Evidence |
| --- | --- | --- |
| Football Identity nullability | PASS | `tests/unit/dataTruth.test.ts` |
| Evidence graph | PASS | `tests/unit/evidenceGraph.test.ts` |
| Passport readiness | PASS | `tests/unit/passportSummary.test.ts` |
| Development progression | PASS | `tests/unit/developmentEngine.test.ts` |
| Football Memory | PASS | `tests/unit/footballMemory.test.ts`, `globalSearch.test.ts` |
| Change detection | PASS | `tests/unit/intelligence.test.ts` |
| Scout Brief matching | PASS | `tests/unit/scoutIntelligence.test.ts`, `scoutDecisionSupport.test.ts`, E2E scout brief |
| Recommendation explanations | PASS | why / why-not tests, E2E "Why this player" |
| Evidence gaps | PASS | `tests/unit/intelligence.test.ts` |
| Watchlist updates | PASS | `tests/unit/scoutDecisionSupport.test.ts`, producer policy in `deepLinkResolver.test.ts` |
| Trial replay | PASS | `tests/unit/careerTrust.test.ts`, E2E invite and accept |
| Notification filtering | PASS | `tests/unit/notificationPolicy.test.ts`, `tests/rules/pushChain.test.mjs` |
| Upload retry | PASS (policy) | `tests/unit/uploadPolicy.test.ts`; large uploads on device NOT VALIDATED |
| Deep links | PASS (resolver) | `tests/unit/deepLinkResolver.test.ts`; universal links NOT VALIDATED (see below) |
| Deletion | PASS | `tests/rules/accountDeletion.test.mjs` |
| Permissions | PASS | `tests/rules/firestore.rules.test.mjs`, `storage.rules.test.mjs` |
| Coach verification | PASS | `tests/unit/careerTrust.test.ts`, rules "trust and verification" |

## Acceptance journeys (authenticated E2E on web against emulators)

| Journey step | State |
| --- | --- |
| Player: register, choose role, land in player app | PASS |
| Player: log match, see it in history | PASS |
| Player: create development goal | PASS |
| Player: public Passport reflects the logged match | PASS |
| Player: upload clip to media library | PASS |
| Scout: save brief as filter preset, discover seeded player | PASS |
| Scout: Why this player / why you might wait, save to pipeline | PASS |
| Scout: request evidence; player sees and declines it | PASS |
| Scout: invite to trial; player receives and accepts it | PASS |
| Guest: public Passport shows no private data; unknown username invents nothing | PASS |

Bugs the E2E runs found and fixed: Firestore rejected optional `undefined` fields (journey entries and
trial invitations, which then only existed in local storage); guest-to-account upgrade wrote an
undefined role; role selection and cold deep links were reset by root navigation sync; discovery and
public Passport showed invented zeros for goals, assists and performance.

## Needs you before App Store submission

1. **Icon and splash artwork.** `assets/icon.png`, `splash-icon.png`, `adaptive-icon.png` and
   `favicon.png` are 1x1 placeholders. App Store requires a 1024x1024 icon without transparency.
2. **Support page.** `https://scoutx.app/support` returns 404 (privacy and terms return 200). App Store
   review requires a working support URL. The site is hosted outside this repo (Astro on Cloudflare).
3. **AASA on `scoutx.app`.** `https://scoutx.app/.well-known/apple-app-site-association` returns 404.
   Publish `public/.well-known/apple-app-site-association` (Team ID `833CYAZ8XT`) there with
   `Content-Type: application/json` and no redirect, or point the domain at Firebase Hosting.
4. **App Attest.** Register the iOS app for App Check with App Attest in the Firebase console, then
   enable enforcement for Firestore, Storage and Functions.
5. **Interactive EAS iOS build.** Run `eas build -p ios --profile production` yourself (Apple login and
   credentials prompts), with `GoogleService-Info.plist` provided as an EAS file secret. Production
   builds now fail if `EXPO_PUBLIC_OPENROUTER_API_KEY` is set, so the AI key cannot be bundled.
6. **Privacy policy review.** Confirm the live policy covers what the privacy manifest declares: name,
   email, user ID, precise location (GPS sessions), photos/videos and other user content, all linked to
   the user and not used for tracking.
7. **Server deploy.** Deploy functions (including `renderReel` and the notification producers),
   Firestore rules and indexes, and set the `OPENROUTER_API_KEY` secret.

Store listing (`store/listing.json`) makes no computer-vision claims and no longer describes
self-reported data as "verified".

## NOT VALIDATED (needs devices, credentials or production)

- Native iOS runtime: camera, video picker, GPS on device, background behaviour, media playback.
- Push delivery to a real device (needs APNs key and a device); the server chain is PASS against a mock
  Expo endpoint.
- Universal links on device (depends on the AASA item above).
- Native share sheet for reels and Passport.
- Large and resumable uploads on cellular networks.
- Real AI responses and optional LLM rewording (needs the deployed secret); mocked-provider tests PASS.
- Production Firebase configuration and App Check enforcement.
- Sign in with Apple and Google on device.

## BLOCKED

- Computer-vision analysis (player tracking, ball tracking, automatic event detection, video pitch
  maps): needs a GPU worker. The app shows these stages as unavailable; pitch maps come from GPS only.
- Real-footage validation of match analysis: needs footage.

## Known limitations

- On web, `Alert.alert` is a no-op, so validation and confirmation dialogs do not appear there (the
  trial decline confirmation is one). Not shipped: the release is iOS only.
- The Discover filter option lists (clubs, leagues, suggestions) are static lists, not derived from data.
- The advanced filter sheet is taller than a 720px desktop web viewport (web only).
