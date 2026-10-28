#!/usr/bin/env bash
# Video Intelligence 5.2 - GPU benchmark runbook. NOT RUN: no GPU, no Docker daemon and no registry
# access were available while 5.2 was developed. Run this on a CUDA host (e.g. an NVIDIA L4 VM, or
# Cloud Run GPU via the same image) to produce the measurements the 5.2 report lists as BLOCKED.
#
#   docker build -f Dockerfile.tracker-gpu -t pitchproof-tracker-gpu:5.2 .
#   docker run --rm --gpus all -v /path/to/videos:/data -v $PWD/bench/results/5.2/gpu:/out \
#       pitchproof-tracker-gpu:5.2 bash bench/gpu_runbook.sh /data/IMG_4809.MOV /out
#
# Every number lands in $OUT with the hardware it was measured on (nvidia-smi, torch, onnxruntime
# providers). Only accuracy-validated modes run by default; set SCOUTX_ALLOW_UNVALIDATED_MODE=1 to
# also time "fast" (its accuracy was NOT approved - see scoutx_tracker/modes.py).
set -euo pipefail
VIDEO=${1:?video path}
OUT=${2:-bench/results/5.2/gpu}
PRICE=${PRICE_PER_HOUR:-}
mkdir -p "$OUT"
PY=${PYTHON:-python}

nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv > "$OUT/nvidia-smi.csv" || echo "no nvidia-smi" > "$OUT/nvidia-smi.csv"
$PY - > "$OUT/runtime.json" <<'EOF'
import json, torch
try:
    import onnxruntime as ort; prov = ort.get_available_providers(); ortv = ort.__version__
except ImportError:
    prov, ortv = [], None
print(json.dumps({"torch": torch.__version__, "cuda": torch.cuda.is_available(),
                  "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
                  "onnxruntime": ortv, "ortProviders": prov}))
EOF

# 1. detector throughput: torch fp32 / fp16 and ONNX Runtime CUDA EP, batch 1/4/8/16
$PY bench/inference_benchmark.py --video "$VIDEO" --weights-dir "${SCOUTX_WEIGHTS_DIR:-/opt/models/yolox}" \
    --variants yolox_s --batch 1 4 8 16 --frames 200 --onnx --nvdec ${PRICE:+--price-per-hour $PRICE} \
    --out "$OUT/inference.json"

# 2. end-to-end per mode (discovery, one 300 s segment, cold + warm resolve)
MODES="balanced"
[ "${SCOUTX_ALLOW_UNVALIDATED_MODE:-0}" = "1" ] && MODES="balanced fast detailed"
for m in $MODES; do
  ( eval "$($PY -m scoutx_tracker.modes "$m")"
    $PY bench/pipeline_benchmark.py --video "$VIDEO" --number 20 --kit orange --segment 300 \
        ${PRICE:+--price-per-hour $PRICE} --out "$OUT/pipeline_$m.json" )
done

# 3. same run with the ONNX Runtime CUDA execution provider instead of torch (A/B for the backend)
( export SCOUTX_BACKEND=onnx SCOUTX_ORT_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
  $PY bench/pipeline_benchmark.py --video "$VIDEO" --number 20 --kit orange --segment 300 \
      ${PRICE:+--price-per-hour $PRICE} --out "$OUT/pipeline_balanced_ortcuda.json" )

echo "done: $OUT (compare identity outputs of each run with the CPU reference before quoting speed)"
