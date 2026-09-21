# SDK 57 Migration — ScoutX 2.0 Phase 0

## Target

- Expo SDK 57, current stable patch release
- React Native 0.86
- React 19.2.x
- Node 22.13+ for the Expo SDK 57 toolchain
- Android API 36 and iOS 16.4+ build baselines where configured by Expo/EAS
- React Native New Architecture only

## Current state

The root package is on Expo `~54.0.36`, React Native `0.81.5`, React `19.1.0`, and `babel-preset-expo ~54.0.0`. New Architecture is already enabled. There are no checked-in `ios/` or `android/` directories, so the project uses Continuous Native Generation/EAS prebuild.

## Migration sequence

1. Record the current clean baseline and keep active user changes isolated.
2. Confirm Node and npm versions, then inspect Expo's SDK 55, 56, and 57 breaking changes relevant to this dependency set.
3. Update the Expo package and React/RN baseline using Expo's supported install workflow.
4. Run `npx expo install --fix` and inspect every changed package.
5. Run `npx expo-doctor`; resolve relevant warnings rather than suppressing them.
6. Validate the coupled native slice: Reanimated, Worklets, Gesture Handler, NativeWind, FlashList, Screens, SVG, video, location, notifications, image picker, Sentry, Firebase, and Google Sign-In.
7. Recheck `babel.config.js`, `metro.config.js`, `app.config.ts`, plugins, permissions, and Expo Go stubs.
8. Build a development client. Expo Go is not the production development environment for this app because Firebase, Google Sign-In, Sentry, and other native modules are configured.
9. Run typecheck, lint, web E2E, Functions build, and targeted smoke flows.
10. Regenerate native projects only through the normal EAS/CNG workflow; do not commit native directories unless the project decision changes.

## Compatibility decisions

- Keep React Navigation 7 unless a concrete SDK 57 incompatibility appears.
- Keep Firebase JS SDK for Auth/Firestore/Storage unless migration evidence justifies consolidation; separately validate RNFirebase App Check.
- Keep custom SVG charts initially.
- Do not add React Query, Zod, or React Hook Form during the dependency-only migration.
- Keep production AI calls server-side; do not turn a local provider into a production path.

## Validation gates

### Gate A: dependency graph

- `npx expo install --fix`
- `npx expo-doctor`
- inspect lockfile/package diff

### Gate B: static code

- `npm run typecheck`
- `npm run lint`
- `npm --prefix functions run build`

### Gate C: runtime

- development build launches
- auth bootstrap resolves
- player and scout role routing works
- deep links do not bypass auth/privacy
- media, location, notifications, and App Check initialize or fail gracefully
- web export still launches with documented native fallbacks

## Rollback boundary

Do not begin the UI/navigation overhaul until the SDK 57 baseline passes the static and runtime gates, or every remaining failure is explicitly documented with an owner and reason.

## Phase 1 result

Completed on 2026-09-21.

- Expo `~57.0.24`
- React Native `0.86.3`
- React `19.2.3`
- Node `22.23.2`
- Expo Doctor: **21/21 checks passed**
- TypeScript: passed
- ESLint: passed
- Cloud Functions build: passed
- Web smoke tests: **8/8 passed** on desktop and mobile projects

Migration fixes included:

- Updated the Expo-managed native dependency set and development tooling.
- Replaced the incompatible Lucide release with a React 19-compatible release.
- Moved legacy splash settings to the `expo-splash-screen` plugin.
- Registered SDK 57 config plugins through the dynamic `app.config.ts` path.
- Added Node ambient types for the TypeScript Expo config.
- Updated `expo-video` and React Native StyleSheet usage for SDK 57 typings.
- Fixed auth bootstrap so the anonymous fallback cannot block visible login/register controls.
- Added the SDK 57 dotenv allow-list to the web E2E launcher for the existing named TLS setting.

The development-client/native runtime gate remains device/build-specific and must be run before Phase 2 release work.
