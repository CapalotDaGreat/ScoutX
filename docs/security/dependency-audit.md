# Dependency Audit

Re-run on 2026-10-09 with `npm audit --json` (all dependencies, including dev) for the app and
`npm audit --json --prefix functions`. The earlier SDK-migration baseline is in
`docs/rebuild/DEPENDENCY_AUDIT.md`. Each advisory was reviewed individually; no blanket fix was run.

## Summary

| Tree | Total | High | Moderate | Critical |
| --- | --- | --- | --- | --- |
| App (`package.json`) | 48 package entries | 34 | 14 | 0 |
| Functions (`functions/package.json`) | 9 package entries | 0 | 9 | 0 |

The 57 package entries trace back to **six advisories** in five leaf packages; every other entry is a
parent that depends on one of them. `npm audit fix` without `--force` was checked with `--dry-run`:
it would only bump RevenueCat patch versions (`react-native-purchases` 10.12.0 → 10.12.2) and fixes
none of the six advisories, so it was not run. `--force` proposes downgrades across major versions
(`expo@44`, `firebase@9`, `@sentry/react-native@5`, `react-native-purchases@8`) that would break
Expo SDK 57; rejected.

## Advisories, one by one

| Advisory | Package (installed) | Patched upstream? | Reached through | Exposure in PitchProof | Decision |
| --- | --- | --- | --- | --- | --- |
| [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) RSA PKCS#1 v1.5 signature verification accepts extra DigestAlgorithm elements (CVSS 7.5) | `node-forge` 1.4.0 | No: 1.4.0 is the latest release | `@expo/cli`, `@expo/code-signing-certificates` | Build machine only: Expo Updates code-signing helpers. The iOS binary does not ship node-forge, and the app does not use Expo Updates code signing | Accept until a patched node-forge or Expo CLI ships; re-check each SDK patch |
| [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) `getAuthContext` can return unauthorised certificates (CVSS 7.4) | `@grpc/grpc-js` 1.9.16 | Yes, 1.13.6 / 1.14.x | `firebase` 12.15.0 → `@firebase/firestore` (pins `~1.9`) | Affects gRPC **servers** that use mTLS auth context. PitchProof runs no gRPC server; on iOS and web the Firestore SDK uses WebChannel, and grpc-js is only loaded by the Node build of the SDK (tests) | Accept; an `overrides` entry forcing 1.13+ against Firebase's `~1.9` pin is untested and not worth the risk. Re-check on each Firebase 12.x patch. SECURITY REVIEW: confirm before release |
| [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) server forwards handler error messages to clients (CVSS 3.7) | `@grpc/grpc-js` 1.9.16 | Yes | as above | Server-side only; no gRPC server here | Accept, as above |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) stack-exhaustion DoS through deeply nested brace patterns (CVSS 7.5) | `braces` 3.0.3 | No: 3.0.3 is the latest release | `micromatch` ← `metro`, `tailwindcss`, `fast-glob`, `chokidar` | Build time only, with glob patterns from our own config files. Not shipped in the app | Accept; no attacker-controlled patterns reach it |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) quadratic selector parsing (CVSS 5.9) | `postcss-selector-parser` 6.1.4 | Yes, 7.1.6 (major) | `tailwindcss` 3 → `postcss-nested` | Build time only, parsing our own CSS. Fix needs Tailwind 4, which NativeWind 4 does not support | Accept until a NativeWind/Tailwind upgrade is planned |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) missing bounds check in uuid v3/v5/v6 when `buf` is passed (CVSS 7.5) | `uuid` 3.4.0, 7.0.3 (app tooling); 9.0.1 (functions) | Yes, 11.1.1 (major) | App: `xcode` ← `@expo/config-plugins`, `@expo/ngrok`. Functions: `gaxios`, `google-gax`, `teeny-request` ← `firebase-admin@13` | Needs a caller that passes a `buf` argument to v3/v5/v6. PitchProof code does not import `uuid`; the Google client libraries call `v4()` without a buffer; the app copies run only at build time | Accept. Functions fix = `firebase-admin@14` + `firebase-functions@7` (major **upgrades**), to be planned as its own change with the full rules/emulator suite |

## Runtime vs build-time

- **Shipped in the iOS binary:** none of the six advisories is reachable from shipped app code. The
  Firebase JS SDK carries grpc-js as a dependency but does not use it on iOS or web.
- **Cloud Functions runtime:** only `uuid` (not reachable, see above).
- **Build machine / dev server:** node-forge, braces, postcss-selector-parser, uuid (tooling copies).

## Policy

- Never run `npm audit fix --force` on the app; never accept a downgrade across major versions.
- Lockfiles are committed. There is no CI pipeline in this repo yet; release builds should install
  with `npm ci` and run `node scripts/release-gate.mjs`.
- Native and SDK packages move only with an Expo SDK upgrade (`npx expo install --check`).
- Re-run this review before every release and when Firebase 12.x or Expo SDK 57 patches ship.
- The football-cv worker pins dependencies by range only; pin exact versions (and re-run
  `pip-audit`) before any deployment. NOT DONE: the worker is not deployed.
