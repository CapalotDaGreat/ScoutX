# Threat Model

Method: STRIDE per asset, based on the implementation in this repo. Ratings are engineering
estimates; SECURITY REVIEW REQUIRED by an independent reviewer before launch.

## Assets

Minors' data and visibility, private media, guardian consent, AI credentials, premium
entitlements, staff powers, account deletion and export, notification channel.

## Threats

| ID | Threat (STRIDE) | Asset | Mitigation | Test evidence | Residual |
| --- | --- | --- | --- | --- | --- |
| T1 | Spoofing: a minor claims to be 18+ | Youth protections | Self-declared band; adults may only move to a stricter band (`canChangeAgeBand`); reports can trigger review | `safetyPolicy.test.ts` | **High**: no age verification. Accepted for launch; LEGAL REVIEW REQUIRED |
| T2 | Spoofing: player approves their own guardian request | Guardian consent | Signed token emailed by the server; decision only on Hosting page; token hash stored | `safetyPolicy.test.ts`, rules "youth safety" | Medium: player chooses the guardian email |
| T3 | Tampering: client writes its own age band, scopes or guardian status | Youth protections | `userSafety` server-written only | rules "youth safety" | Low |
| T4 | Tampering: client grants itself premium | Entitlements | Webhook-only writes, server quota ledger | `tests/rules/entitlements.test.mjs` | Low |
| T5 | Tampering: client role or staff escalation | Staff powers | Role write rules; `staffRole` custom claim set only via `ADMIN_USER_IDS` | `tests/rules/moderation.test.mjs` | Low |
| T6 | Information disclosure: cross-user reads of media, analyses, movement | Private data | Owner-only rules, signed URLs for grants | `firestore.rules.test.mjs`, `storage.rules.test.mjs` | Low |
| T7 | Information disclosure: quarantine access | Unvalidated media | No client rule on `quarantine/`; resumable session bound to object path and size | `storage.rules.test.mjs`, `uploads.test.mjs` | Low |
| T8 | Information disclosure: AI key extraction from app | AI credentials | Key only in Functions secrets; build-time guard | `app.config.ts` guard | Low |
| T9 | Information disclosure: lock-screen preview of a minor's notifications | Minors | Generic copy for minors and unknown age | `pushChain.test.mjs` | Low |
| T10 | Information disclosure: AI provider retention | Media, analysis | `data_collection: deny`, `zdr: true` | `aiCallables.test.mjs` | Medium until ZDR confirmed |
| T11 | DoS / cost: upload or AI abuse | Budget | Upload size/duration limits, 2 active / 10 per day sessions, plan quotas, concurrency limits | `chunkedUpload.test.ts`, `premium.test.ts` | Medium |
| T12 | Malicious file processed by ffprobe/ffmpeg | Functions runtime | Quarantine, type allow-list, ffprobe validation, isolated function instances, no execution of content. **No antivirus scanning** | `uploads.test.mjs` | Medium |
| T13 | Prompt injection in user text | AI output | Prompt builder isolates user content; output validator | `analysisPipeline.test.ts` injection fixture | Medium |
| T14 | Repudiation: staff abuse | Moderation | Append-only `adminAuditLog`, no client access | `moderation.test.mjs` | Low |
| T15 | Spam: forged activities / pushes to other users | Notification channel | Server-written activities; delivery refuses client-forged copy | `pushChain.test.mjs` | Low |
| T16 | Elevation: deep link opens protected screen without sign-in | App screens | Resolver auth gate and id validation | `deepLinkResolver.test.ts`, `notifyLinksRecovery.test.ts` | Low |
| T17 | Account takeover then deletion | Account | Firebase Auth; export requires a sign-in within 10 minutes | `dataRights.test.mjs` | Medium: deletion has no server-side recent sign-in check |
| T18 | Grooming through scout contact | Minors | No DMs; guardian scope for contact; guardian notified; trial co-approval; priority reports | `requestCenter.test.mjs` | Medium; see incident response |
| T19 | Webhook forgery | Entitlements | Shared secret check, idempotent receipts | `entitlements.test.mjs` | Low |
| T20 | Supply chain | App and functions | Lockfiles, `npm audit` review | `dependency-audit.md` | Medium |
