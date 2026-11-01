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

## Approved europe-west4-a attempt: also stockout

After the owner approved `europe-west4-a`, the same source archive and proxy were
verified and staged again. The g2-standard-8 request at 04:01:13 UTC was rejected
with the same stockout code. A smaller g2-standard-4 (4 vCPU, 16 GiB, still one
L4) was then requested in the same approved zone, within the existing one-GPU,
three-hour and cost bounds. Its regional compute estimate was lower ($0.7731/hour,
$2.32 for three hours); the hardware difference was disclosed before requesting it.
That request was also rejected with `ZONE_RESOURCE_POOL_EXHAUSTED_WITH_DETAILS`,
reason `resource_availability`, and an empty `zonesAvailable` field.

Neither request created a VM. No inference, model build, CUDA test or new timing
measurement occurred. All matrix work remains pending; these failures do not
establish that FP32 fixes or fails to fix the accuracy gap.

The failed allocation evidence is in
[the second attempt folder](../../workers/football-cv/bench/results/5.3/fp32-20261101-0355-a-51d41c9/),
including both provider logs, the requested configurations and source hash.
Cleanup again verified zero instances/disks/snapshots and absence of both temporary
input objects. Results are retained in the matching private GCS results folder.
Estimated VM compute charge is zero because no VM allocated; storage/network
charges are not asserted to be zero.

## Proposed Zurich fallback: not yet authorised

Read-only checks found L4 quota 1, usage 0 in `europe-west6`, and the required
g2-standard-8/L4 listed in both `europe-west6-b` and `europe-west6-c`. Catalog
support and quota do not establish present capacity. A proposed fallback is to
try b, then c only if b cannot allocate, stopping after **one VM** is created.
The inference commit remains `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`.

The retained 2026-10-28 Zurich snapshot estimates $1.2036/hour including the
200 GB balanced disk: approximately $1.81–$2.41 for a 90–120-minute planning
allowance, and $3.61 for the three-hour maximum. Taxes/storage/network are extra;
these are estimates, not invoices or a total-billing cap. This higher regional
price needs fresh explicit approval before allocation.

To avoid retransferring the 1.4 GB video for rejected requests, the next proposed
controller uploads the small approved source archive first, allocates one VM,
and transfers the video only after allocation succeeds. The guest waits at most
20 minutes for that object, verifies its exact SHA before inference, and retains
the server-enforced three-hour deletion limit. The matrix time budget is bounded
by remaining session time, reserving time for export and teardown. If all approved
zones reject allocation, remove the staged source archive; no video is uploaded.
These are orchestration changes; the approved inference source stays unchanged.

## Approved Zurich attempt (2026-11-01, afternoon): also stockout

The owner approved one session in `europe-west6`, trying zone b and then zone c only if b rejected allocation, with at most one VM.

**Settings, all as approved:**

- inference commit `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`;
- g2-standard-8 with one L4;
- 200 GB balanced auto-delete disk;
- `--max-run-duration=180m` with termination action DELETE, plus a guest shutdown at 175 minutes;
- image `common-cu129-ubuntu-2204-nvidia-580-v20261029`.

**Preflight:**

- The source archive was rebuilt with `git archive --format=tar 51d41c9 workers/football-cv`. Its SHA-256 was `308c07a4…a62f`, identical to the pinned archive.
- The local reference proxy on the owner's computer was re-hashed and matched `b1077af3…679c`.
- Price, re-checked on 2026-11-01: USD 1.2037/hour, unchanged.
- The worker suite on `d402d67` gave 589 passed and 0 skipped. This was in the Linux development container with CPU torch 2.14.1 and Python 3.13.17.
- Before the attempt: zero instances, disks and snapshots, and no video objects.

**Result:**

- **`europe-west6-b`:** rejected with STOCKOUT (`resource_availability`, empty `zonesAvailable`).
- **`europe-west6-c`:** rejected with `resource_availability`, "not enough resources".
- **No VM was created**, the video was never uploaded, and no inference ran.
- The staged source archive was deleted afterwards. Cleanup then verified zero instances, disks and snapshots, and no `runs/` or `videos/` objects.
- Estimated VM compute charge: USD 0.

**Evidence:**

- [state.json](../../workers/football-cv/bench/results/5.3/fp32-20261101-z-51d41c9/state.json)
- the provider logs and the exact startup scripts, in the same folder
- the matching private results folder in GCS

The startup script is the committed 0355-a script with one change: the video is uploaded only after allocation succeeds, and the guest waits at most 20 minutes for it.

**What remains open.** All three L4 regions tried so far had no capacity: europe-west4-c and europe-west4-a on 2026-11-01, and europe-west6-b and -c on both 2026-10-29 and 2026-11-01. The FP32 comparison therefore remains pending. Another attempt needs a new approval: a later retry, another region, or a different GPU type, which would no longer be like-for-like with the L4 run.

## Approved Frankfurt attempt (2026-11-01 evening): also stockout

The owner approved one session in `europe-west3`: zone a, then zone b only after a definitive rejection with no VM present, at most one VM.

**Settings:** the same pinned commit, source archive (SHA `308c07a4…a62f`, re-verified), image, machine and 180-minute DELETE lifetime.

**Price** (Cloud Billing Catalog API, effective 2026-11-01, retrieved 17:53 UTC):

- USD 1.0389/h in total: instance USD 1.0060/h plus 200 GB balanced disk USD 0.0329/h;
- SKUs: AFF4-6DF9-A774, 10AA-7064-F09F, D8F8-12AA-CE07 and B1B5-0BAA-CB31.

**Machine catalogs:** g2-standard-8 with an L4 is listed in europe-west3-a and -b, but not in -c. Quota: `NVIDIA_L4_GPUS` 1 (usage 0) and `GPUS_ALL_REGIONS` 1. Neither proves live capacity.

**Result:**

- `europe-west3-a`: rejected with STOCKOUT (`resource_availability`).
- After confirming that no instance or disk existed, `europe-west3-b` was tried: rejected, "not enough resources".
- **No VM was created**, the video was never uploaded, and no inference ran.
- The staged source archive was removed. Cleanup verified zero instances, disks and snapshots, and no `runs/` or `videos/` objects.
- Estimated VM compute charge: USD 0. Charges for the briefly staged archive are not asserted to be zero.

**Upload method.** The video upload from the owner's computer was prepared as a stateless, resumable chunked upload ([device_upload_chunks.sh](../../workers/football-cv/bench/results/5.3/fp32-20261101-f-51d41c9/device_upload_chunks.sh)). It is needed because the pinned harness requires the exact file bytes `b1077af3…`, and a remux made in the development container has a different file hash. The script was never used.

**Status.** The FP32 comparison has still not run, so the GPU accuracy gap remains unexplained. Every L4 zone tried has had no capacity:

- europe-west4-a and -c;
- europe-west6-b and -c;
- europe-west3-a and -b.

Evidence: [fp32-20261101-f-51d41c9/](../../workers/football-cv/bench/results/5.3/fp32-20261101-f-51d41c9/).
