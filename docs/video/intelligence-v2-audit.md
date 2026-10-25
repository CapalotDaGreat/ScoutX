# Video Intelligence 2.0: Initial Audit And Backlog

Inspected 2026-10-23. This is the implementation starting point, not a validated production claim. Existing Next Era/release/legal changes are preserved. No production deployment, model request or footage processing is authorized by this audit.

## Existing Architecture

- Expo 57 / React Native / strict TypeScript with existing feature repositories, hooks, shared primitives, Firebase ownership rules, App Check and server-side entitlements.
- Full footage uses random-access 8 MiB chunks, a GCS resumable session, persisted fingerprints/checksum offsets, server quarantine/container/CRC32C verification, and a 4 GiB / 150-minute ceiling. No whole-file JS read is required by this transport.
- Cloud Tasks extract/review 10-minute segments and synthesize bounded frame-cited observations. Tasks carry pipeline generations. Source retention, consent withdrawal and deletion are implemented.
- Python reference worker: RT-DETR, ByteTrack, jersey OCR, kit matching and v2 segment contract. Events and pitch mapping are explicitly unavailable. Compiled evaluation approval is absent, so the worker remains disabled.
- Identity confirmation with withheld coaching, evidence/corrections and source-retention-aware seek controls already exist. Sampled still frames are not continuous football action evidence.
- Phone GPS uses session-local coordinates and location-free stored summaries. No existing wearable importer was found in the GPS feature.
- Discovery card is reused by discovery/carousels and holds image failure in local component state, requiring reset when identity/image inputs change.

## Concrete Defects And Risks

1. Resumable transport trusts malformed/out-of-range offsets, permits a 308 no-progress loop, and has no bounded per-request timeout. Pause/cancel checks are outside retry loops.
2. CV segment caching checks existence rather than generation. CV and review writes occur outside the final progress transaction. Stale in-flight work can overwrite a newer generation's subdocument.
3. Final report commit checks cancellation but not the initiating generation. Long-running synthesis must not publish into a newer analysis.
4. CV parsing accepts negative decoded frame counts and contradictory identity/stage/visibility evidence; event timestamps must be inside their cited event interval and visible-target coverage before factual counting.
5. Whole-track OCR voting can contaminate observations before/after an identity switch. Single highest-confidence OCR text is not temporal consensus. Off-camera gaps cannot imply location or actions.
6. Phone GPS movement-axis alignment is not known pitch orientation. Import quality, pauses, clock alignment, provider provenance and raw-location removal need explicit treatment.
7. No legally authorized annotated full-match dataset, GPU benchmark environment, native background-upload implementation proof or physical devices are available in this workspace. Synthetic tests cannot establish accuracy, throughput over real networks, battery cost or full-match acceptance.

## Ordered Implementation

1. Baseline: run unit/type checks and preserve logs in `.local/intelligence-v2-*`; inspect current Python/rules evaluation harnesses.
2. Harden bounded-memory upload/recovery with adversarial protocol tests. Retain the measured-independent 8 MiB default until real-device/network benchmarks justify changing it.
3. Make generation/cancellation-safe segment and report writes; validate CV evidence without weakening compiled approval.
4. Harden Python OCR/identity temporal logic with deterministic tests. Do not claim a new detector or calibrated confidence without footage benchmarks.
5. Add position-specific evidence-grounded coaching prompts and an honest report completeness/coverage presentation.
6. Add local wearable import/preview where proven parsers and platform APIs support it; keep unsupported binary/archive/provider paths explicit, never fake connected accounts.
7. Repair reusable card state/fallback behavior without altering discoverability/entitlement rules.
8. Run integrated TypeScript, ESLint, unit, Python, rules, browser and build/export checks. Record every unexecuted external acceptance item.

## Security And Infrastructure Boundaries

Private footage stays owner-scoped. No face templates, cross-user appearance database, raw GPS cloud history, unrestricted URLs, client secrets or unapproved provider transfer may be added. Preserve consent versions, youth controls, signed URL expiry, authenticated tasks, quotas and lifecycle cleanup. Worker/model changes require a new evidence-backed approval; setting flags does not grant approval.

Existing infrastructure is Firebase/Google Cloud Storage/Tasks, configured server-side AI routing and an optional private GPU worker. Actual GPU region/quotas, model commercial rights, processor agreements, vendor wearable export access, backup/App Attest checks and counsel approval remain external. Cost/region/provider claims must be researched from official sources, and actual per-match cost must be measured rather than invented.

No private media or sensitive annotations will be committed. The working tree is already dirty; coherent commits are deferred until this implementation can be isolated from prior user changes.
