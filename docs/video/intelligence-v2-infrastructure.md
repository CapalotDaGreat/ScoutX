# Video Intelligence 2.0: External Services And Evaluation

Checked 2026-10-23. No resources were deployed, no paid inference was invoked, and no private footage was transferred in this implementation pass.

## Firebase / Google Cloud

- Purpose: existing Authentication, owner-scoped Firestore, private Storage, Functions and Cloud Tasks.
- Account: existing project operator with billing and narrowly scoped IAM. Do not create a second production project implicitly.
- Credentials: server service identities and Secret Manager; client Firebase public configuration is not worker authorization. Configure App Attest/App Check and exact callable origins through the existing release checklist.
- Setup: confirm the existing region in `functions/src/region.ts`; verify Storage CORS for the real app origins, private resumable sessions, task invoker IAM, retention/deletion sweeps, backups and logging budgets. Do not make the worker public to fix invocation errors.
- Costs: object GiB-months, retained frame/clip storage, operations, transfer, Functions compute, Firestore reads/writes and task attempts. Obtain region-specific billing exports; no measured currency-per-match is available here.
- Failure: uploads remain recoverable until their session/recovery window expires; rejected containers/checksums never become analysis-ready. Missing task/model configuration remains an error/unavailable state.
- Test: use `demo-scoutx` emulators first, then authorized device/controlled-cloud trials, including interruption, cancellation, wrong-source resume, quota denial and deletion. A loopback benchmark is not a GCS benchmark.

## Private GPU Worker

- Purpose: optional CV detection/OCR/tracking. The current reference build is `football-cv/0.3.0`; no evaluated approval exists, so it remains disabled.
- Setup requires: reviewed model/weight licenses, pinned runtime image, private registry, IAM-only invocation, least-privilege service account, approved processing region, GPU quota, resource/time limits, safe logs and lifecycle tests. Never put model/provider secrets in the app.
- The reference model stack remains RT-DETR, supervision ByteTrack and EasyOCR. No detector benchmark justified replacing it. No face embeddings or cross-user identity store were added.
- Cloud Run GPU jobs support L4 in documented regions including Belgium and the Netherlands, not every existing Firebase region. Region choice and cross-region transfer need owner/privacy review. See [official GPU configuration](https://docs.cloud.google.com/run/docs/configuring/jobs/gpu) and [Cloud Run pricing](https://cloud.google.com/run/pricing).
- Costs must include GPU/CPU/memory time, image/model startup, decode, retries, idle/warm capacity and transfer. No GPU run was measured. Do not multiply a hardware price by video duration and present it as an observed per-match cost.
- Test: run the existing authorized evaluation manifest, annotate difficult slices independently, retain exact build/model/dataset hashes, calculate identity precision/recall/switches/re-entry/coverage and obtain owner/security approval. Only then run `npm run cv:approval -- --write` with genuine evidence. Do not fabricate the absent approval record.

At the existing 2 fps scan setting a 90-minute recording proposes 10,800 samples and a 150-minute recording 18,000. These are configuration-derived workload bounds, not measured throughput or comprehensive event coverage. Ten-minute planning produces 9 or 15 segments respectively; frame extraction caps each segment at 12 stills. Decoding and actual task retries add work.

## AI Provider

- Existing integration: OpenRouter with server-only `OPENROUTER_API_KEY`, `provider.zdr=true` and `data_collection=deny`. Missing suitable endpoints must fail rather than relaxing privacy. [Official routing policy](https://github.com/OpenRouterTeam/docs/blob/main/guides/routing/provider-selection.mdx).
- The public model catalog was queried without credentials on 2026-10-23. It returned `google/gemini-2.5-flash`, but not the old `google/gemini-2.0-flash-001` default. Both text and vision now default to the already-allowlisted 2.5 model; retired overrides fall back to it.
- This is an availability repair, not a football-quality provider selection. No private-footage provider benchmark was run. No new provider was approved by changing this default.
- Catalog snapshot for 2.5 Flash: input USD 0.30 and output USD 2.50 per million tokens. Actual image/reasoning charges, routed endpoint availability and account terms need checking before launch. [Official model page](https://openrouter.ai/google/gemini-2.5-flash), [public catalog](https://openrouter.ai/api/v1/models).
- Before enabling footage: approve processor terms/regions/transfers and consent disclosures; verify the exact account's retention/training settings and eligible ZDR endpoint. Set `AI_FOOTAGE_PROCESSING_APPROVED` only after the existing owner/privacy review. ZDR does not by itself prove EU-only routing or legal compliance.
- Test procedure: an owner-authorized benchmark corpus with fixed prompts/citations and blinded football-analyst review; measure groundedness, identity mistakes, unsupported event counts, role usefulness, latency, tokens and actual billed cost. Generic vendor benchmark scores are not football evaluation evidence.
- Failure: API/model/JSON failures remain explicit; only known frame/observation references survive normalization. Unvalidated events remain suggestions, never automatically confirmed statistics.

## Wearable Files And Vendor Accounts

Local GPX/TCX/strict CSV import needs no provider account, API secret or cloud upload. The pinned XML parser runs on device. Original coordinates, source names/URIs and fix timestamps do not persist. Owner-scoped import summaries are local and replace the preceding import; they are not connected vendor accounts or verified match associations.

Exact STATSports, Catapult, Garmin, Polar and Playermaker export/API restrictions, official links, setup dependencies and tests are in `intelligence-v2-gps.md`. No vendor API adapter or partnership was created. Sample vendor export compatibility is not established without representative files.

FIT and ZIP import remain not implemented. Garmin's official FIT SDK has a bespoke agreement, not an assumed permissive open-source license. Review distribution and other terms before selecting it; this pass did not install or accept it. [Official SDK license](https://github.com/garmin/fit-javascript-sdk/blob/main/LICENSE.txt). ZIP support needs a proven bounded parser, archive traversal/bomb/CRC tests and integration; do not accept arbitrary archives as if they were GPS data.

## Required Owner Inputs

1. Local footage path and permission have been supplied, with orange/white target 20 and a readable 242-second manual anchor. Local metadata preflight passed on the 33:55 HEVC HLG source. Private annotations remain absent. Do not send footage to an AI provider without separate approval; local model-weight downloads are not permission to upload footage.
2. Authorized private annotations covering occlusion, re-entry, camera cuts, same-kit ambiguity, half-time and substitutions. Store private media/annotations outside the public repository.
3. Representative wearable exports plus vendor references for units, clock behavior and expected totals.
4. Physical iOS/Android devices and controlled release build for background/termination/restart, iCloud, 100 MB/1 GB/3 GB uploads and 90/150-minute footage.
5. Owner/counsel privacy and license decisions, regional/budget limits and worker security review. No thresholds, deployments, vendor agreements or successful external tests were invented.
