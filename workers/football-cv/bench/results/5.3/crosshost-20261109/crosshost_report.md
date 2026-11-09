# PitchProof IMG_4809 cross-host stage-1 investigation

## Executive finding

The checkpoint settings fingerprints match exactly (`bb0899ea6879091f77fde373ce4d4e682b6c1e5f3cc109e44e3d9ea8e81537bc`), but the stage-1 payloads are not serialization-only differences. The earliest detection divergence is global frame **0** (chunk-local 0, t=0.0s): count; Linux has 12 person detections and Windows has 15.
Across all chunks, 19289 detection-bearing frames differ (13982 count, 5307 box, 5307 score), with 410894 Linux vs 415436 Windows person detections.
Classification: **mixed**, led by cross-platform decoded/preprocessed pixel differences and then runtime numerical effects. The fingerprint omits host/decoder-build/runtime details that can affect outputs.

## Fingerprint coverage

Included exactly:
- Engine version.
- Environment values: `SCOUTX_DETECTOR`, `SCOUTX_BACKEND`, `SCOUTX_DECODER`, `SCOUTX_HWACCEL`, `SCOUTX_KEYFRAME_EVERY`, `SCOUTX_PROP_SCORE_CAP`, `SCOUTX_BATCH`, `SCOUTX_ORT_PROVIDERS`, `SCOUTX_OCR_ENHANCE`.
- Package versions: torch, opencv-python, opencv-python-headless, numpy, onnxruntime, onnxruntime-gpu.
- Explicit benchmark fields: `imgsz`, `stride`, `discoveryImgsz`, logical `device`.

Not included:
- Resolved decoder/backend/provider (null means defaults), actual ORT session providers/order, ORT graph options, and ORT thread counts.
- Python version, OS/platform/architecture, CPU model/instruction features, process/thread environment (`OMP_NUM_THREADS`, `MKL_NUM_THREADS`, ORT/OpenMP affinity).
- OpenCV build information and video backend/FFmpeg library version/build; only wheel versions are included.
- Torch build/runtime details beyond package version, torchvision version, deterministic settings, and thread counts.
- Effective batch when `SCOUTX_BATCH` is null (resolved dynamically to 1/8), decode prefetch, `PYTHONHASHSEED`, locale.
- Model/derived ONNX file hashes and ONNX export provenance/opset.
- Input media metadata beyond the separately checked video SHA and chunk bounds.

Both records have identical settings dictionaries and fingerprint. In this run defaults resolve to OpenCV decode, ONNX backend, batch 1, CPU provider, and keyframe interval 1, but those effective resolutions are not recorded in the fingerprint.

## Chunk comparison

| Chunk | NPZ bytes L/W | SHA equal | dets L/W | embs L/W | differing frames | first divergence | times equal | grass max Δ | warps max Δ |
|---|---:|:---:|---:|---:|---:|---|:---:|---:|---:|
| c_00000 | 8919799/8416594 | no | 61153/62067 | 22353/22310 | 3000 | g0 @ 0s count | yes | 0.0178308 | 50.1587 |
| c_00001 | 9680296/9141537 | no | 65230/66195 | 24122/24313 | 3000 | g3000 @ 300s count | yes | 0.0143383 | 48.0587 |
| c_00002 | 9952784/9263876 | no | 68949/69007 | 23830/23876 | 3000 | g6000 @ 600s box,score | yes | 0.0220588 | 174.807 |
| c_00003 | 10316529/9655617 | no | 71402/71824 | 24889/24992 | 3000 | g9000 @ 900s count | yes | 0.0139706 | 35.6306 |
| c_00004 | 7737569/7262733 | no | 51867/52200 | 17926/17986 | 2644 | g12000 @ 1200s count | yes | 0.097886 | 3872.3 |
| c_00005 | 6267075/5925605 | no | 42283/43058 | 14277/14282 | 2295 | g15000 @ 1500s count | yes | 0.117555 | 3687.96 |
| c_00006 | 7487815/7068555 | no | 50010/51085 | 17818/17957 | 2350 | g18000 @ 1800s count | yes | 0.0184742 | 58.7411 |

All chunks have matching frame counts (3000 except c_00006: 2350), fps 10, detector `yolox_s@1280/onnx`, 1920×1080 dimensions, and keyframeEvery 1. `stageSeconds` and wall `seconds` differ as expected by host. Complete per-array shapes, means/maxima, score histograms, hashes, and meta values are in `crosshost_metrics.json`.

The Windows resolve copies are byte-identical to the 2026-11-05 original stage-1 chunks for every checked NPZ/meta/checkpoint; the resolved run did not regenerate or mix chunks. All seven Windows artifacts are present.

## Crop evidence

- c_00000: 5328 Linux / 5219 Windows crops; 163 common names, 5165 Linux-only, 5056 Windows-only.
  - `000000_0.jpg` geometry differs: [936, 273, 3] vs [936, 270, 3].
  - `000252_4855.jpg` geometry differs: [500, 196, 3] vs [106, 51, 3].
  - `000264_5046.jpg` geometry differs: [85, 38, 3] vs [84, 38, 3].
- c_00003: 5992 Linux / 5898 Windows crops; 4 common names, 5988 Linux-only, 5894 Windows-only.
  - `000000_0.jpg` geometry differs: [110, 64, 3] vs [110, 65, 3].
  - `000000_1.jpg` shape [96, 36, 3]: decoded JPEG pixel mean/max absolute delta 15.684/69 (equal=False).
  - `000006_154.jpg` geometry differs: [98, 50, 3] vs [106, 64, 3].
- c_00006: 5507 Linux / 5469 Windows crops; 15 common names, 5492 Linux-only, 5454 Windows-only.
  - `000000_0.jpg` geometry differs: [451, 226, 3] vs [450, 226, 3].
  - `000000_4.jpg` geometry differs: [93, 43, 3] vs [92, 43, 3].
  - `000002_39.jpg` geometry differs: [97, 51, 3] vs [122, 96, 3].

Common-name crops are not guaranteed to represent a perfectly paired detection after earlier count shifts, but widespread crop pixel/geometry differences, plus grass and camera-warp differences on aligned timestamps, rule out serialization-only change.
The strongest decoded-pixel evidence is c_00003 `000000_1.jpg`: both runs crop the same integer source rectangle (floating box L1 delta 0.416 px), produce the same 96×36 geometry, yet decoded JPEG pixels differ by mean/max 15.684/69 levels. Thus the detector received materially different decoded pixels before ORT numerical variation is considered.

## Host provenance

### linux
- Python `3.12.3`; platform `Linux-5.15.153.1-microsoft-standard-WSL2-x86_64-with-glibc2.39`; device `cpu`.
- torch `2.15.0+cpu`; ONNX Runtime `1.31.1`; providers `['AzureExecutionProvider', 'CPUExecutionProvider']`.
- OpenCV wheels `5.0.0.93` / `5.0.0.93`; runtime `5.0.0`; VideoIO `['FFMPEG:                      YES', 'GStreamer:                   NO']`.
- FFmpeg report: `ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers`.
- scoutxEnv: `{"SCOUTX_APPEARANCE_ONLY_LIKELY": "1", "SCOUTX_DETOUR_SPLIT": "0", "SCOUTX_EXCHANGE_SPLIT": "0", "SCOUTX_MODE": "balanced", "SCOUTX_OCR_CACHE_PROVENANCE": "0", "SCOUTX_OCR_CONSULTED_ONLY": "1", "SCOUTX_RESUME_SPLIT": "0", "SCOUTX_WEIGHTS_DIR": "/models/weights"}`.
### windowsResolve
- Python `3.12.10`; platform `Windows-11-10.0.26300-SP0`; device `cpu`.
- torch `2.15.0+cpu`; ONNX Runtime `1.31.1`; providers `['AzureExecutionProvider', 'CPUExecutionProvider']`.
- OpenCV wheels `5.0.0.93` / `5.0.0.93`; runtime `5.0.0`; VideoIO `['FFMPEG:                      YES (prebuilt binaries)', 'GStreamer:                   NO']`.
- FFmpeg report: `ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright (c) 2000-2026 the FFmpeg developers`.
- scoutxEnv: `{"SCOUTX_APPEARANCE_ONLY_LIKELY": "1", "SCOUTX_DETOUR_SPLIT": "0", "SCOUTX_EXCHANGE_SPLIT": "0", "SCOUTX_MODE": "balanced", "SCOUTX_OCR_CACHE_PROVENANCE": "0", "SCOUTX_OCR_CONSULTED_ONLY": "1", "SCOUTX_RESUME_SPLIT": "0"}`.

The input file and video-stream SHA-256 match on both hosts. Linux uses Ubuntu/WSL2 OpenCV VideoIO with system FFmpeg 6.1.1; Windows uses prebuilt OpenCV binaries and reports FFmpeg 9.0.2 externally. The external CLI version is not necessarily the library embedded by OpenCV, which is why full OpenCV build/backend provenance is needed.

## Causal conclusion

- **Not serialization-only:** semantic arrays, counts, scores, grass, warps, embeddings, and crops differ.
- **Not different frame selection/timestamps:** `times` arrays and frame counts align (see metrics for exact equality).
- **Different decoded/preprocessed pixels: supported:** aligned-frame grass/warp and crop pixels differ despite identical source bytes.
- **Model/runtime numerical effects: plausible additional contributor:** ORT CPU kernels are platform/build dependent; score/box differences occur. This analysis cannot isolate detector arithmetic from decode pixels because the saved artifact has no pre-detector frame hashes.
- **Omitted fingerprint fields: confirmed:** platform, OpenCV build/backend, effective backend/providers/batch/threads and model/ONNX hashes are absent.
- **Incomplete Windows artifacts: false:** all seven chunks are present and resolve reused the original chunks byte-for-byte.

## Minimal provenance patch suggestion

Keep output-affecting settings separate from diagnostic provenance. For checkpoint safety, minimally add these stable/effective fields to `stage1_settings` before fingerprinting:

1. `runtime.platform`: `sys.platform`, `platform.machine()`, and Python major.minor.micro.
2. `decode`: requested decoder plus **resolved** decoder (`cv2`/`ffmpeg`), `cv2.__version__`, selected VideoCapture backend name, and a hash of `cv2.getBuildInformation()` (or the relevant Video I/O/FFmpeg lines).
3. `inference`: resolved backend (`onnx`/`torch`), actual ORT provider list/order, effective batch, ORT intra-op/inter-op threads, and hashes of the `.pth` and derived `.onnx` files.
4. `numericRuntime`: torch/torchvision/ORT versions (already partly present) plus effective torch thread counts and deterministic flags.

Do not add `PYTHONHASHSEED` unless an audit shows unordered iteration affects persisted stage-1 ordering; record it as provenance first. Likewise, full `scoutxEnv` is too broad—fingerprint only output-affecting resolved values.

A concrete text-only patch outline is in `fingerprint_patch_suggestion.md`.
