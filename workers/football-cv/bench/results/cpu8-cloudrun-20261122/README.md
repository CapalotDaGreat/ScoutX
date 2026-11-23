# 8-vCPU CPU re-gate on Cloud Run (run 2026-11-22, gate checked 2026-11-23)

Runbook: `docs/release/cpu8-regate-runbook-2026-11-22.md` (owner-approved scope: one Cloud Run job, no service).

| | Reference (`5.3/l4-20261029-netherlands/cpu`) | This run (Cloud Run job `scoutx-cpu8-regate`) |
|---|---|---|
| Image | Dockerfile.tracker-gpu @ 3b8f3bb, lock 7a7dfa96… | Dockerfile.tracker-gpu @ bc5a9d1 (lock file unchanged at that commit) |
| Host | g2-standard-8, 8 vCPU, CUDA unavailable | Cloud Run job, 8 vCPU / 32 GiB, gen2, `SCOUTX_ORT_PROVIDERS=CPUExecutionProvider` (`os.cpu_count()` reported 9) |
| Status / timing | complete, 7,528.287 s, timingComplete | complete, 6,628.491 s, timingComplete (1.14x) |
| Discovery / extraction / resolve | 1,129 s / 7 chunks 664–856 s / 579 s | 1,035 s / 7 chunks 566–726 s / 611 s |
| claimedRecall / IDF1 | 0.621 / 0.766 | 0.621 / 0.766 |
| confirmedCorrectSec / wrongIdentitySec | 10.5 / 0.0 | 10.5 / 0.0 |

`compare_runs.py --gate bench/gates/balanced_5.2.json`: **PASSED, exit 0**
- state agreement 0.9984 over 12,644 frames;
- box agreement 1.0;
- the 20 differing frames (45.2–49.6 s) are LIKELY_VISIBLE in the reference and AMBIGUOUS here, so this run is more
  conservative there;
- 2 further frames differ by 0.1 px in a box.

What this pass covers: this image at 8 vCPU on that Cloud Run job host. It does not cover every future Cloud Run
CPU, and it is not a release.

Provenance notes:
- `environment.image.built` and `lockSha256` are null in this record; the build environment file did not carry
  them. The commit is recorded, and `requirements-gpu.lock` is unchanged at that commit.
- The outputs were copied from `gs://pitchproof-stg-pilot2-cpu8-regate/out/` through the Cloud console on
  2026-11-23 and checked byte for byte: `full_match.json` SHA-256 cee22a22…, claims cbd2dbb8… (the claims hash
  is the one recorded in the run).
- Footage: the IMG_4809 proxy (SHA-256 b1077af3…) left the owner machine for this run. The bucket was created
  2026-11-22 00:27 UTC. Deletion is recorded in the runbook result.

## Cleanup record (2026-11-23, Cloud console in the owner's browser, no Cloud Shell authorization)

The run itself finished on 2026-11-22 at about 03:04 UTC (outputs written then). Cleanup and the billing unlink
were not done in that session, so billing stayed linked from 2026-11-22 00:26 UTC until 2026-11-23 14:45 UTC
(about 38 h). Only storage was idle-billed during that time; no compute ran.

| Resource | Action 2026-11-23 | State |
|---|---|---|
| Cloud Run job `scoutx-cpu8-regate` (europe-west6) | deleted | jobs list empty |
| Cloud Run services | none existed | none |
| Bucket `pitchproof-stg-pilot2-cpu8-regate` (proxy + outputs, 4 objects) | object soft-delete disabled, bucket deleted 14:40:51 UTC | **bucket is in Google's bucket-level soft delete until about 2026-11-29/30, then permanently deleted**; restore was not attempted (blocked) |
| Cloud Build source `gs://pitchproof-stg-pilot2_cloudbuild/source/1795307691.901668-2bc6ecbc….tgz` (code only) | deleted | soft-deleted for 7 days (bucket policy) |
| Cloud Build | build `f37b0c79` finished (13 min 23 s) | no builds running |
| Image `europe-west6-docker.pkg.dev/pitchproof-stg-pilot2/scoutx-pilot-images/tracker@sha256:7e8d48728c75…` (tag bc5a9d1…, 7.3 GB) | **kept, owner decision pending**: it is the exact digest that passed | present |
| Billing (Firebase Payment) | disabled for `pitchproof-stg-pilot2` only, about 14:45 UTC | "This project is not linked to a billing account" |

Production `scoutx-230b0` was not touched. No product flags, INT8, E9 or L4.
