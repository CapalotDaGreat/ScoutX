#!/usr/bin/env bash
# PitchProof full-match benchmark on ONE Google Cloud L4 VM - run from Cloud Shell (already signed in).
#
#   bash run_l4_benchmark.sh gs://BUCKET/videos/IMG_4809.MOV gs://BUCKET/benchmarks RATE_USD_PER_HOUR
#
# What it does (nothing is deployed to production, no release flag is touched):
#   1. creates one g2-standard-8 VM (1x NVIDIA L4) from a Google Deep Learning VM image, with a hard
#      maximum run time after which Google deletes it (MAX_RUN, default 6h);
#   2. the VM installs the NVIDIA driver, clones the public ScoutX repo (BRANCH), builds the GPU image,
#      downloads the video from your bucket, runs bench/run_gpu_match.sh (balanced mode, --require-gpu),
#      uploads full_match.json, the claims JSON and the logs to OUT_GS/<run id>/, then deletes itself;
#   3. this script waits for the results, copies them to Cloud Shell, and deletes the VM if it still exists.
# RATE is the all-in hourly price of g2-standard-8 in ZONE from https://cloud.google.com/products/calculator
# (the JSON's cost is measured runtime x RATE; VM boot, driver install and image build are reported
# separately in timestamps.json - they are billed too).
# Optional env: ZONE (europe-west6-b), MACHINE (g2-standard-8), MAX_RUN (6h), BRANCH
# (feature/player-tracking-v3), NUMBER (20), KIT (orange), KIT2 (white), GROUND_TRUTH (path inside the
# image, e.g. bench/results/5.1/gt_img4809_intervals.json - only for IMG_4809 at the ground truth's timing).
set -euo pipefail
VIDEO_GS=${1:?gs:// path of the complete match video}
OUT_GS=${2:?gs:// folder for results}
RATE=${3:?all-in USD/hour of the VM from the Google Cloud pricing calculator}
PROJECT=$(gcloud config get-value project 2>/dev/null)
ZONE=${ZONE:-europe-west6-b}
MACHINE=${MACHINE:-g2-standard-8}
MAX_RUN=${MAX_RUN:-6h}
BRANCH=${BRANCH:-feature/player-tracking-v3}
RUN_ID=l4-$(date -u +%Y%m%d-%H%M%S)
VM=pitchproof-bench-${RUN_ID}
[[ -n "$PROJECT" ]] || { echo "no project: gcloud config set project scoutx-230b0" >&2; exit 1; }
gcloud storage ls "$VIDEO_GS" >/dev/null || { echo "video not found: $VIDEO_GS" >&2; exit 1; }

IMAGE=$(gcloud compute images list --project=deeplearning-platform-release --no-standard-images \
  --filter="family~^common-cu12[0-9]*-ubuntu-2204" --sort-by=~creationTimestamp --limit=1 --format="value(name)")
[[ -n "$IMAGE" ]] || { echo "no Deep Learning VM CUDA 12 / Ubuntu 22.04 image found" >&2; exit 1; }
echo "project=$PROJECT zone=$ZONE machine=$MACHINE image=$IMAGE run=$RUN_ID maxRun=$MAX_RUN"

STARTUP=$(mktemp)
cat > "$STARTUP" <<EOF
#!/bin/bash
# runs once on first boot (as root)
[ -f /var/pitchproof_started ] && exit 0; touch /var/pitchproof_started
exec > /var/log/pitchproof.log 2>&1
set -ex
ts() { echo "\"\$1\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\","; }
OUT=/data/out; mkdir -p \$OUT /data/videos
finish() {
  echo "{ \$(cat /data/ts.txt 2>/dev/null) \"end\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" }" > \$OUT/timestamps.json
  nvidia-smi > \$OUT/nvidia-smi.txt 2>&1 || true
  cp /var/log/pitchproof.log \$OUT/run.log
  gcloud storage cp -r \$OUT/* "${OUT_GS}/${RUN_ID}/" || true
  echo done | gcloud storage cp - "${OUT_GS}/${RUN_ID}/_DONE" || true
  gcloud compute instances delete \$(hostname) --zone ${ZONE} --quiet || shutdown -h now
}
trap finish EXIT
ts vmBooted >> /data/ts.txt
# NVIDIA driver (Deep Learning VM installs it when metadata install-nvidia-driver=True); wait up to 20 min
for i in \$(seq 1 120); do nvidia-smi >/dev/null 2>&1 && break; sleep 10; done
nvidia-smi
ts gpuReady >> /data/ts.txt
command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)
if ! docker info 2>/dev/null | grep -qi nvidia; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update && apt-get install -y nvidia-container-toolkit && nvidia-ctk runtime configure --runtime=docker && systemctl restart docker
fi
git clone --depth 1 -b ${BRANCH} https://github.com/CapalotDaGreat/ScoutX.git /data/ScoutX
git -C /data/ScoutX rev-parse HEAD > \$OUT/commit.txt
cd /data/ScoutX
docker build -f workers/football-cv/Dockerfile.tracker-gpu -t pitchproof-tracker-gpu:5.2 workers/football-cv
ts imageBuilt >> /data/ts.txt
gcloud storage cp "${VIDEO_GS}" /data/videos/
ts videoDownloaded >> /data/ts.txt
VID=/data/videos/\$(basename "${VIDEO_GS}")
SKIP_GPU_BUILD=1 GROUND_TRUTH="${GROUND_TRUTH:-}" \
  bash workers/football-cv/bench/run_gpu_match.sh "\$VID" "${NUMBER:-20}" "${KIT:-orange}" \$OUT "${RATE}" "${KIT2:-white}"
ts benchmarkFinished >> /data/ts.txt
EOF

gcloud compute instances create "$VM" --zone="$ZONE" --machine-type="$MACHINE" \
  --accelerator=type=nvidia-l4,count=1 --maintenance-policy=TERMINATE \
  --image="$IMAGE" --image-project=deeplearning-platform-release \
  --boot-disk-size=200GB --boot-disk-type=pd-balanced \
  --scopes=cloud-platform --metadata=install-nvidia-driver=True \
  --metadata-from-file=startup-script="$STARTUP" \
  --max-run-duration="$MAX_RUN" --instance-termination-action=DELETE \
  --labels=purpose=pitchproof-benchmark
rm -f "$STARTUP"
cleanup() { gcloud compute instances describe "$VM" --zone="$ZONE" >/dev/null 2>&1 && \
  gcloud compute instances delete "$VM" --zone="$ZONE" --quiet || true; }
trap cleanup EXIT
echo "VM $VM started. Waiting for ${OUT_GS}/${RUN_ID}/_DONE (Ctrl+C stops waiting AND deletes the VM)."
until gcloud storage ls "${OUT_GS}/${RUN_ID}/_DONE" >/dev/null 2>&1; do
  sleep 60
  gcloud compute instances describe "$VM" --zone="$ZONE" --format="value(status)" 2>/dev/null | grep -q . || {
    echo "VM no longer exists (finished, failed or hit MAX_RUN)"; break; }
done
mkdir -p "$HOME/pitchproof-benchmarks/$RUN_ID"
gcloud storage cp -r "${OUT_GS}/${RUN_ID}/*" "$HOME/pitchproof-benchmarks/$RUN_ID/" || true
echo "Results: $HOME/pitchproof-benchmarks/$RUN_ID  (and ${OUT_GS}/${RUN_ID}/)"
ls -la "$HOME/pitchproof-benchmarks/$RUN_ID" || true
