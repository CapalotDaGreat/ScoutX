# Encryption and Key-Management Inventory

Self-assessment of transport and storage encryption for PitchProof. Not an independent crypto
audit. **Do not add client-side field encryption to ordinary Firestore documents** unless a threat
model entry justifies envelope encryption and key management is designed first.

## Transport (TLS)

| Path | Encryption | Notes |
| --- | --- | --- |
| App → Firebase Auth / Firestore / Storage | TLS (Firebase SDK) | Production rejects clear-text overrides |
| App → Cloud Functions callables | HTTPS | CORS closed by default; App Check when configured |
| Functions → OpenRouter | HTTPS only | `OPENROUTER_BASE_URL` must be `https://` (SEC-08) |
| Functions → RevenueCat webhook inbound | HTTPS | Shared-secret verification (timing-safe) |
| Functions → Expo push / APNs | TLS | Server-composed payloads only |
| Guardian Hosting → callables | HTTPS | Token in query stripped after load; `no-referrer` |
| Signed Storage upload / playback URLs | HTTPS | Short-lived; never logged |

Certificate pinning is **not** implemented. Rotation and CDN/Firebase certificate changes would
brick clients without an out-of-band update path. Revisit only if a concrete MITM threat on
managed Firebase endpoints justifies operational cost.

## Encryption at rest (managed)

| Store | Provider encryption | Application-layer encryption | Why / residual |
| --- | --- | --- | --- |
| Firestore documents | Google-managed | None | Standard GCP; access controlled by rules + IAM |
| Cloud Storage objects (media, quarantine, exports) | Google-managed | None | Owner isolation via rules; quarantine client-inaccessible |
| Cloud Functions /tmp and worker scratch | Ephemeral disk | None | Jobs delete known objects; no whole-video memory load |
| Secret Manager (`defineSecret`) | Google-managed | N/A | OpenRouter, RevenueCat webhook, guardian HMAC, Apple keys, admin ids |
| Sentry events | Sentry at rest | PII scrubbed before send | No user id attached |
| Device SecureStore (iOS Keychain / Android Keystore) | Platform | AES-GCM on web fallback only | OAuth pending state only; see `docs/SECURE_STORAGE.md` |
| AsyncStorage | OS file encryption (device lock) | None | Preferences, drafts, pending upload resume metadata — not credentials |
| Firebase Auth persistence | OS file encryption | Firebase SDK | ID/refresh tokens via `getReactNativePersistence(AsyncStorage)` — never duplicated in SecureStore |

## Application-level encryption decisions

| Candidate | Decision | Rationale |
| --- | --- | --- |
| Encrypt Firestore profile fields | **Not implemented** | Breaks queries, rules, indexes and backups; managed encryption + rules already address cloud-disk theft under GCP trust |
| Encrypt Storage objects with customer keys | **Not implemented** | Requires CMEK / KMS design, rotation and recovery; deferred until LEGAL / SECURITY REVIEW requires it |
| Encrypt pending upload metadata in SecureStore | **Not implemented** | Metadata is local paths and offsets, not credentials; cleared on sign-out |
| Envelope-encrypt export archives | **Not implemented** | Exports are short-lived signed downloads to the authenticated owner |

## Key material

| Key | Location | Rotation |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Secret Manager | Manual; never in `EXPO_PUBLIC_*` |
| `REVENUECAT_WEBHOOK_SECRET` | Secret Manager | Manual; timing-safe compare |
| `GUARDIAN_LINK_SECRET` | Secret Manager | Min 32 chars; refuse shorter (SEC-05) |
| `ADMIN_USER_IDS` | Secret Manager | Manual |
| Apple Sign In `.p8` | Secret Manager / EAS file secret | Manual; not committed |
| Firebase client config | Bundled `EXPO_PUBLIC_*` | Public by design; protected by App Check + rules |
| OAuth CSRF nonce | SecureStore TTL | Cleared after use / sign-out |

## Verification

- Release gate: no OpenRouter key in client; no committed private keys; HTTPS AI base URL.
- Unit / rules: guardian token HMAC, callable CORS, SecureStorage allowlist, logout clears pending uploads (code path).
- EXTERNAL: production App Check / App Attest, CMEK decision, backup encryption verification (`backups.md`).
