# Dependency Audit — ScoutX 2.0 Phase 0

> Baseline captured from `package.json`, `functions/package.json`, and Expo configuration. Versions are not changed in Phase 0.

## Current baseline

| Area | Current baseline | Risk |
|---|---|---|
| Expo | `~54.0.36` | Must migrate across three SDK generations to SDK 57. |
| React Native | `0.81.5` | Target is RN 0.86 under SDK 57. |
| React | `19.1.0` | Target is React 19.2.x. |
| Babel preset | `~54.0.0` | Must move with Expo SDK. |
| Reanimated | `~4.1.1` | Verify SDK 57 and Worklets pairing. |
| Worklets | `0.5.1` | Verify exact Expo/RN compatibility; do not bump independently. |
| Gesture Handler | `~2.28.0` | Verify new-architecture support and navigation integration. |
| NativeWind | `^4.2.3` | Verify Metro/Babel integration against SDK 57. |
| FlashList | `2.0.2` | Verify RN 0.86 and list API behavior. |
| Video | `expo-video ~3.0.16` | Recheck API and native config; remove any expo-av remnants. |
| Firebase client | JS SDK `^12.15.0` plus RNFirebase App/App Check `^25.1.0` | Dual client stack increases initialization and native-build risk. |
| Auth providers | Google Sign-In `^16.1.2`, Apple auth `~8.0.8` | Require development-build validation, not Expo Go assumptions. |
| Sentry | `~7.2.0` | Verify plugin and native integration on SDK 57. |
| React Navigation | 7.x packages | Retain unless SDK validation exposes a concrete issue. |
| Testing | Playwright only in root | Jest, RNTL, and Maestro are not currently present. |
| Functions | Node 20, Firebase Functions 6.x | Separate backend runtime decision from client SDK migration. |

## Compatibility hazards

- `expo install --fix` must be run from the root after selecting SDK 57-compatible versions.
- `expo-doctor` findings must be classified as actionable, justified, or unrelated; warnings must not be silently ignored.
- Reanimated, Worklets, Gesture Handler, NativeWind, and FlashList form a coupled native-architecture slice.
- `@react-native-firebase/*`, Google Sign-In, Sentry, location, notifications, media, and build-properties plugins require a development build.
- `app.config.ts` adds plugins conditionally and uses Expo Go stubs. This behavior must be preserved only where it remains necessary after migration.
- The root and `functions` packages have independent dependency graphs and build commands.

## Cleanup candidates after compatibility is proven

- Remove obsolete Expo 54 workarounds only after the SDK 57 build and runtime checks pass.
- Remove dead Expo Go-only production paths and client AI key plumbing after confirming all call sites.
- Avoid adding a chart dependency until current SVG charts are measured and judged insufficient.
- Add React Query, React Hook Form, and Zod in the architecture/forms phases, not as part of a blind SDK upgrade.

## Required checks

```text
npx expo install --fix
npx expo-doctor
npm run typecheck
npm run lint
npm run test:e2e:web
npm --prefix functions run build
```

Run the narrowest applicable check after each change, then the full set at the end of the migration phase.
