#!/usr/bin/env bash
# Full-match benchmark inside the pinned tracker image (5.2). From the repository root:
#
#   bash workers/football-cv/bench/run_gpu_match.sh VIDEO OUTDIR            # GPU run (refuses CPU fallback)
#   CPU_REFERENCE=1 bash workers/football-cv/bench/run_gpu_match.sh VIDEO OUTDIR_CPU   # same image, CPU only
#   BASELINE=OUTDIR_CPU/full_match.json bash workers/football-cv/bench/run_gpu_match.sh VIDEO OUTDIR_GPU
#
# Defaults are the validated reference (IMG_4809 10 fps proxy, #20 orange/white, balanced mode, ground truth,
# gate balanced-5.2, Zurich list prices). Optional env: NUMBER KIT KIT2 GROUND_TRUTH REFERENCE GATE PRICES
# (paths INSIDE the image, relative to /srv), BASELINE (host path), CHUNK_SEC, VM_TIMESTAMPS (host path),
# SKIP_GPU_BUILD=1, PITCHPROOF_GPU_IMAGE.
# Checkpoints live in OUTDIR/work: re-running the same command after an interruption resumes (the JSON then
# says timingComplete=false). Exit code = the benchmark's (0 ok, 2 failed, 3 accuracy gate failed,
# 4 GPU/model verification failed, 5 not comparable / config mismatch, 6 disk space).
set -euo pipefail
VIDEO=${1:?path to the local video}
OUT=${2:?output directory}
NUMBER=${NUMBER:-20}; KIT=${KIT:-orange}; KIT2=${KIT2:-white}
GROUND_TRUTH=${GROUND_TRUTH-bench/results/5.1/gt_img4809_intervals.json}
REFERENCE=${REFERENCE-bench/references/img4809_proxy_10fps.json}
GATE=${GATE-bench/gates/balanced_5.2.json}
PRICES=${PRICES-bench/gcp/prices_europe-west6.json}
command -v docker >/dev/null || { echo 'Docker missing' >&2; exit 1; }
GPU_ARGS=(--gpus all)
BENCH_GPU=(--require-gpu)
if [[ "${CPU_REFERENCE:-0}" == 1 ]]; then
  GPU_ARGS=(); BENCH_GPU=()
else
  command -v nvidia-smi >/dev/null || { echo 'NVIDIA driver / nvidia-smi missing' >&2; exit 1; }
  DRV=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1)
  [[ "${DRV%%.*}" -ge 580 ]] || { echo "NVIDIA driver $DRV < 580: the image's CUDA 13.0 wheels need >= 580" >&2; exit 1; }
fi
VIDEO=$(realpath "$VIDEO"); mkdir -p "$OUT"; OUT=$(realpath "$OUT")
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)
IMAGE=${PITCHPROOF_GPU_IMAGE:-pitchproof-tracker-gpu:5.2}
if [[ "${SKIP_GPU_BUILD:-0}" != 1 ]]; then
  t0=$(date +%s)
  docker build -f "$ROOT/workers/football-cv/Dockerfile.tracker-gpu" \
    --build-arg GIT_COMMIT="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unknown)" \
    -t "$IMAGE" "$ROOT/workers/football-cv"
  echo "{\"imageBuildSec\": $(( $(date +%s) - t0 ))}" > "$OUT/image_build.json"
fi
docker image inspect "$IMAGE" --format '{"id":"{{.Id}}","created":"{{.Created}}","repoDigests":{{json .RepoDigests}},"labels":{{json .Config.Labels}}}' > "$OUT/image.json"
RUN=(docker run --rm "${GPU_ARGS[@]}" --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp
     -e SCOUTX_MODE="${SCOUTX_MODE:-balanced}" -v "$(dirname "$VIDEO"):/videos:ro" -v "$OUT:/out")
# Environment / provider / model verification first (fails fast, before any long run)
"${RUN[@]}" "$IMAGE" python -m scoutx_tracker.envinfo ${BENCH_GPU[@]+--require-gpu} --require-models > "$OUT/envinfo.json" || {
  echo "environment verification failed - see $OUT/envinfo.json" >&2; exit 4; }
ARGS=(--video "/videos/$(basename "$VIDEO")" --number "$NUMBER" --kit "$KIT" --kit2 "$KIT2" --out /out/full_match.json
      --work-dir /out/work --chunk-sec "${CHUNK_SEC:-300}" --require-models ${BENCH_GPU[@]+"${BENCH_GPU[@]}"})
[[ -n "$GROUND_TRUTH" ]] && ARGS+=(--ground-truth "$GROUND_TRUTH")
[[ -n "$REFERENCE" ]] && ARGS+=(--reference "$REFERENCE")
[[ -n "$GATE" ]] && ARGS+=(--gate "$GATE")
[[ -n "$PRICES" ]] && ARGS+=(--prices "$PRICES")
if [[ -n "${BASELINE:-}" ]]; then
  BASELINE=$(realpath "$BASELINE")
  RUN+=(-v "$(dirname "$BASELINE"):/baseline:ro"); ARGS+=(--baseline "/baseline/$(basename "$BASELINE")")
fi
if [[ -n "${VM_TIMESTAMPS:-}" ]]; then
  RUN+=(-v "$(realpath "$VM_TIMESTAMPS"):/vm_timestamps.json:ro"); ARGS+=(--vm-timestamps /vm_timestamps.json)
fi
set +e
"${RUN[@]}" "$IMAGE" python bench/full_match_benchmark.py "${ARGS[@]}"
rc=$?
set -e
printf '\nResults: %s/full_match.json (exit %s)\n' "$OUT" "$rc"
exit $rc
