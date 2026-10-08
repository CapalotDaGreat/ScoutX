# Security Audit — PitchProof 2.0 Phase 0

> Static review of Firebase rules, app configuration, AI configuration, and documented architecture. This is not a penetration test.

## Positive controls already present

- Firestore rules deny client access to `authProviderTokens`.
- User-owned documents generally use UID ownership checks.
- Storage has a deny-by-default catch-all.
- AI configuration forces production toward Cloud Functions and does not expose the configured OpenRouter key in production mode.
- App Check integration exists and is initialized during Firebase bootstrap.
- Admin review and Apple token functionality are separated into Cloud Functions.

## High-priority risks to verify

| Area | Evidence | Required action |
|---|---|---|
| Firestore activities | Any signed-in client can create an activity. | Confirm server-side creation model and validate actor/recipient fields; restrict client writes if possible. |
| Firestore trial notifications | Any signed-in client can create a notification. | Move creation to trusted server paths or validate sender and recipient relationships. |
| Firestore trust profiles/recommendations | Signed-in users can read broad trust data. | Confirm intended privacy and avoid exposing private or pending moderation data. |
| Firestore GPS | Any signed-in user can read GPS sessions unless portfolio privacy blocks only public reads. | Confirm whether authenticated users should see raw location data; consider owner/approved-scout access and aggregation. |
| Firestore verification states | Any signed-in user can read states; clients can create/update their own state within limited levels. | Verify this cannot be used to imply unsupported verification authority. |
| Firestore scouting reports | Scout ownership is enforced, but player access is absent. | Confirm product intent for post-trial report visibility and implement explicit sharing if required. |
| Storage | Video and match footage writes validate owner and size, but not content type or upload quotas. | Add content-type, path, quota, and lifecycle checks where supported. |
| Role trust | Client rules accept `guest`, `player`, and `scout`; coach is handled in app navigation but is not a valid client role in this helper. | Reconcile role model across Auth, rules, and navigation before adding role-sensitive features. |
| AI endpoints | Cloud Functions exist, but rate limiting, structured output validation, and sensitive-content logging policy need a dedicated review. | Inspect every callable and add authorization, quotas, schema validation, and redacted logs. |
| Deep links | Auth/player link routes are configured through dynamic config. | Test malicious/invalid parameters and ensure auth actions cannot be replayed. |
| Configuration | Public Firebase config is expected; secrets must remain server-side. | Scan tracked files and build env handling for credentials before release. |

## Rules review requirements

1. Test allow and deny cases with the Firebase Emulator where practical.
2. Verify all writes validate immutable ownership fields and immutable timestamps/IDs.
3. Ensure private scout notes, pipeline data, draft data, and analytics do not inherit broad read access.
4. Ensure privacy toggles affect both direct reads and denormalized discovery documents.
5. Add explicit retention/deletion behavior for media, GPS, reports, and account deletion.

## Phase 0 conclusion

The repository has meaningful baseline controls, but several broad authenticated read/create rules deserve priority before exposing more recruitment, privacy, GPS, or notification functionality. SDK migration must not weaken these boundaries.
