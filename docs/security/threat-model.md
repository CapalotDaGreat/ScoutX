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
| T17 | Account takeover then deletion | Account | Server requires a sign-in within 5 minutes for `deleteAuthenticatedAccount` and for tightening an existing age band to under-13 (`security/recentAuth.ts`); a deletion started with a fresh sign-in may resume for 24 h; anonymous guests exempt (no credential). Export requires 10 minutes | `deletionAuth.test.mjs`, `deletionAuth.test.ts`, `dataRights.test.mjs` | Low |
| T18 | Grooming through scout contact | Minors | No DMs; guardian scope for contact; guardian notified; trial co-approval; priority reports | `requestCenter.test.mjs` | Medium; see incident response |
| T19 | Webhook forgery | Entitlements | Shared secret check, idempotent receipts | `entitlements.test.mjs` | Low |
| T20 | Supply chain | App and functions | Lockfiles, `npm audit` review | `dependency-audit.md` | Medium |
| T21 | Race: one guardian link used twice at once (approve + decline) | Guardian consent | Link hash compared and cleared inside a Firestore transaction | `guardianFlow.test.mjs` "used twice at the same time" | Low |
| T22 | Weak guardian link secret | Guardian consent | Secrets under 32 characters are refused (links disabled, error logged) | code review | Low |
| T23 | Footage of minors sent to an unreviewed AI provider | Media, minors | Footage analysis and analysis uploads refused until `AI_FOOTAGE_PROCESSING_APPROVED=true` | `aiPrivacyGate.test.ts` | Low in code; provider review EXTERNAL |
| T24 | API key exfiltration via a misconfigured base URL | AI credentials | Deployed functions accept only `https://` overrides of `OPENROUTER_BASE_URL` | `aiPrivacyGate.test.ts` | Low |
| T25 | Phishing or malicious link posted as an "external football source" (`javascript:`, `data:`, lookalike hosts such as `fvrz.ch.attacker.com`, `user@host` tricks, backslashes) | Viewers, scouts | https only; exact host or subdomain match against the provider allowlist; credentials, ports, IPs, whitespace, backslashes and non-ASCII refused; validated on device, on the server and again before opening; clients cannot write the documents | `footballSources.test.ts`, `footballSources.test.mjs`, release gate | Low; an allowlisted site can still host misleading pages |
| T26 | Server-side request forgery or scraping through a stored link | Functions runtime, provider sites | No code fetches, previews, embeds or schedules work for these links; release gate fails on network calls, task queues, schedules, WebViews or scraping packages in the feature | release gate `External football sources are link-only` | Low |
| T27 | Spoofing: a link presented as proof that a player is verified or is the person on the page | Scouts' trust | Provenance is always `self_reported_with_link`; no verified/official field; disclaimer on every card; links never change trust or verification state | `footballSources.test.mjs`, release gate | Medium: viewers may still over-trust a link |
| T28 | Tampering: a player sets status, provider or host directly, or re-shares a reported link | Moderation | Server-owned status and provider; re-sharing refused while not `active`; reports hide the link at once | `footballSources.test.mjs` | Low |
| T29 | Information disclosure / DoS: unbounded discovery search or view increments scrape the index | Discoverable players | Per-uid hourly rate limits on `searchDiscoverablePlayers` and `recordDiscoverableView` | `rateLimit.test.ts`, rules `callableRateLimits` | Low |
| T30 | DoS / cost: minting unlimited signed playback URLs or AI insight bursts | Storage, AI budget | Hourly limits on `getMediaPlaybackUrl`, `askThisMatch`, `generateAiInsight` (quotas remain authoritative for paid features) | `rateLimit.ts` | Low |
| T31 | Predictable client ids for drafts / grants | Local naming | CSPRNG via `secureId` | `secureId.test.ts`, release gate | Low |

Minor-safety and privacy threat models: `threat-model-minor-safety.md`, `threat-model-privacy.md`.
Encryption map: `encryption-inventory.md`. Residual register: `residual-risk-register.md`.
