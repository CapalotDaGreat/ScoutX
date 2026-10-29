#!/usr/bin/env bash
# PitchProof full-match benchmark on ONE Google Cloud L4 VM (5.3). CREATES A BILLED VM - run it only with approval.
#
#   bash run_l4_benchmark.sh gs://BUCKET/videos/IMG_4809_proxy_10fps.mp4 gs://BUCKET/results
#
# One VM session (g2-standard-8 = 8 vCPU, 32 GB, 1x L4 attached by the machine type), in this order:
#   1. boot + NVIDIA driver (Deep Learning VM image; >= 580 required for the image's CUDA 13.0 wheels)
#   2. build the pinned image (Dockerfile.tracker-gpu) and verify torch + ONNX Runtime really run on the GPU and
#      the model hashes match the CPU-validated files
#   3. GPU run (validated balanced mode, absolute accuracy gate)
#   4. CPU reference in the SAME image, with a time budget so it cannot use up the session (status "interrupted"
#      and the completed chunks are kept if it runs out)
#   5. offline CPU-vs-GPU comparison with the full gate (bench/compare_runs.py)
#   6. optional experiments chosen through the control channel (bench/gpu_matrix.py variants, each gated)
#   7. cost summary, upload, delete
# Control channel: the VM polls gs://.../<run id>/control/next - write "retry" (after a failed build: pull the
# branch again and rebuild), "experiments batch-16,nvdec" or "finish". No answer within the wait = finish.
# Progress: serial console (gcloud compute instances get-serial-port-output) and gs://.../<run id>/partial/ every 5 min.
# Cleanup safeguards (independent): 1) --max-run-duration with DELETE (MAX_RUN, default 300 min); 2) guest
# `shutdown -h` 5 min before that (stops compute billing even if the API delete failed); 3) the VM deletes itself
# at the end (trap, also on failure); 4) this script deletes it on exit unless NO_WAIT=1 (then the operator must).
# Optional env: ZONE (europe-west6-b), MACHINE (g2-standard-8), MAX_RUN_MIN (300), BRANCH (feature/player-tracking-v3),
# CHUNK_SEC (300), NO_WAIT (0), NUMBER/KIT/KIT2, GROUND_TRUTH/REFERENCE ("" for recordings without them).
set -euo pipefail
VIDEO_GS=${1:?gs:// path of the complete match video}
OUT_GS=${2:?gs:// folder for results}
PROJECT=$(gcloud config get-value project 2>/dev/null)
ZONE=${ZONE:-europe-west6-b}
MACHINE=${MACHINE:-g2-standard-8}
MAX_RUN_MIN=${MAX_RUN_MIN:-300}
BRANCH=${BRANCH:-feature/player-tracking-v3}
RUN_ID=${RUN_ID:-l4-$(date -u +%Y%m%d-%H%M%S)}
VM=pitchproof-bench-${RUN_ID}
# PRICE_FILE is an operator-verified catalog snapshot for this session's region. Embed it
# in the startup script so cost calculations do not silently retain Zurich pricing.
PRICE_FILE=${PRICE_FILE:-$(dirname "${BASH_SOURCE[0]}")/prices_europe-west6.json}
python3 - "$PRICE_FILE" "$ZONE" <<'PY'
import json, math, sys
p = json.load(open(sys.argv[1]))
region = sys.argv[2].rsplit('-', 1)[0]
rate = p.get('vmUsdPerHour')
if p.get('region') != region or not isinstance(rate, (int, float)) or not math.isfinite(rate) or rate <= 0:
    raise SystemExit('price snapshot must match the VM region and contain a positive finite hourly rate')
PY
PRICE_B64=$(base64 < "$PRICE_FILE" | tr -d '\n')
[[ -n "$PROJECT" ]] || { echo "no project: gcloud config set project scoutx-230b0" >&2; exit 1; }
gcloud storage ls "$VIDEO_GS" >/dev/null || { echo "video not found: $VIDEO_GS" >&2; exit 1; }
EXISTING=$(gcloud compute instances list --filter="labels.purpose=pitchproof-benchmark" --format="value(name)")
[[ -z "$EXISTING" ]] || { echo "a benchmark VM already exists: $EXISTING - not creating another" >&2; exit 1; }

IMAGE=$(gcloud compute images list --project=deeplearning-platform-release --no-standard-images \
  --filter="family~^common-cu1[2-9][0-9]*-ubuntu-2204-nvidia-5[89][0-9]" --sort-by=~creationTimestamp --limit=1 --format="value(name)")
[[ -n "$IMAGE" ]] || { echo "no Deep Learning VM image with NVIDIA driver >= 580 found" >&2; exit 1; }
echo "project=$PROJECT zone=$ZONE machine=$MACHINE image=$IMAGE run=$RUN_ID maxRunMin=$MAX_RUN_MIN"

STARTUP=$(mktemp)
cat > "$STARTUP" <<EOF
#!/bin/bash
[ -f /var/pitchproof_started ] && exit 0; touch /var/pitchproof_started
exec > >(tee -a /var/log/pitchproof.log) 2>&1      # also on the serial console (startup-script runner)
set -x
BOOT=\$(date +%s)
DEADLINE=\$(( BOOT + (${MAX_RUN_MIN} - 12) * 60 ))  # leave time for compare + upload before the hard delete
shutdown -h +\$(( ${MAX_RUN_MIN} - 5 )) "pitchproof benchmark guest safeguard" || true
OUT=/data/out; mkdir -p \$OUT /data/videos
echo '${PRICE_B64}' | base64 -d > \$OUT/prices.json
mkdir -p \$OUT/gpu \$OUT/cpu
cp \$OUT/prices.json \$OUT/gpu/prices.json
cp \$OUT/prices.json \$OUT/cpu/prices.json
export PRICES=/out/prices.json
GS="${OUT_GS}/${RUN_ID}"
ts() { echo "\"\$1\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\"," >> /data/ts.txt; echo "PHASE \$1"; }
tsjson() { echo "{ \$(cat /data/ts.txt 2>/dev/null) \"end\": \"\$(date -u +%Y-%m-%dT%H:%M:%SZ)\" }" > \$OUT/timestamps.json; }
status() { echo "\$1" > \$OUT/STATUS; gcloud storage cp \$OUT/STATUS "\$GS/STATUS" >/dev/null 2>&1; echo "STATUS \$1"; }
left() { echo \$(( DEADLINE - \$(date +%s) )); }
wait_ctl() {  # \$1 = max seconds; prints the command (and deletes it) or "finish"
  local end=\$(( \$(date +%s) + \$1 ))
  while [ \$(date +%s) -lt \$end ] && [ \$(left) -gt 300 ]; do
    c=\$(gcloud storage cat "\$GS/control/next" 2>/dev/null) && { gcloud storage rm "\$GS/control/next" >/dev/null 2>&1; echo "\$c"; return; }
    sleep 30
  done
  echo finish
}
finish() {
  set +e
  ts finished; tsjson
  nvidia-smi > \$OUT/nvidia-smi.txt 2>&1
  df -h /data > \$OUT/disk.txt 2>&1; free -m >> \$OUT/disk.txt 2>&1
  docker image inspect pitchproof-tracker-gpu:5.2 > \$OUT/image_inspect.json 2>/dev/null
  if docker image inspect pitchproof-tracker-gpu:5.2 >/dev/null 2>&1; then
    docker run --rm -v \$OUT:/out pitchproof-tracker-gpu:5.2 python bench/compare_runs.py --reference /out/cpu/full_match.json \
      --candidate /out/gpu/full_match.json --gate bench/gates/balanced_5.2.json --out /out/comparison.json
    docker run --rm -v \$OUT:/out pitchproof-tracker-gpu:5.2 python bench/vm_cost.py --timestamps /out/timestamps.json \
      --prices /out/prices.json --run cpu=/out/cpu/full_match.json --run gpu=/out/gpu/full_match.json \
      --out /out/cost_summary.json
  fi
  cp /var/log/pitchproof.log \$OUT/run.log
  rm -rf \$OUT/cpu/work \$OUT/gpu/work \$OUT/matrix/*/full_match_work
  gcloud storage cp -r \$OUT/* "\$GS/"
  echo done | gcloud storage cp - "\$GS/_DONE"
  gcloud compute instances delete \$(hostname) --zone ${ZONE} --quiet || shutdown -h now
}
trap finish EXIT
ts vmBooted; status booting
( while sleep 300; do tsjson; cp /var/log/pitchproof.log \$OUT/run.log
    gcloud storage rsync -r -x ".*/work/.*|.*_work/.*" \$OUT "\$GS/partial" >/dev/null 2>&1; done ) &
for i in \$(seq 1 120); do nvidia-smi >/dev/null 2>&1 && break; sleep 10; done
nvidia-smi || { status driver_failed; exit 1; }
ts gpuReady; status driver_ready
command -v docker >/dev/null || (curl -fsSL https://get.docker.com | sh)
if ! docker info 2>/dev/null | grep -qi nvidia; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update && apt-get install -y nvidia-container-toolkit && nvidia-ctk runtime configure --runtime=docker && systemctl restart docker
fi
git clone -b ${BRANCH} https://github.com/CapalotDaGreat/ScoutX.git /data/ScoutX
cd /data/ScoutX
gcloud storage cp "${VIDEO_GS}" /data/videos/ && ts videoDownloaded
VID=/data/videos/\$(basename "${VIDEO_GS}")
# ---- build + verify (retry through the control channel after a fix is pushed)
for attempt in 1 2 3; do
  git fetch -q origin ${BRANCH} && git reset -q --hard origin/${BRANCH}
  git rev-parse HEAD > \$OUT/commit.txt
  status "building attempt \$attempt"
  if docker build -f workers/football-cv/Dockerfile.tracker-gpu --build-arg GIT_COMMIT=\$(cat \$OUT/commit.txt) \
       -t pitchproof-tracker-gpu:5.2 workers/football-cv > \$OUT/build_\$attempt.log 2>&1 \
     && docker run --rm --gpus all pitchproof-tracker-gpu:5.2 python -m scoutx_tracker.envinfo --require-gpu --require-models > \$OUT/envinfo_gpu.json; then
    ts imageBuilt; status image_verified; break
  fi
  tail -60 \$OUT/build_\$attempt.log; cat \$OUT/envinfo_gpu.json 2>/dev/null | tail -40
  status "build_or_verify_failed attempt \$attempt - waiting for control (retry|finish)"
  gcloud storage cp \$OUT/build_\$attempt.log "\$GS/" >/dev/null 2>&1; gcloud storage cp \$OUT/envinfo_gpu.json "\$GS/" >/dev/null 2>&1
  [ "\$(wait_ctl 2400)" = retry ] || exit 1
done
docker image inspect pitchproof-tracker-gpu:5.2 >/dev/null 2>&1 && [ "\$(cat \$OUT/STATUS)" = image_verified ] || exit 1
export SKIP_GPU_BUILD=1 NUMBER="${NUMBER:-20}" KIT="${KIT:-orange}" KIT2="${KIT2:-white}" CHUNK_SEC="${CHUNK_SEC:-300}"
${GROUND_TRUTH+export GROUND_TRUTH="${GROUND_TRUTH}"}
${REFERENCE+export REFERENCE="${REFERENCE}"}
# ---- GPU run (balanced, absolute gate; the CPU-relative gate is applied after the reference finishes)
status gpu_run
VM_TIMESTAMPS= bash workers/football-cv/bench/run_gpu_match.sh "\$VID" \$OUT/gpu; echo "gpu exit \$?" | tee \$OUT/gpu_exit.txt
ts gpuRunFinished; tsjson
# ---- CPU reference in the same image, within the remaining budget
BUDGET=\$(( \$(left) - 1200 ))
if [ \$BUDGET -gt 1200 ]; then
  status "cpu_reference budget \${BUDGET}s"
  CPU_REFERENCE=1 BENCH_TIMEOUT_SEC=\$BUDGET bash workers/football-cv/bench/run_gpu_match.sh "\$VID" \$OUT/cpu
  echo "cpu exit \$?" | tee \$OUT/cpu_exit.txt
else
  echo "cpu reference skipped: only \$(left)s left" | tee \$OUT/cpu_exit.txt
fi
ts cpuReferenceFinished; tsjson
docker run --rm -v \$OUT:/out pitchproof-tracker-gpu:5.2 python bench/compare_runs.py --reference /out/cpu/full_match.json \
  --candidate /out/gpu/full_match.json --gate bench/gates/balanced_5.2.json --out /out/comparison.json; echo "compare exit \$?"
gcloud storage rsync -r -x ".*/work/.*|.*_work/.*" \$OUT "\$GS/partial" >/dev/null 2>&1
# ---- optional experiments (chosen from the measured bottleneck through the control channel)
status "waiting for control: experiments <list> | finish"
CMD=\$(wait_ctl 1200)
case "\$CMD" in experiments*)
  # Relative accuracy gates are mandatory before spending time on optimisations.
  grep -q '"exitCode": 0' \$OUT/comparison.json 2>/dev/null || { status experiments_refused_without_passing_comparison; exit 1; }
  V=\$(echo "\$CMD" | cut -d' ' -f2 | tr ',' ' ')
  BASE=/out/gpu/full_match.json; grep -q '"exitCode": 0' \$OUT/comparison.json 2>/dev/null && BASE=/out/cpu/full_match.json
  status "experiments \$V (budget \$(( \$(left) - 300 ))s)"
  docker run --rm --gpus all --ipc=host -e HOME=/tmp -v /data/videos:/videos:ro -v \$OUT:/out pitchproof-tracker-gpu:5.2 \
    timeout --signal=INT --kill-after=120 \$(( \$(left) - 300 )) python bench/gpu_matrix.py --video "/videos/\$(basename "\$VID")" \
    --out-dir /out/matrix --baseline \$BASE --prices /out/prices.json --gpu-reference /out/gpu/full_match.json --variants \$V
  echo "matrix exit \$?"; ts experimentsFinished;;
esac
status finishing
EOF

gcloud compute instances create "$VM" --zone="$ZONE" --machine-type="$MACHINE" \
  --maintenance-policy=TERMINATE --provisioning-model=STANDARD \
  --image="$IMAGE" --image-project=deeplearning-platform-release \
  --boot-disk-size=200GB --boot-disk-type=pd-balanced \
  --scopes=cloud-platform --metadata=install-nvidia-driver=True \
  --metadata-from-file=startup-script="$STARTUP" \
  --max-run-duration="${MAX_RUN_MIN}m" --instance-termination-action=DELETE \
  --labels=purpose=pitchproof-benchmark,run="${RUN_ID}"
rm -f "$STARTUP"
echo "RUN_ID=$RUN_ID VM=$VM"
[[ "${NO_WAIT:-0}" == 1 ]] && { echo "NO_WAIT=1: the caller must monitor and verify deletion of $VM"; exit 0; }
cleanup() { gcloud compute instances describe "$VM" --zone="$ZONE" >/dev/null 2>&1 && \
  gcloud compute instances delete "$VM" --zone="$ZONE" --quiet || true; }
trap cleanup EXIT
echo "Waiting for ${OUT_GS}/${RUN_ID}/_DONE (Ctrl+C stops waiting AND deletes the VM)."
until gcloud storage ls "${OUT_GS}/${RUN_ID}/_DONE" >/dev/null 2>&1; do
  sleep 60
  gcloud compute instances describe "$VM" --zone="$ZONE" --format="value(status)" 2>/dev/null | grep -q . || {
    echo "VM no longer exists (finished, failed or hit the time limit)"; break; }
  gcloud storage cat "${OUT_GS}/${RUN_ID}/STATUS" 2>/dev/null || true
done
mkdir -p "$HOME/pitchproof-benchmarks/$RUN_ID"
gcloud storage cp -r "${OUT_GS}/${RUN_ID}/*" "$HOME/pitchproof-benchmarks/$RUN_ID/" || true
echo "Results: $HOME/pitchproof-benchmarks/$RUN_ID  (and ${OUT_GS}/${RUN_ID}/)"
