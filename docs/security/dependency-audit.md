# Dependency Audit

Run on 2026-10-07 with `npm audit --omit=dev` (production dependencies only). The earlier
SDK-migration baseline is in `docs/rebuild/DEPENDENCY_AUDIT.md`.

## App (`package.json`)

44 advisories: 31 high, 13 moderate, 0 critical.

Every proposed fix is a **downgrade across major versions** (`npm audit fix --force` would install
`expo@44`, `firebase@9`, `react-native@0.72`, `@sentry/react-native@5`, `react-native-purchases@8`).
That would break Expo SDK 57, so it was **not applied**, as the project rules require.

| Group | Packages | Exposure |
| --- | --- | --- |
| Expo CLI and build tooling | `@expo/cli`, `@expo/metro*`, `@expo/config*`, `metro*`, `node-forge`, `@expo/code-signing-certificates` | Build machine and dev server. Not shipped as runtime JS in the iOS binary |
| Styling build chain | `tailwindcss`, `nativewind`, `react-native-css-interop`, `braces`, `micromatch`, `chokidar`, `fast-glob`, `postcss-*` | Build time only |
| Firebase JS SDK | `firebase`, `@firebase/firestore*`, `@grpc/grpc-js` | Runtime. Track Firebase 12.x patch releases |
| Native modules | `react-native`, `react-native-reanimated`, `react-native-worklets`, `react-native-view-shot`, `@react-native-firebase/*`, `@react-native-google-signin/google-signin`, `@sentry/react-native`, `react-native-purchases`, `expo-sharing`, `expo-splash-screen` | Flagged mainly through transitive tooling deps; versions are pinned by the Expo SDK 57 compatibility set |

Action: update within the SDK 57 compatible ranges (`npx expo install --check`) when patches ship;
re-run this audit before each release. SECURITY REVIEW REQUIRED for the runtime Firebase advisories.

## Functions (`functions/package.json`)

9 advisories: 9 moderate, 0 high, 0 critical. They come from `firebase-admin@13` and
`firebase-functions@6` transitive Google Cloud packages (`google-gax`, `gaxios`, `teeny-request`,
`retry-request`, `uuid`). The fix is `firebase-admin@14` / `firebase-functions@7` (major upgrades).

Action: plan the major upgrade as its own change with the full rules and emulator suite; not done
in this program. The flagged `uuid` issue ("missing buffer bounds check when buf is provided")
needs a caller passing a buffer; ScoutX code does not call `uuid` directly.

## Policy

- Never run `npm audit fix --force` on the app.
- Lockfiles are committed. There is no CI pipeline in this repo yet; release builds should install
  with `npm ci` and run `node scripts/release-gate.mjs`.
- Native and SDK packages move only with an Expo SDK upgrade.
