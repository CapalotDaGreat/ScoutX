# Approved FP32 session: allocation blocked by L4 stockout

On 2026-11-01 at 03:50:55 UTC, allocation was requested in `europe-west4-c`
for the explicitly approved source commit
`51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`.
The request was one g2-standard-8/L4, 200 GB balanced boot disk with automatic
deletion, and a server-enforced 180-minute lifetime with termination action DELETE.

Google Cloud rejected the request with
`ZONE_RESOURCE_POOL_EXHAUSTED_WITH_DETAILS`, reason `gpu_availability`, state
`STOCKOUT`. Its `zonesAvailable` field was empty. Regional L4 quota was 1 with
usage 0 before allocation: quota approval did not imply physical capacity.

**No VM was created and no benchmark executed.** This is an infrastructure
availability failure, not evidence about FP32 accuracy or the GPU implementation.
The six-profile comparison and GPU/CPU accuracy-gap diagnosis remain pending.
There is no measured GPU runtime or new accuracy result from this attempt.

The exact local proxy hash and an archive of the approved commit were verified
and uploaded before allocation. The startup script passed Bash syntax checking.
A pre-launch inspection also identified that the image lacks Git while the window
validator asks `git rev-parse HEAD` for provenance. The planned runtime supplied a
read-only metadata adapter that returns the verified image build commit, rejects
other Git operations, and records that fact in evidence. The approved source and
inference packages were not changed. This adapter was not executed on a VM because
allocation failed; its script is retained for review.

## Cleanup and retained evidence

The failed-allocation log, approved request metadata, quota snapshot and startup
script were preserved locally and in the private results folder before cleanup.
Both temporary objects (the reference video and source archive) were then deleted;
subsequent object lookups returned absence. Successful project-wide queries found
zero instances, disks and snapshots. No alternate-zone allocation was attempted.

Evidence:
[failure.json](../../workers/football-cv/bench/results/5.3/fp32-20261101-0342-51d41c9/failure.json),
[provider error](../../workers/football-cv/bench/results/5.3/fp32-20261101-0342-51d41c9/create-instance.log),
[cleanup.json](../../workers/football-cv/bench/results/5.3/fp32-20261101-0342-51d41c9/cleanup.json).
Private cloud results:
`gs://scoutx-230b0-benchmarks/results/fp32-20261101-0342-51d41c9/`.

The VM compute estimate for this rejected allocation is **USD 0**; temporary
storage/network charges may apply. This is not a billing invoice or assertion of
zero total project charges.

## Next allocation requires approval

The same g2-standard-8 with one L4 is listed in the `europe-west4-a` machine-type
catalog. The catalog does not confirm current stock. A proposed next attempt
keeps the inference commit above, Netherlands region, pinned image, and three-hour
maximum. The regional 2026-10-29 price snapshot remains $0.9273387923/hour:
expected 60–90-minute compute estimate $0.93–$1.39, three-hour estimate $2.78,
excluding network, storage and tax. No region change is proposed.

The operator is asking for explicit permission to try another Netherlands zone;
no resource will be launched under that proposal before approval.
