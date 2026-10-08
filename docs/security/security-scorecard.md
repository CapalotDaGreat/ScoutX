# Security Scorecard

States: **PASS** (automated test in this repo), **PARTIAL**, **NOT VALIDATED** (needs production,
devices or credentials), **SECURITY REVIEW REQUIRED**, **EXTERNAL CONFIGURATION REQUIRED**.
This is a self-assessment, not an audit.

| Control | State | Evidence |
| --- | --- | --- |
| Firestore owner isolation (media, analyses, movement, scouting) | PASS | `tests/rules/firestore.rules.test.mjs` |
| Storage owner isolation, quarantine closed to clients | PASS | `tests/rules/storage.rules.test.mjs` |
| Server-only fields (age band, scopes, entitlements, moderation, staff) | PASS | rules "youth safety", `entitlements.test.mjs`, `moderation.test.mjs` |
| Minor visibility needs guardian scopes | PASS | rules "youth safety", projection tests |
| Guardian token signing and expiry | PASS | `safetyPolicy.test.ts` |
| Trial acceptance by minors needs guardian co-approval | PASS | rules `trialInvitations` tests |
| Generic lock-screen copy for minors / unknown age | PASS | `pushChain.test.mjs` "lock-screen privacy" |
| No AI key in the client | PASS | production build guard in `app.config.ts`; release gate |
| AI provider privacy flags on every request | PASS | `aiCallables.test.mjs` |
| ZDR actually available for the selected model | NOT VALIDATED | needs OpenRouter account check |
| Premium entitlement server-owned | PASS | `entitlements.test.mjs` |
| RevenueCat webhook authentication and idempotency | PASS (simulated) | `entitlements.test.mjs` |
| Staff roles via custom claims, audit log append-only | PASS | `moderation.test.mjs` |
| Upload limits, quarantine, ffprobe validation | PASS (emulator) | `uploads.test.mjs`, `chunkedUpload.test.ts` |
| Malware scanning | NOT AVAILABLE | seam only; never claimed |
| Callable CORS allow-list | PASS | `callableCors.test.ts` |
| App Check enforcement | NOT VALIDATED / EXTERNAL CONFIGURATION REQUIRED | App Attest registration needed |
| Deep link validation and auth gate | PASS | `deepLinkResolver.test.ts`, `notifyLinksRecovery.test.ts` |
| Account deletion completeness | PASS | `accountDeletion.test.mjs` |
| Recent sign-in for export | PASS | `dataRights.test.mjs` |
| Recent sign-in for deletion (server side) | PASS | `deletionAuth.test.mjs`, `deletionAuth.test.ts` (5 min; anonymous and resume policy await owner acceptance, SEC-10/11) |
| Guardian link single use under concurrency | PASS | `guardianFlow.test.mjs` |
| Guardian re-approval when a minor's trial changes | PASS | `guardianFlow.test.mjs` |
| Scout notifications to minors need scout_contact | PASS | `firestore.rules.test.mjs` |
| AI footage blocked until provider review | PASS (code) / EXTERNAL CONFIGURATION REQUIRED | `aiPrivacyGate.test.ts`; `AI_FOOTAGE_PROCESSING_APPROVED` |
| OpenRouter timeout and typed failures | PASS | `aiPrivacyGate.test.ts` |
| Secrets outside the repo | PASS | `defineSecret` only; `GoogleService-Info.plist` not committed |
| Crash report scrubbing | PASS (code review) | `src/config/sentry.ts`, `scrubSensitiveData` |
| Backups / restore drill | EXTERNAL CONFIGURATION REQUIRED | `backups.md` (BACKUP_CONFIGURATION_REQUIRED), `disaster-recovery.md` |
| Dependency advisories | PARTIAL | `dependency-audit.md` |
| Age assurance beyond self-declaration | NOT AVAILABLE | accepted risk T1, LEGAL REVIEW REQUIRED |
| Independent penetration test | SECURITY REVIEW REQUIRED | not performed |
| Phase 14 adversarial self-review | PASS for code findings; owner acceptance pending | `security-findings.md` |
