"""5.2: environment metadata, model-file verification and GPU provider checks.

Benchmark results are only comparable when the code, packages, model files and decoding are the
same. `environment_metadata()` records all of them; `verify_models()` checks model files against
the pinned SHA-256 list (bench/references/model_hashes.json); `verify_gpu_providers()` proves
that torch and ONNX Runtime really execute on the GPU (a provider being *available* is not enough:
ONNX Runtime silently falls back to CPU when CUDA libraries are missing).
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

PACKAGES = ("torch", "torchvision", "numpy", "scipy", "opencv-python", "opencv-python-headless", "easyocr",
            "python-doctr", "scikit-learn", "onnxruntime", "onnxruntime-gpu", "av", "pillow", "fastapi", "pydantic")
MODEL_HASHES = Path(__file__).resolve().parents[1] / "bench" / "references" / "model_hashes.json"


def sha256_file(path: str | Path, chunk: int = 8 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while b := f.read(chunk):
            h.update(b)
    return h.hexdigest()


def model_roots() -> dict[str, Path]:
    """Where the engine loads each model family from (same environment variables as the loaders)."""
    home = Path.home()
    return {
        "yolox": Path(os.environ.get("SCOUTX_WEIGHTS_DIR", home / ".cache" / "scoutx" / "weights")),
        "easyocr": Path(os.environ.get("EASYOCR_MODULE_PATH", home / ".EasyOCR")),
        "doctr": Path(os.environ.get("DOCTR_CACHE_DIR", home / ".cache" / "doctr")),
    }


def verify_models(manifest: str | Path = MODEL_HASHES, roots: dict[str, Path] | None = None) -> dict:
    """{"ok": bool, "files": {rel: {"sha256", "expected", "ok"}}} - a missing file is not ok."""
    roots = roots or model_roots()
    want = json.loads(Path(manifest).read_text())["files"]
    files, ok = {}, True
    for rel, expected in want.items():
        fam, sub = rel.split("/", 1)
        p = roots[fam] / sub
        got = sha256_file(p) if p.is_file() else None
        files[rel] = {"path": str(p), "sha256": got, "expected": expected, "ok": got == expected}
        ok &= got == expected
    return {"ok": ok, "files": files}


def _version(pkg: str) -> str | None:
    from importlib.metadata import PackageNotFoundError, version  # noqa: PLC0415

    try:
        return version(pkg)
    except PackageNotFoundError:
        return None


def _run(cmd: list[str]) -> str | None:
    if not shutil.which(cmd[0]):
        return None
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
        return p.stdout.strip() if p.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def environment_metadata() -> dict:
    info: dict = {"python": sys.version.split()[0], "platform": platform.platform(), "cpuCores": os.cpu_count(),
                  "packages": {p: _version(p) for p in PACKAGES if _version(p)}}
    try:
        import torch  # noqa: PLC0415

        info["torch"] = {"version": torch.__version__, "cuda": torch.version.cuda, "cudaAvailable": torch.cuda.is_available(),
                         "cudnn": torch.backends.cudnn.version() if torch.backends.cudnn.is_available() else None}
        if torch.cuda.is_available():
            info["torch"]["device"] = torch.cuda.get_device_name(0)
            info["torch"]["capability"] = ".".join(map(str, torch.cuda.get_device_capability(0)))
    except ImportError:
        info["torch"] = None
    try:
        import onnxruntime as ort  # noqa: PLC0415

        info["onnxruntime"] = {"version": ort.__version__, "availableProviders": ort.get_available_providers()}
    except ImportError:
        info["onnxruntime"] = None
    try:
        import cv2  # noqa: PLC0415

        build = cv2.getBuildInformation()
        info["opencv"] = {"version": cv2.__version__,
                          "videoIO": [ln.strip() for ln in build.splitlines() if ln.strip().startswith(("FFMPEG:", "GStreamer:"))]}
    except ImportError:
        info["opencv"] = None
    ff = _run(["ffmpeg", "-hide_banner", "-version"])
    info["ffmpeg"] = ff.splitlines()[0] if ff else None
    smi = _run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"])
    info["nvidiaSmi"] = smi
    info["driverMajor"] = int(smi.split(",")[-1].strip().split(".")[0]) if smi else None
    info["engineVersion"] = __import__("scoutx_tracker").__version__
    # baked into the image at build time (Dockerfile.tracker-gpu); None outside the image
    info["image"] = {k: os.environ.get(v) for k, v in (("gitCommit", "SCOUTX_GIT_COMMIT"), ("built", "SCOUTX_IMAGE_BUILT"),
                                                      ("baseImage", "SCOUTX_BASE_IMAGE"), ("lockSha256", "SCOUTX_LOCK_SHA256"))}
    info["scoutxEnv"] = {k: v for k, v in sorted(os.environ.items()) if k.startswith("SCOUTX_")}
    return info


def _tiny_onnx() -> bytes:
    import onnx  # noqa: PLC0415
    from onnx import TensorProto, helper  # noqa: PLC0415

    x = helper.make_tensor_value_info("x", TensorProto.FLOAT, [1, 64])
    y = helper.make_tensor_value_info("y", TensorProto.FLOAT, [1, 64])
    w = helper.make_tensor("w", TensorProto.FLOAT, [64, 64], [0.01] * 4096)
    g = helper.make_graph([helper.make_node("MatMul", ["x", "w"], ["y"])], "probe", [x], [y], [w])
    m = helper.make_model(g, opset_imports=[helper.make_opsetid("", 17)])
    m.ir_version = 8
    return m.SerializeToString()


def verify_gpu_providers() -> dict:
    """Runs one tiny op on each GPU path and reports what actually executed. ok = both on GPU."""
    out: dict = {"torch": {"ok": False}, "onnxruntimeCuda": {"ok": False}}
    try:
        import torch  # noqa: PLC0415

        if torch.cuda.is_available():
            a = torch.ones(64, 64, device="cuda", dtype=torch.float16)
            out["torch"] = {"ok": bool(float((a @ a)[0, 0]) == 64.0), "fp16": True}
        else:
            out["torch"] = {"ok": False, "reason": "torch.cuda.is_available() is false"}
    except Exception as e:  # noqa: BLE001
        out["torch"] = {"ok": False, "reason": f"{type(e).__name__}: {e}"}
    try:
        import numpy as np  # noqa: PLC0415
        import onnxruntime as ort  # noqa: PLC0415

        if hasattr(ort, "preload_dlls"):
            ort.preload_dlls()  # CUDA / cuDNN from the nvidia-* wheels (no system CUDA in the image)
        s = ort.InferenceSession(_tiny_onnx(), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
        s.run(None, {"x": np.ones((1, 64), np.float32)})
        used = s.get_providers()
        out["onnxruntimeCuda"] = {"ok": used[0] == "CUDAExecutionProvider", "providers": used}
    except Exception as e:  # noqa: BLE001
        out["onnxruntimeCuda"] = {"ok": False, "reason": f"{type(e).__name__}: {e}"}
    out["ok"] = out["torch"]["ok"] and out["onnxruntimeCuda"]["ok"]
    return out


def main(argv: list[str]) -> int:
    """`python -m scoutx_tracker.envinfo [--require-gpu] [--require-models]`: prints the metadata JSON."""
    rep = {"environment": environment_metadata(), "models": verify_models() if MODEL_HASHES.exists() else None}
    if "--require-gpu" in argv:
        rep["gpuProviders"] = verify_gpu_providers()
    print(json.dumps(rep, indent=2, default=str))
    if "--require-models" in argv and not (rep["models"] and rep["models"]["ok"]):
        return 3
    if "--require-gpu" in argv and not rep["gpuProviders"]["ok"]:
        return 4
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
