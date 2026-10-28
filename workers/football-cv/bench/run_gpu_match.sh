#!/usr/bin/env bash
# From repository root: bash workers/football-cv/bench/run_gpu_match.sh VIDEO NUMBER KIT OUTDIR HOST_USD_PER_HOUR [KIT2]
set -euo pipefail
VIDEO=${1:?Path to local match video}
NUMBER=${2:?Target jersey number}
KIT=${3:?Primary kit colour}
OUT=${4:?Output directory}
RATE=${5:?All-in GPU host USD/hour rate from provider pricing}
KIT2=${6:-}
command -v docker >/dev/null || { echo 'Docker missing' >&2; exit 1; }
command -v nvidia-smi >/dev/null || { echo 'NVIDIA driver / nvidia-smi missing' >&2; exit 1; }
nvidia-smi >/dev/null || { echo 'GPU not visible' >&2; exit 1; }
VIDEO=$(realpath "$VIDEO")
mkdir -p "$OUT"
OUT=$(realpath "$OUT")
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
IMAGE=${PITCHPROOF_GPU_IMAGE:-pitchproof-tracker-gpu:5.2}
if [[ "${SKIP_GPU_BUILD:-0}" != 1 ]]; then
  docker build -f "$ROOT/workers/football-cv/Dockerfile.tracker-gpu" -t "$IMAGE" "$ROOT/workers/football-cv"
fi
# Separate container startup is outside the measured Python pipeline. Include it in a provider billing audit.
docker run --rm --gpus all --ipc=host \
  -v "$(dirname "$VIDEO"):/videos:ro" -v "$OUT:/out" \
  --entrypoint python3.11 "$IMAGE" bench/full_match_benchmark.py \
  --video "/videos/$(basename "$VIDEO")" --number "$NUMBER" --kit "$KIT" --kit2 "$KIT2" \
  --chunk-sec "${CHUNK_SEC:-300}" --host-usd-per-hour "$RATE" --require-gpu --out /out/full_match.json
printf '\nResults: %s/full_match.json\n' "$OUT"
