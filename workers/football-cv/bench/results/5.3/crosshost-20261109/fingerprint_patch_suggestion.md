# Minimal fingerprint/provenance patch suggestion (text only)

No repository files were changed.

## `checkpoint.py`

Extend `stage1_settings()` (or pass these from the benchmark after runtime resolution) with:

```python
{
  "runtime": {
    "python": platform.python_version(),
    "platform": sys.platform,
    "machine": platform.machine(),
  },
  "decode": {
    "requested": env.get("SCOUTX_DECODER", "cv2"),
    "resolved": resolved_decoder,
    "opencv": cv2.__version__,
    "opencvBuildSha256": sha256(cv2.getBuildInformation().encode()).hexdigest(),
    "videoBackend": resolved_capture_backend,
  },
  "inference": {
    "resolvedBackend": resolved_backend,
    "ortProviders": actual_session_providers,
    "effectiveBatch": effective_batch,
    "ortIntraThreads": effective_ort_intra_threads,
    "ortInterThreads": effective_ort_inter_threads,
    "weightsSha256": weights_sha256,
    "onnxSha256": onnx_sha256,
  },
  "numericRuntime": {
    "torchThreads": torch.get_num_threads(),
    "torchInteropThreads": torch.get_num_interop_threads(),
    "deterministicAlgorithms": torch.are_deterministic_algorithms_enabled(),
  },
}
```

Because actual providers/backend/batch are known only after detector/session initialization, the cleanest minimal design is to expose
an effective-provenance dict from `Detector`/`OnnxDetector` and fingerprint that before accepting a checkpoint. If initialization cost
must remain avoidable on resume, resolve expected values with a lightweight helper and validate actual values after session creation.

Record `PYTHONHASHSEED`, OpenMP/MKL environment, CPU model/features, and full build text in `full_match.json` diagnostic provenance,
but do not automatically invalidate checkpoints on them unless tests establish that they alter persisted stage-1 output.
