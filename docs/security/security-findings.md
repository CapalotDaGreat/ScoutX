# Security Findings (Phase 14 adversarial review)

Self-review by the development team on 2026-10-08, not an independent audit. Severities:
**Critical** (exploitable now, severe harm, especially to minors), **High** (exploitable with modest
effort or serious privacy impact), **Medium** (needs preconditions or limited impact), **Low**
(hardening).

Status values: `FIXED` (code + test in this repo), `OPEN`, `OWNER ACCEPTANCE REQUIRED` (residual risk
that only the owner can accept), `EXTERNAL` (needs configuration outside the repo).
The release gate fails on any `OPEN` Critical or High row and reports `NOT VALIDATED` while any row
awaits owner acceptance.

| ID | Severity | Status | Finding | Fix / evidence |
| --- | --- | --- | --- | --- |
| SEC-01 | High | FIXED | Account deletion callable accepted any signed-in session; a stolen or long-lived session could delete the account without proving the credential again | Server checks `auth_time` (5 min) in `assertDeletionAuthorized`; client re-auth for password / Apple / Google then retries. `tests/rules/deletionAuth.test.mjs`, `tests/unit/deletionAuth.test.ts` |
| SEC-02 | High | FIXED | `setAgeBand('under13')` deleted an established account immediately (bands may only get stricter, so adults could be moved to under-13), bypassing any deletion re-auth | Tightening an existing band to under-13 now requires the same recent sign-in and makes the account private (deletion only follows if no parental consent arrives within 14 days); scout, coach and club accounts cannot switch to under-13. `deletionAuth.test.mjs` |
| SEC-03 | Medium | FIXED | Client still contained a local deletion fallback (Firestore deletes + `deleteUser`) when the callable was unavailable, which would orphan server-only data | Removed; deletion is server-only and the device signs out only after server confirmation. Release gate "Account deletion is server-enforced" |
| SEC-04 | Medium | FIXED | Guardian link "single use" was not transactional: approve and decline sent at the same time could both succeed | Hash compared and cleared in a transaction (`updateIfLinkUnused`). `guardianFlow.test.mjs` "used twice at the same time" |
| SEC-05 | Low | FIXED | No minimum length for `GUARDIAN_LINK_SECRET` | Secrets under 32 characters disable guardian links and log an error |
| SEC-06 | High | FIXED (code) / EXTERNAL | Footage of minors could be sent to the AI provider before any provider privacy review | `AI_FOOTAGE_PROCESSING_APPROVED` gate on upload sessions and frame analysis (AI_PRIVACY_CONFIGURATION_REQUIRED). `aiPrivacyGate.test.ts` |
| SEC-07 | Medium | FIXED | OpenRouter calls had no timeout; a hanging provider held functions until their 300 s limit and network errors threw untyped | 120 s `AbortSignal.timeout`, typed failure. `aiPrivacyGate.test.ts` |
| SEC-08 | Low | FIXED | `OPENROUTER_BASE_URL` override accepted `http://`; the API key would travel in clear text | Deployed functions accept only `https://` overrides |
| SEC-09 | Low | FIXED | User-facing errors named the provider ("OpenRouter API key is not configured") | Replaced with neutral, actionable copy and `reason` codes |
| SEC-19 | High | FIXED | After a guardian approved a minor's trial, the scout could change club, coach, location or date and the approval (and the minor's acceptance) stayed valid | `onTrialInvitationUpdatedGuardian` resets approval to pending, returns an accepted trial to pending and emails the guardian a new link. `guardianFlow.test.mjs` "changing an approved minor trial" |
| SEC-20 | Medium | FIXED | After a guardian withdrew scout contact, a scout could keep sending free-text trial notifications (500 characters) to the minor through existing trials | Rule requires `scout_contact` scope for notifications to a minor. `firestore.rules.test.mjs` "after scout contact is withdrawn" |
| SEC-10 | Medium | OWNER ACCEPTANCE REQUIRED | Anonymous (guest) sessions can delete themselves without re-authentication | Guests have no credential to re-prove and no profile; documented policy in `security/recentAuth.ts` |
| SEC-11 | Medium | OWNER ACCEPTANCE REQUIRED | A deletion started with a fresh sign-in can be resumed with an older session for 24 h | Needed so a failed deletion can be retried; deletion was already authorised |
| SEC-12 | Medium | OWNER ACCEPTANCE REQUIRED | Age is self-declared (T1); a minor can claim 18+ | No age assurance; LEGAL REVIEW REQUIRED |
| SEC-13 | Medium | OWNER ACCEPTANCE REQUIRED | Uploaded media is validated (quarantine, ffprobe) but not malware-scanned | Never claimed in UI or store copy |
| SEC-14 | Medium | OWNER ACCEPTANCE REQUIRED | Dependency advisories that need breaking Expo upgrades are not applied | `dependency-audit.md` |
| SEC-15 | Medium | EXTERNAL | App Check / App Attest not yet registered; callables enforce App Check once configured | release configuration checklist |
| SEC-16 | Medium | EXTERNAL | No backups configured; no restore drill | `backups.md` (BACKUP_CONFIGURATION_REQUIRED) |
| SEC-17 | Low | OWNER ACCEPTANCE REQUIRED | Guardian is whoever controls the email address the teen enters (T2) | Inherent to email-based consent; LEGAL REVIEW REQUIRED |
| SEC-18 | Low | OWNER ACCEPTANCE REQUIRED | Choosing under-13 as the *first* age band deletes the account without re-auth, so a stolen session of an account that never picked a band could delete it | Picking a band is the first step after sign-up and the app is unusable without one, so such accounts hold no data yet |

## Verified without findings

- Guardian tokens: HMAC-SHA256, 128-bit nonce, purpose-bound, 7-day expiry (revoke 400 days), only the
  hash stored, no personal data in the token, token stripped from the URL, `no-referrer`, `no-store`.
- Guardian approval is decided only by server callables; `userSafety` is server-written.
- Deletion completeness: every user-keyed collection is deleted except documented legal retention
  (`legalRetention`, moderation decisions, admin audit log); state machine is resumable and idempotent.
- Premium: `entitlements`, `usageLedger`, `analysisQuotas` are server-write-only; no server code reads a
  client `isPremium`; RevenueCat webhook uses a timing-safe secret comparison and idempotent receipts.
- Cloud Tasks handlers (`extractMatchSegment`, `analyzeMatchFrames`, `buildDataExport`) are task-only
  functions with retry limits; analysis jobs use leases, attempt limits and idempotency keys.
- Media path never loads a whole video into memory.
- Prompt injection: user data framed as untrusted, sanitised, JSON-only output validated against
  allowlists (frame ids, timestamps, enums).
- CV worker reports NOT_AVAILABLE for every stage.

## Not reviewed

Independent penetration test, native iOS binary (jailbreak, keychain), production IAM bindings,
OpenRouter/provider contracts.
