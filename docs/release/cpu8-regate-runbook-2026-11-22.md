# Runbook: re-gate the 8-vCPU CPU configuration on Cloud Run (prepared 2026-11-22, not run)

Owner-approved scope (2026-11-22), and only that:
1. Build `Dockerfile.tracker-gpu` unchanged.
2. CPU-only, 8 vCPU, `SCOUTX_ORT_PROVIDERS=CPUExecutionProvider`, timeout ≥ 1,800 s, concurrency 1.
3. Run the IMG_4809 proxy full-match benchmark, then `compare_runs.py` with balanced_5.2 against the recorded CPU
   run. Exit 0 is required.
4. Delete everything afterwards.

There are no production flags, INT8, E9 or L4 in this session. If the gate fails, stop: do not try 2 or 4 vCPU in
the same session.

## 0. One point the owner must confirm before billing

**A Cloud Run *service* cannot run step 3.** A service request times out after at most 3,600 s, and the reference
benchmark took 7,528 s in one process. A Cloud Run **job** allows task timeouts of up to 168 h on CPU.

Proposal:
- Run step 3 as a one-task Cloud Run **job** from the same image digest, with the same CPU settings (8 vCPU,
  `SCOUTX_ORT_PROVIDERS=CPUExecutionProvider`, concurrency is not applicable).
- Either skip the service in step 2, or deploy it only for a `/healthz` check and delete it right away. The gate
  result comes from the job either way.

Also confirm two things:
- **Footage:** this uploads the IMG_4809 proxy (1.41 GB, the owner's own footage) to a private bucket in
  `pitchproof-stg-pilot2` (europe-west6), deleted at the end.
- **CPU platform:** jobs and services both run on Cloud Run's second-generation environment, but Google does not
  promise the same CPU model. A pass on the job is evidence for that image at 8 vCPU on Cloud Run. It is not proof
  for every host the service might later run on.

## 1. Preconditions

- The CHF 9 budget alert exists and has been checked. Billing is linked only for this session, with link and unlink
  times recorded.
- The checkout holds the commit to build (record `git rev-parse HEAD`). `requirements-gpu.lock` SHA-256 is
  `7a7dfa9601658ffe0c00fb403f95e60c46d2badd482bc41bfdaf6824f3e96389`; refuse if it differs.
- The proxy's file SHA-256 is `b1077af3…fb679c` (`bench/references/img4809_proxy_10fps.json`).
- A runner with the gcloud CLI signed in as the staging operator.

## 2. Commands (`PROJECT=pitchproof-stg-pilot2`, `REGION=europe-west6`)

```bash
set -euo pipefail
PROJECT=pitchproof-stg-pilot2; REGION=europe-west6
REPO=scoutx-pilot-images            # the approved persistent repository; create it only if the setup session did not
BUCKET=gs://${PROJECT}-cpu8-regate  # private, uniform access, created for this session only
JOB=scoutx-cpu8-regate
SHA=$(git rev-parse HEAD)
test "$(sha256sum workers/football-cv/requirements-gpu.lock | cut -d' ' -f1)" = 7a7dfa9601658ffe0c00fb403f95e60c46d2badd482bc41bfdaf6824f3e96389

# 1. Build unchanged (Cloud Build, no local Docker needed)
cat > /tmp/cb.yaml <<EOF
steps:
- name: gcr.io/cloud-builders/docker
  args: [build, -f, Dockerfile.tracker-gpu, --build-arg, GIT_COMMIT=$SHA,
         -t, $REGION-docker.pkg.dev/$PROJECT/$REPO/tracker:$SHA, .]
images: [$REGION-docker.pkg.dev/$PROJECT/$REPO/tracker:$SHA]
options: {machineType: E2_HIGHCPU_8, diskSizeGb: 100}
timeout: 5400s
EOF
gcloud builds submit workers/football-cv --project $PROJECT --region $REGION --config /tmp/cb.yaml
DIGEST=$(gcloud artifacts docker images describe $REGION-docker.pkg.dev/$PROJECT/$REPO/tracker:$SHA \
  --project $PROJECT --format='value(image_summary.digest)')
IMAGE=$REGION-docker.pkg.dev/$PROJECT/$REPO/tracker@$DIGEST

# 2. Footage, private bucket in the same region
gcloud storage buckets create $BUCKET --project $PROJECT --location $REGION --uniform-bucket-level-access \
  --public-access-prevention
gcloud storage cp IMG_4809_proxy_10fps.mp4 $BUCKET/in/

# 3. One-task job: 8 vCPU / 32 GiB (the reference host had 32 GiB; work dir is in-memory /tmp)
gcloud run jobs create $JOB --project $PROJECT --region $REGION --image $IMAGE \
  --cpu 8 --memory 32Gi --tasks 1 --max-retries 0 --task-timeout 4h --execution-environment gen2 \
  --set-env-vars SCOUTX_ORT_PROVIDERS=CPUExecutionProvider,SCOUTX_MODE=balanced,HOME=/tmp \
  --add-volume name=data,type=cloud-storage,bucket=${BUCKET#gs://} \
  --add-volume-mount volume=data,mount-path=/data \
  --command python --args=bench/full_match_benchmark.py,--video,/data/in/IMG_4809_proxy_10fps.mp4,--number,20,\
--kit,orange,--kit2,white,--out,/data/out/full_match.json,--work-dir,/tmp/work,--chunk-sec,300,--require-models,\
--ground-truth,bench/results/5.1/gt_img4809_intervals.json,--reference,bench/references/img4809_proxy_10fps.json,\
--gate,bench/gates/balanced_5.2.json,--prices,bench/gcp/prices_europe-west6.json
gcloud run jobs execute $JOB --project $PROJECT --region $REGION --wait

# 4. Gate against the recorded CPU run (locally, no billing)
gcloud storage cp "$BUCKET/out/*" out_cpu8/
python workers/football-cv/bench/compare_runs.py \
  --reference workers/football-cv/bench/results/5.3/l4-20261029-netherlands/cpu/full_match.json \
  --candidate out_cpu8/full_match.json --gate workers/football-cv/bench/gates/balanced_5.2.json \
  --out out_cpu8/comparison.json; echo "gate exit $?"     # 0 required
```

## 3. Cleanup (always, pass or fail); verify every deletion by exact name

```bash
gcloud run jobs delete $JOB --project $PROJECT --region $REGION --quiet
gcloud run jobs describe $JOB --project $PROJECT --region $REGION 2>&1 | grep -q NOT_FOUND
gcloud storage rm -r $BUCKET --quiet
gcloud storage buckets describe $BUCKET 2>&1 | grep -q -i 'not found\|404'
gcloud artifacts docker images delete $IMAGE --project $PROJECT --delete-tags --quiet
gcloud builds list --project $PROJECT --region $REGION --ongoing --format='value(id)'   # must be empty
# Cloud Build source archive: delete this build's object in gs://${PROJECT}_cloudbuild and confirm 404
```

Then unlink billing, record the time, and confirm billing is off.

## 4. Expected cost and stop conditions

- **Job:** about 7,528 s × (8 × $0.000018 + 32 × $0.000002) ≈ **$1.57**.
- **Build:** E2_HIGHCPU_8 for about 20–40 min, about $0.20–0.40.
- **Storage:** cents.
- **Total:** well under the CHF 9 alert.

Stop and clean up when any of these happens:
- the environment check or `--require-models` fails (benchmark exit 4);
- exit 5 (not comparable);
- the job exceeds 4 h;
- the gate exit is not 0.

Report:
- image digest and build commit;
- job execution id;
- `full_match.json` `environment` (CPU model, cores) and `timing` (`timingComplete` must be true);
- comparison exit code and the gate table;
- billing link and unlink times;
- every deleted resource with its `NOT_FOUND` check.
