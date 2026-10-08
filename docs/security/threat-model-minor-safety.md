# Threat Model: Minor Safety

Scope: players aged 13 to 17 (`userSafety.ageBand == '13-17'`). Under-13 accounts are not allowed and
are deleted when that band is chosen. Adults who interact with minors (scouts, coaches) are the main
threat actors, followed by other users and the minor's own account being misused.

Guiding rule: everything that exposes a minor or lets an adult reach them is off until a guardian
grants the specific scope by signed email link, and the server enforces it.

## Assets

Minor's identity and location, contact channel to the minor, media showing the minor, the guardian's
decisions, the guardian's email address.

## Threats and controls

| ID | Threat | Control | Evidence | Residual |
| --- | --- | --- | --- | --- |
| M1 | Minor claims to be an adult | Self-declared band; adults may only move to a stricter band; reports can trigger review | `safetyPolicy.test.ts` | **Medium**, no age assurance (SEC-12, LEGAL REVIEW REQUIRED) |
| M2 | Minor writes own age band, guardian status or scopes | `userSafety` is server-written only | rules "youth safety" | Low |
| M3 | Minor approves own guardian request | Link sent by the server to the guardian email; own email refused; decision only on the web page; hash-only storage | `guardianFlow.test.mjs` | Low-Medium (SEC-17: guardian = whoever controls the email) |
| M4 | Guardian link reused, forged or raced | HMAC signature, expiry, purpose, transactional single use | `guardianFlow.test.mjs` | Low |
| M5 | Minor discoverable or public without consent | Discovery and Passport projections need `discovery` / `public_passport` scopes; re-projected when safety changes | rules + projection tests | Low |
| M6 | Scout invites a minor without consent | `trialInvitations` create needs `scout_contact` scope | rules "minor trials" | Low |
| M7 | Minor accepts a trial before the guardian | Acceptance needs `guardianApproval == 'approved'` (server-written) | rules "minor trials" | Low |
| M8 | Scout changes the trial after guardian approval | Re-approval trigger resets approval and acceptance, new guardian email | `guardianFlow.test.mjs` (SEC-19) | Low |
| M9 | Scout keeps messaging after consent is withdrawn | Trial notifications to a minor need `scout_contact` | `firestore.rules.test.mjs` (SEC-20) | Low |
| M10 | Direct messages / off-platform contact details | No direct messaging feature; Passport never shows email or phone | product design, projection tests | Medium: users can still put contact details in free text; reports and moderation |
| M11 | Lock-screen exposure | Generic notification text for minors and unknown age | `pushChain.test.mjs` | Low |
| M12 | Paywall pressure on minors | Paywall never auto-presented to minors; safety, deletion, privacy, guardian controls never paywalled | `premium.test.ts`, `plans.ts` | Low |
| M13 | Footage of a minor sent to an unreviewed AI provider | `AI_FOOTAGE_PROCESSING_APPROVED` gate; per-user AI consent; guardian scope for AI | `aiPrivacyGate.test.ts` | Low in code; provider review EXTERNAL |
| M14 | Account takeover then deletion or band change | Recent sign-in on the server for deletion and under-13 tightening | `deletionAuth.test.mjs` | Low |
| M15 | Grooming via scouting reports or trial notes | Reports are private to the scout; guardian notified on scout contact; priority reporting and SEV1 procedure | `requestCenter.test.mjs`, `incident-response.md` | Medium (behavioural risk) |

## Not validated

Guardian emails on real mail providers, lock-screen text on a real device, moderation response times
(no staff rota yet). See `docs/release/validation-matrix.md`.
