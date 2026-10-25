# Video Intelligence Readiness Report

Implementation update 2026-10-23: see `intelligence-v2-delivery.md` for the bounded upload,
identity/evidence, report, GPS import and card changes and their local tests. Overall production
limitations and approval gates below remain open; this update is not real-footage validation.

Updated 2026-10-16. Overall: **PRODUCTION LIMITED**. Public release gate: **BLOCKED** while any
item below marked NOT VALIDATED, External or Legal remains open. Report seek controls hide when the
source video was deleted (`canSeekVideo`); continuous tracking remains unavailable until a worker
is approved.

Owner statement recorded on 2026-10-09: "The AI policies have been reviewed." This is the owner's
statement; it is not a lawyer's review of the 1.2.0 policy texts, which stay flagged for legal review.

| Capability | State |
| --- | --- |
| Consent, withdrawal, lifecycle, retention, deletion | Implemented; automated tests pass (including mid-pipeline withdrawal); real device NOT VALIDATED |
| Upload integrity (server-verified CRC32C), resume after kill, stable ETA | Implemented; automated tests pass; multi-chunk resume tested against a fake endpoint only; real device NOT VALIDATED |
| On-device preflight (resolution, frame rate, bitrate, orientation) | Implemented, warnings only; blur and exposure NOT CHECKED; real device NOT VALIDATED |
| Short-clip mode (video stays on device; sampled frames upload) | Implemented; real device NOT VALIDATED |
| Files / iCloud picker | Implemented; needs the new native build; NOT VALIDATED |
| Segment review, partial progress, synthesis, versions | Implemented with mocked models; real footage NOT VALIDATED |
| "Is this you?" with held-back coaching | Implemented; automated tests pass |
| Corrections and feedback (append-only, never training) | Implemented; automated tests pass; UI NOT VALIDATED on device |
| Trends across ≥ 3 analyses | Implemented with conservative gating; NOT VALIDATED on device |
| Possible events (still frames) | Shown as "needs review"; never counted |
| Continuous tracking | Reference worker implemented, **not deployed**, **not evaluated**; app shows "not available" |
| Event detection, pitch mapping, physical metrics from video | **Not available** |
| Statistics from video | **Not available** (always unknown) |
| Real-footage accuracy | **NOT VALIDATED** (`accuracy-report.md`) |
| Legacy media from before the lifecycle | Dry-run tool ready; production dry run blocked (no operator credentials on this machine) |

Before anything here may be called validated: run `device-test-protocol.md` on physical devices,
produce the evidence in `accuracy-report.md`, have the owner approve thresholds, complete the worker
security review, and pass `node scripts/release-gate.mjs` without `--allow-external`.

Configuration still required (never invented): `CV_WORKER_URL`, GPU region, Artifact Registry
repository, invoker service account (all CONFIG_REQUIRED); owner decision on thresholds; operator
credentials (Application Default Credentials) for the legacy-media dry run.
