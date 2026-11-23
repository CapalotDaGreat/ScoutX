# CPU8 benchmark session: recovered result and offline gate pass

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

## Recovered result and comparison outcome

The initial workspace/Downloads check did not find the candidate, and the result bucket had already been deleted.
Its comparison returned **exit 7**, with `reference: true` and `candidate: false`. That was a missing-local-input result,
not an accuracy failure. The earlier incomplete status is superseded by the recovery and fresh offline comparison below.

The expanded search recovered exact bytes from local Git commit `4c2a827`, under
`workers/football-cv/bench/results/cpu8-cloudrun-20261122/`:

- `full_match.json`: SHA-256 `cee22a220030de4bcfedbe72adeb6e7a9e4c112baf229fb63ab16daa3fabe14f`.
- `full_match_claims.json`: SHA-256 `cbd2dbb8576954acde3d0d156f19db8ae91f225b3802f93b7aad5e871592b846`.
  This matches the candidate record's `claimsFile.sha256`; the sidecar contains 12,644 frames.

The recovered record is complete, records the build source commit above, and has a timestamp inside the recorded job
lifecycle. Its `timingComplete` is true. The separate job/build records establish the image digest and requested resources;
the candidate's own image-build and lock-hash fields are null. Its environment reports nine visible logical CPUs, while
the job configuration requested 8 vCPU; the reported host count must not be substituted for the resource allocation.

A fresh local `bench/compare_runs.py` comparison against the recorded CPU reference at
`bench/results/5.3/l4-20261029-netherlands/cpu/full_match.json`, using `bench/gates/balanced_5.2.json`, **PASSED, exit 0**.
The reference sidecar hash was also verified. There were no comparability objections or gate failures.

- Measured total wall time: **6,628.491 s**, versus **7,528.287 s** for the reference; reported speedup **1.14x**.
- Claimed recall **0.621**, IDF1 **0.766**, confirmed-correct time **10.5 s**: the same as the reference.
- Wrong-identity and confirmed-wrong-identity time: **0.0 s on the labelled intervals**.
- State agreement **0.9984** across 12,644 compared frames; box agreement when both claim **1.0**.
  Twenty frames were claimed only in the reference; none were claimed only in the candidate.

The freshly computed comparison matches the archived comparison as a parsed JSON object. Its SHA-256 is
`43ad9fc5c5ba367aef5d2d525a6a3a266a6551d5c35dffb4ec15e47af12ed24d`.
Recovered files and fresh comparison output remain in ignored local storage; this commit publishes only this summary.

This pass covers the recorded image/settings on that Cloud Run job host and the existing labelled intervals. It does
not establish accuracy on every future host, the whole unlabelled match or unseen recordings, and it is not release
approval. Prior cost estimates remain estimates: no actual billing measurement was recovered. No new benchmark,
billing link or production flag change was performed to obtain this result.

### Expanded local recovery search, 2026-11-23

Ordinary filesystem and archive searches did not recover the CPU8 files. A subsequent local Git history/reflog search
found both exact artifacts in the commit identified above. The expected sidecar name and hash came from the recovered
record; unrelated historical claims arrays were not used as substitutes.

The search covered the Windows user profile, including Downloads, documents, synced folders, application data and
temporary files; repository checkouts, hidden local work directories and other local project/temporary directories;
and Ubuntu's home and temporary directories. Filename searches included alternate result names and compressed files.
JSON, JSONL, text and log content was also searched for the benchmark schema to catch renamed records.

- The filesystem content scan found 163 schema-bearing benchmark records, including duplicate checkouts and earlier partial runs. All recorded
  run timestamps preceded the CPU8 session; the latest was 2026-11-17. None was accepted as the missing candidate.
- Found 68 claims-named JSON candidates in ordinary folders, without an attributable CPU8 result alongside them.
- Indexed 649 readable ZIP archives and inspected 58 gzip-compressed JSON files without recovering a CPU8 result.
- Ubuntu's searched directories returned no candidate filenames. The local Git history/reflog path search for results
  added since 2026-11-21 then exposed the recovered CPU8 result and sidecar.

Limits: Git internals and dependency/virtual-environment trees were excluded from ordinary filesystem scans; content
searches were capped at 128 MiB per file, and gzip inspection at 64 MiB expanded. Some live application/temporary files
were locked or access-denied, one unrelated ZIP was unreadable, and older non-ZIP archives were not expanded. This
does not establish that no copy exists in an unsearched, remote, inaccessible or differently encoded location.

The offline comparator ran only after recovery and provenance/hash checks. Search inventories and raw paths remain
local; no Google Cloud operation, billing change or benchmark execution was performed during this recovery search.

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
audit, upload and bucket metadata, earlier comparison output, cleanup attempts and billing-state records, followed by
the recovered Git artifacts and fresh offline comparison. Raw files are excluded from this commit. The hashes above
identify code or result artifacts; account details, cloud identifiers, footage names and footage hashes are omitted.

The separate local orchestration fixture benchmark and unit-test results are documented in
[the analysis cost benchmark](../video/analysis-cost-benchmark.md). They are separate from the real-video gate comparison.
No application or worker behavior changed in this documentation review, and the cloud benchmark was not rerun.
