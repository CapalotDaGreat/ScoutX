# Trusted evidence staging

Implemented 2026-10-24. No model training, footage upload, deployment or production
gate change is part of this workflow.

## Operator workflow

Build the Functions package first (`npm run build --prefix functions`). The
existing authorized local evaluator must finish writing `artifact.json`,
`plan.json`, `identity.json`, `complete.json` and every `segment-NNN.json` into
a new run directory. It must bind the server job, generation, target revision
and reviewed reference frame. Never overwrite existing recordings/results.

Dry-run example (replace scope with the actual authorized run):

```powershell
node scripts/stage-identity-evidence.mjs --run-dir C:\Evaluation\run-001 --owner-id OWNER --job-id JOB_ID --generation 1 --anchor-revision 1
```

Dry run reads bounded local JSON only. It does not initialize credentials,
verify retained source bytes, contact Firebase, stage data or grant approval.

After independent CV/privacy approval, an authorized backend operator can add:

```text
--commit --authorize-metadata-staging --project PROJECT_ID --bucket PROJECT_ID.firebasestorage.app
```

The legacy `PROJECT_ID.appspot.com` bucket naming is also supported. Use
least-privilege application-default credentials outside arguments/source control.
The operator needs retained-source read and private Firestore job/evidence access.
Commit remains blocked while the immutable worker approval is absent, the
experimental switch is off, or any ownership/current consent/provider gate fails.
Do not enable switches simply to make this command succeed.

## Trust and lifecycle

This is a privileged producer API, not a public callable or client import path.
The operator must trust the local producer and its runtime. Source SHA-256
verification proves byte identity, not truthful inference or correct tracking;
the stager does not independently decode and recompute RGB anchor hashes.

Validation binds exact source scope, explicit target, rational PTS anchors,
approved worker/model versions and complete contiguous ten-minute segments.
Synthetic 140-minute and 150-minute schedules are covered. Candidate identities,
partial decoding, wrong targets and declared training/uploads are rejected.

Commit hashes the already retained object through a generation-pinned read-only
stream (4 GiB maximum, eight-minute deadline), periodically rechecking gates.
No media is uploaded, copied to disk or sent to an inference provider. Source
generation and size are checked again before publication and consumption.
This requires an already-retained canonical source; it does not solve protected
Veo URL access or authorize downloading/uploading any new recording.

Evidence uses bounded immutable chunks, eight per write transaction, with an
atomic final manifest and a source receipt. A 20-minute lease prevents concurrent
producers. Matching retries are idempotent; conflicting evidence cannot overwrite
the current revision. Failed attempts remove their unpublished chunks where
cleanup is available. Expired leases are recoverable on authorized retry, not
automatically garbage-collected by TTL. Scope edits and withdrawal invalidate
staging and evidence; recursive job/account deletion covers all private records.

Staging does not confirm identity, release coaching, count events, enable
continuous tracking or certify confidence calibration. There is no automatic
model training, fine-tuning, dataset ingestion or external footage transfer.

## Still requires real-footage validation

Orange number 8 in the 140-minute Veo recording has not been evaluated. Synthetic
tests establish validation and transaction behavior only. Independently review
authorized source/PTS anchors, identity mistakes and abstention, halftime/camera
cuts, occlusions, re-entry, long-run memory/runtime and battery/device behavior.
Measure visibility recall and wrong-person assignment before release approval.
