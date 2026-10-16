# Residual Risk Register

Engineering self-assessment. Items here are accepted or blocked pending owner / external action.
Statuses match `security-findings.md`. This is not a certification.

| ID | Risk | Severity | Status | Compensating control | Owner action |
| --- | --- | --- | --- | --- | --- |
| SEC-10 | Anonymous guest deletion without re-auth | Medium | OWNER ACCEPTANCE REQUIRED | Guests hold no profile data | Accept or disable guests |
| SEC-11 | Deletion resume window 24 h with older session | Medium | OWNER ACCEPTANCE REQUIRED | Fresh auth started the job | Accept or shorten window |
| SEC-12 | Self-declared age (minor claims 18+) | Medium | OWNER ACCEPTANCE REQUIRED | Youth features still gated by privacy defaults | Age assurance product decision |
| SEC-13 | No malware scanning of uploads | Medium | OWNER ACCEPTANCE REQUIRED | Quarantine + ffprobe; never claimed in store | Optional AV product |
| SEC-14 | Dependency advisories needing Expo-breaking upgrades | Medium | OWNER ACCEPTANCE REQUIRED | `dependency-audit.md` evidence of non-reachability | Re-check each SDK bump |
| SEC-15 | App Check / App Attest not registered in production | Medium | EXTERNAL | Callables enforce when configured; debug provider off in production builds | Register App Attest |
| SEC-16 | Backups / restore drill missing | Medium | EXTERNAL | `backups.md` | Configure PITR / exports |
| SEC-17 | Guardian is whoever controls the entered email | Low | OWNER ACCEPTANCE REQUIRED | HMAC link, single use | Legal review |
| SEC-18 | First under-13 band choice without re-auth | Low | OWNER ACCEPTANCE REQUIRED | Account empty at that step | Accept |
| T10 | AI provider ZDR not confirmed for selected model | Medium | NOT VALIDATED | `data_collection: deny`, `zdr: true` flags | OpenRouter account check |
| T11 / SEC-21 | Discovery / AI / playback abuse | Medium | FIXED (code) | Callable rate limits | Monitor quotas in production |
| — | Independent penetration test | High (assurance) | SECURITY REVIEW REQUIRED | Emulator rules + unit suites | Commission pentest |
| — | CMEK / customer-managed Storage keys | Low | Deferred | Google-managed encryption | Only if contract requires |
| — | Certificate pinning | Low | Deferred | Firebase managed TLS | Only if MITM threat justifies |

Review date: 2026-10-16. Next review: before public App Store release.
