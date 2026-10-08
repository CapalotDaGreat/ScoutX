# Threat Model: Privacy

Scope: personal data of all users (see `docs/privacy/data-inventory.md`), with the processors in
`docs/privacy/processor-register.md`. Threats are framed as privacy harms (LINDDUN style) rather than
attacks only.

| ID | Harm | Where it could happen | Control | Evidence | Residual |
| --- | --- | --- | --- | --- | --- |
| P1 | Linkability / identification of a private profile | Public Passport, discovery, portfolio slugs | Server projections with allow-listed fields; public only by choice (and guardian scope for minors) | projection tests, rules | Low |
| P2 | Location disclosure | Movement sessions | No coordinates stored; export strips legacy location fields | `dataRights.test.mjs`, `gpsIntelligence.test.ts` | Low |
| P3 | Cross-user access to media or analyses (IDOR) | Storage paths, `mediaUploads`, `matchAnalysisJobs` | Owner-only rules; quarantine closed; server checks job owner and path prefix | `storage.rules.test.mjs`, `firestore.rules.test.mjs`, `frameAnalysis.ts` | Low |
| P4 | Over-retention | Deleted accounts, exports, uploads | Deletion state machine with verification; export expiry; retention cleanup; legal retention only for listed records | `accountDeletion.test.mjs`, `dataRights.test.mjs` | Periods LEGAL REVIEW REQUIRED; backups would extend retention (`backups.md`) |
| P5 | Unwanted deletion (takeover) | `deleteAuthenticatedAccount` | Server recent sign-in | `deletionAuth.test.mjs` | Low |
| P6 | Processor misuse of footage | AI provider | `data_collection: deny`, `zdr: true` on every request; footage gate until provider review | `aiCallables.test.mjs`, `aiPrivacyGate.test.ts` | ZDR availability NOT VALIDATED |
| P7 | Disclosure in logs or crash reports | Cloud Logging, Sentry | Status codes only for AI calls; Sentry scrubbing | `openRouter.ts`, `src/config/sentry.ts` | Sentry config NOT VALIDATED |
| P8 | Disclosure through guardian links | Email, browser history, referrer | Token without personal data, removed from address bar, `no-referrer`, `no-store`, first name only on the page | `guardianFlow.test.mjs` | Low |
| P9 | Disclosure through public report form | `submitPublicReport` (no App Check) | Rate limit per client address per day; reporter contact stored separately (`publicReporterContacts`), never shown to the reported user | `moderation.test.mjs` | Low |
| P10 | Staff over-access | Moderation tools | Staff role via custom claim from `ADMIN_USER_IDS`; recent sign-in for staff actions; append-only audit log | `moderation.test.mjs` | Low; staff list EXTERNAL |
| P11 | Export link leakage | Data export download | Owner-only, recent sign-in, expiring link | `dataRights.test.mjs` | Signed URL in production NOT VALIDATED |
| P12 | Non-transparency | Legal documents | 14 versioned documents in the app, consent records | `legalContent.test.ts` | Text and translations LEGAL REVIEW REQUIRED |
| P13 | Lock-screen disclosure | Push notifications | Generic text for minors; adults choose | `pushChain.test.mjs` | Device NOT VALIDATED |
| P14 | Re-identification or exposure through external football links (a club or league page names a minor, a query string carries an id) | Passport, scout view | Links private by default; Passport and scout copies only by choice and, for minors, with the guardian `public_passport` / `discovery` scope; copies drop links when consent ends; URLs never logged (`footballSourceLogContext`) | `footballSources.test.mjs`, `footballSources.test.ts` | Medium: the external page itself is outside PitchProof's control |
| P15 | Third-party requests revealing users to football websites | Device, server | Nothing is requested from the site until the viewer taps Open, which hands the link to the system browser; no previews or favicons | release gate `External football sources are link-only` | Low |

Owner decisions this model does not make: legal basis per purpose, retention periods, transfer
safeguards for processors outside Switzerland/EU, whether backups are kept and for how long.
