# CPU8 benchmark session: incomplete accuracy evidence

Reviewed 2026-11-23 from the locally retained session records. This summary is sanitized for the public repository;
raw logs, account details, cloud resource identifiers, machine paths and footage identifiers are not included.

## Execution evidence

- Cloud Build completed successfully on 2026-11-22 at 00:49:25 UTC.
- Build source: `bc5a9d13f669bc92f869b6937ad4085b26551d2b`, using `Dockerfile.tracker-gpu`.
- Recorded image digest: `sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d`.
- The Cloud Run job used one task, 8 vCPU, 32 GiB memory, `CPUExecutionProvider`, balanced mode, a four-hour task
  timeout and zero retries. The successful-execution count was one.
- Its recorded lifecycle ran from 2026-11-22 01:13:20 UTC to 03:04:53 UTC. These are Cloud Run timestamps, not the
  benchmark's measured processing time or per-stage timings.
- One owner-provided proxy was uploaded to a private regional bucket in `europe-west6`. The upload completed on
  2026-11-22 at 00:34:32 UTC. Bucket metadata recorded uniform access and enforced public-access prevention.

## Missing result and comparison outcome

The candidate `full_match.json` was not found in the reviewed local session records, workspace or Downloads search.
The result bucket had already been deleted when the follow-up verification began. This does not establish whether
the job originally wrote a result, or whether another session downloaded one elsewhere.

The local `bench/compare_runs.py` invocation with the recorded CPU reference and `balanced_5.2.json` returned **exit 7**:
`INCOMPLETE: a run produced no JSON`. Its output recorded `reference: true` and `candidate: false`.

Consequently, there is **no established balanced_5.2 pass or accuracy failure** from this session. A successful Cloud Run
execution is not an accuracy-gate result. No identity metrics, reference agreement, per-stage timing or measured cost
can be recovered from the retained summary records. Prior cost estimates are not billing measurements.

Completing the comparison requires the candidate result and its referenced claims sidecar, if any, from an existing
download or backup, followed by the comparator's input-comparability and accuracy checks. If those files cannot be
recovered, the comparison remains incomplete. This record does not authorize
another benchmark, a billing link, production flags or release approval.

## Cleanup status

- **Confirmed absent at the follow-up checks:** the session job/execution, the footage/result bucket and the exact
  Cloud Build source archive. The execution deletion audit is dated 2026-11-23 at 14:38:29 UTC.
- **Unverified:** deletion of the built container image. Artifact Registry inspection returned a billing-disabled
  permission error, not a not-found response. This proves neither that the image remains nor that it was deleted;
  cleanup must not be described as fully verified.
- **Erasure limit:** initial bucket metadata included a seven-day soft-delete policy. The retained absence checks do
  not establish permanent erasure of every soft-deleted copy; no retained recovery inventory resolves that question.
- **Billing:** the earlier cleanup records show billing unlinked. The read-only check during this review again
  returned `billingEnabled: false`. This documentation review did not link billing or launch cloud work.

## Evidence reviewed and limits

The private local records reviewed were the build submission and verification records, job configuration and execution
audit, upload and bucket metadata, comparison output, cleanup attempts and billing-state records. Their raw files remain
local and are excluded from this commit. The build source commit and software image digest above identify code artifacts,
not an account or recording.

The separate local orchestration fixture benchmark and unit-test results are documented in
[the analysis cost benchmark](../video/analysis-cost-benchmark.md). They do not replace the missing real-video result.
No application or worker behavior changed in this documentation review, and the cloud benchmark was not rerun.
