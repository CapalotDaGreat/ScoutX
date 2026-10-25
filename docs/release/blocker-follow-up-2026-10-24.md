# Blocker follow-up

## Implemented locally

- Replaced the first-500 scan with native indexed discovery pagination. Source
  query ordering precedes filtering, continuation advances through empty batches,
  and schema readiness fails closed during migration. See
  `indexed-discovery-rollout.md` for operator rollout requirements and limitations.
- Added server maintenance for public-derived search fields, all required sort
  indexes, a dry-run-first backfill command and local tests beyond 500 profiles.
- Compatible dependency remediation: Firestore's gRPC patch, PostCSS selector
  parser fixes, Functions UUID overrides and Zod 4.6.7. Scoped API tests cover the
  actual Expo dev-tools schema and required gRPC/UUID runtime APIs. No forced Expo,
  React Native, Firebase or Tailwind major downgrade was applied.
- Full-match preflight now checks exact source/duration/model/anchor scope before
  output or model initialization, verifies actual PTS/RGB anchors early, and
  optionally binds an independently reviewed draft through `--preflight-review`.

## Dependency status

Production-only audits: Functions **0** advisories; app **8 high package entries**,
all tracing to **one leaf advisory**, node-forge GHSA-86w9-cpqp-85rv. It has no
published patched version through 1.4.0. This is unresolved, not accepted or
certified harmless. A safe upstream replacement/patch and toolchain review are
still required; no audit suppression or unreviewed cryptographic patch was used.
Zod's advisory is no longer present in the production audit after the tested
override. These counts exclude development-only dependencies.
The final all-dependency app audit also reports only these same 8 node-forge
entries after compatible tooling fixes: body-parser 2.4.0, fast-uri 3.1.9,
ip-address 10.7.4 and Expo ngrok's UUID 11.1.1 override. No moderate/critical
entries remain in that full audit. Scope/API smoke tests cover those consumers;
an authenticated external tunnel session was not exercised.

Audit logs: `.local/blockers-app-audit-final.json` and
`.local/blockers-functions-audit-final.json`. Primary advisories:
https://github.com/advisories/GHSA-86w9-cpqp-85rv and
https://github.com/advisories/GHSA-mrhx-c7xc-m3w5.
The full app audit including development tooling is
`.local/blockers-app-all-audit-final.json`.
The full Functions audit (including dev dependencies) also reports zero:
`.local/blockers-functions-all-audit-final.json`.

## Remaining flagship blockers

- No authorized local full-match orange #8 recording and completed independent
  ground truth are available here. Protected Veo pages are not downloadable media
  sources; authentication/provider restrictions are not bypassed.
- Wrong-player rate, visibility recall, boundary recovery, occlusion/re-entry and
  full-run performance still need real-footage measurement. Synthetic test passes
  are not an accuracy benchmark. Installed model versions are bound, not weight
  content hashes or proof that all cached weights are present.
- Production worker configuration, immutable CV approval, provider/privacy review,
  representative multi-video acceptance and native-device validation remain open.
  The compiled approval stays null; no production switches were enabled.

No model training, fine-tuning, dataset ingestion, footage upload, production
deployment, console mutation or production index backfill was performed.

## Verification

Passed: 650 app unit tests, 260 complete rules/integration tests, 4 repeated final
index/migration integration tests, 338 worker tests, and 5 desktop plus 5 mobile
scout browser tests. TypeScript, ESLint, Functions build, policy-copy check and
production Expo web export passed. Static internal release gate: no code blocker;
external/legal/real-device and real-footage requirements remain unchanged.

Logs: `.local/blockers-unit-verified.log`, `blockers-rules.log`,
`blockers-index-final.log`, `blockers-worker.log`, `blockers-browser.log`,
`blockers-types-verified.log`, `blockers-lint-verified.log`,
`blockers-functions-build-final.log`, `blockers-web-verified.log` and
`blockers-release-gate.log`. Prefix all relative log names with `.local/`.
Post-tooling-patch checks: `blockers-unit-complete.log` (650 passed),
`blockers-dependency-smoke-final.log`, `blockers-lint-complete.log`,
`blockers-types-complete.log`, `blockers-web-complete.log`; final continuation
guard checks: `blockers-continuation-lint.log`, `blockers-web-release-check.log`.

Firestore tests target only the local Standard-edition `demo-scoutx` emulators;
migration instructions are not a claim of deployed setup. Emulator tests do not
validate real composite-index provisioning. No temporary Functions secret file
is retained. Existing dependency/browser framework deprecation warnings are not
claimed to be fixed; no failing tests were skipped to obtain these results.
