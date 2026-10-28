#!/usr/bin/env bash
# PitchProof full-match benchmark on ONE Google Cloud L4 VM (5.2) - run from Cloud Shell, signed in.
# CREATES A BILLED VM: run it only after the GPU quota and the spend are approved.
#
#   bash run_l4_benchmark.sh gs://BUCKET/videos/IMG_4809_proxy_10fps.mp4 gs://BUCKET/results
#
# One VM session does, in order (each step's time lands in timestamps.json):
#   1. boot + NVIDIA driver (Deep Learning VM image; driver >= 580 required for the CUDA 13.0 wheels);
#   2. build the pinned tracker image from the public repo (BRANCH) and verify GPU providers + model hashes;
#   3. CPU REFERENCE run in the same image (same packages, models, settings) - skip with BASELINE_GS=gs://.../full_match.json
#      (a previous CPU reference of the same commit and file; its claims JSON must sit next to it);
#   4. GPU run with the accuracy gate against that reference;
#   5. optional GPU option matrix (MATRIX=1): batch 4/16, ONNX Runtime CUDA, NVDEC - each gated;
#   6. cost summary (list-price estimates), upload everything to OUT_GS/<run id>/, delete the VM.
# Safety: hard --max-run-duration with DELETE (MAX_RUN, default 5h), the VM deletes itself when done, and this
# script deletes it on exit/Ctrl+C. Nothing is deployed and no release flag is touched.
# Optional env: ZONE (europe-west6-b), MACHINE (g2-standard-8), MAX_RUN (5h), BRANCH (feature/player-tracking-v3),
# BASELINE_GS, MATRIX (0), CHUNK_SEC (300), NUMBER/KIT/KIT2 + GROUND_TRUTH/REFERENCE (for recordings other than
# the IMG_4809 proxy: GROUND_TRUTH="" REFERENCE="").
set -euo pipefail
VIDEO_GS=${1:?gs:// path of the complete match video}
OUT_GS=${2:?gs:// folder for results}
PROJECT=$(gcloud config get-value project 2>/dev/null)
ZONE=${ZONE:-europe-west6-b}
MACHINE=${MACHINE:-g2-standard-8}
MAX_RUN=${MAX_RUN:-5h}
BRANCH=${BRANCH:-feature/player-tracking-v3}
RUN_ID=l4-$(date -u +%Y%m%d-%H%M%S)
VM=pitchproof-bench-${RUN_ID}
[[ -n "$PROJECT" ]] || { echo "no project: gcloud config set project scoutx-230b0" >&2; exit 1; }
gcloud storage ls "$VIDEO_GS" >/dev/null || { echo "video not found: $VIDEO_GS" >&2; exit 1; }
[[ -z "${BASELINE_GS:-}" ]] || gcloud storage ls "$BASELINE_GS" >/dev/null || { echo "baseline not found: $BASELINE_GS" >&2; exit 1; }

IMAGE=$(gcloud compute images list --project=deeplearning-platform-release --no-standard-images \
  --filter="family~^common-cu1[2-9][0-9]*-ubuntu-2204" --sort-by=~creationTimestamp --limit=1 --format="value(name)")
[[ -n "$IMAGE" ]] || { echo "no Deep Learning VM CUDA / Ubuntu 22.04 image found" >&2; exit 1; }
echo "project=$PROJECT zone=$ZONE machine=$MACHINE image=$IMAGE run=$RUN_ID maxRun=$MAX_RUN"

STARTUP=$(mktemp)
cat > "$STARTUP" <<EOF
#!/bin/bash
[ -f /var/pitchproof_started ] && exit 0; touch /var/pitchproof_started
exec > /var/log/pitchproof.log 2>&1
set -ex
OUT=/data/out; mkdir -p \$OUT /data/videos
ts() { echo "\"\$1\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> /data/ts.txt; }
tsjson() { echo "{ \$(cat /data/ts.txt) \"end\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" }" > \$OUT/timestamps.json; }
finish() {
  set +e
  tsjson
  nvidia-smi > \$OUT/nvidia-smi.txt 2>&1
  B=/data/ScoutX/workers/football-cv
  [ -f \$B/bench/vm_cost.py ] && docker run --rm -v \$OUT:/out pitchproof-tracker-gpu:5.2 python bench/vm_cost.py \
      --timestamps /out/timestamps.json --prices bench/gcp/prices_europe-west6.json \
      --run cpu=/out/cpu/full_match.json --run gpu=/out/gpu/full_match.json --out /out/cost_summary.json
  cp /var/log/pitchproof.log \$OUT/run.log
  rm -rf \$OUT/cpu/work \$OUT/gpu/work \$OUT/matrix/*/full_match_work
  gcloud storage cp -r \$OUT/* "${OUT_GS}/${RUN_ID}/"
  echo done | gcloud storage cp - "${OUT_GS}/${RUN_ID}/_DONE"
  gcloud compute instances delete \$(hostname) --zone ${ZONE} --quiet || shutdown -h now
}
trap finish EXIT
ts vmBooted
# partial results every 10 min, so a run cut off by MAX_RUN still leaves its JSON + log behind
( while sleep 600; do tsjson; cp /var/log/pitchproof.log \$OUT/run.log
    gcloud storage rsync -r -x ".*/work/.*|.*_work/.*" \$OUT "${OUT_GS}/${RUN_ID}/partial" >/dev/null 2>&1; done ) &
for i in \$(seq 1 120); do nvidia-smi >/dev/null 2>&1 && break; sleep 10; done
nvidia-smi
ts gpuReady
command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)
if ! docker info 2>/dev/null | grep -qi nvidia; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update && apt-get install -y nvidia-container-toolkit && nvidia-ctk runtime configure --runtime=docker && systemctl restart docker
fi
git clone --depth 1 -b ${BRANCH} https://github.com/CapalotDaGreat/ScoutX.git /data/ScoutX
git -C /data/ScoutX rev-parse HEAD > \$OUT/commit.txt
cd /data/ScoutX
docker build -f workers/football-cv/Dockerfile.tracker-gpu --build-arg GIT_COMMIT=\$(cat \$OUT/commit.txt) \
  -t pitchproof-tracker-gpu:5.2 workers/football-cv
ts imageBuilt
gcloud storage cp "${VIDEO_GS}" /data/videos/
VID=/data/videos/\$(basename "${VIDEO_GS}")
ts videoDownloaded
export SKIP_GPU_BUILD=1 NUMBER="${NUMBER:-20}" KIT="${KIT:-orange}" KIT2="${KIT2:-white}" CHUNK_SEC="${CHUNK_SEC:-300}"
${GROUND_TRUTH+export GROUND_TRUTH="${GROUND_TRUTH}"}
${REFERENCE+export REFERENCE="${REFERENCE}"}
if [ -n "${BASELINE_GS:-}" ]; then
  mkdir -p \$OUT/cpu && gcloud storage cp "${BASELINE_GS:-}" \$OUT/cpu/full_match.json
  gcloud storage cp "\$(dirname "${BASELINE_GS:-}")/full_match_claims.json" \$OUT/cpu/ || true
else
  CPU_REFERENCE=1 bash workers/football-cv/bench/run_gpu_match.sh "\$VID" \$OUT/cpu || echo "cpu reference exit \$?"
fi
ts cpuReferenceFinished
tsjson
BASELINE=\$OUT/cpu/full_match.json VM_TIMESTAMPS=\$OUT/timestamps.json \
  bash workers/football-cv/bench/run_gpu_match.sh "\$VID" \$OUT/gpu || echo "gpu run exit \$?"
ts gpuRunFinished
if [ "${MATRIX:-0}" = 1 ]; then
  docker run --rm --gpus all --ipc=host -e HOME=/tmp -v /data/videos:/videos:ro -v \$OUT:/out pitchproof-tracker-gpu:5.2 \
    python bench/gpu_matrix.py --video "/videos/\$(basename "\$VID")" --out-dir /out/matrix \
    --baseline /out/cpu/full_match.json --prices bench/gcp/prices_europe-west6.json || echo "matrix exit \$?"
  ts matrixFinished
fi
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
