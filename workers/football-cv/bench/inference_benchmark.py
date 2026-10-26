"""Reproducible inference benchmark for the tracking worker (CPU or GPU - it measures what it runs on).

    python bench/inference_benchmark.py --video match.mp4 --weights-dir weights/ --out bench.json \
        [--variants yolox_tiny yolox_s] [--imgsz 1280] [--batch 1 4 8] [--frames 200] [--price-per-hour 1.05]

Measures, per detector backend and batch size:
  * detection latency per frame (median / p90) and throughput (frames/s), model init time
  * decode throughput (OpenCV; NVDEC via ffmpeg when `--nvdec` and a GPU are available)
  * GPU utilisation (sampled with NVML/nvidia-smi) and peak GPU memory; process peak RSS
Backends: torch fp32, torch fp16 (CUDA only), ONNX Runtime (CPU EP / CUDA EP / TensorRT EP - whichever
the installed onnxruntime provides). Every number in the JSON is labelled with the device it was
measured on; nothing is extrapolated except the clearly separated `projection` block, which scales
measured per-frame time to 34/90/140-minute matches at the pipeline's 10 fps sampling.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import resource
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import cv2
import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scoutx_tracker.yolox_net import Detector, letterbox, load, postprocess  # noqa: E402

SAMPLE_FPS = 10.0


def gpu_name() -> str | None:
    return torch.cuda.get_device_name(0) if torch.cuda.is_available() else None


class GpuSampler:
    """Samples GPU utilisation every 100 ms via nvidia-smi while active."""

    def __init__(self) -> None:
        self.samples: list[float] = []
        self._stop = threading.Event()
        self._t: threading.Thread | None = None
        self.available = torch.cuda.is_available() and shutil.which("nvidia-smi") is not None

    def __enter__(self):
        if self.available:
            self._t = threading.Thread(target=self._run, daemon=True)
            self._t.start()
        return self

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                out = subprocess.run(["nvidia-smi", "--query-gpu=utilization.gpu", "--format=csv,noheader,nounits"],
                                     capture_output=True, text=True, timeout=2).stdout.strip().splitlines()
                if out:
                    self.samples.append(float(out[0]))
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(0.1)

    def __exit__(self, *exc):
        self._stop.set()
        if self._t:
            self._t.join(timeout=2)

    def summary(self) -> dict | None:
        if not self.samples:
            return None
        return {"meanPct": round(float(np.mean(self.samples)), 1), "p90Pct": round(float(np.percentile(self.samples, 90)), 1)}


def read_frames(video: str, n: int) -> tuple[list[np.ndarray], dict]:
    cap = cv2.VideoCapture(video)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(fps / SAMPLE_FPS)))
    frames, t0 = [], time.perf_counter()
    start = max(0, total // 3)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    f = start
    while len(frames) < n:
        ok = cap.grab()
        if not ok:
            break
        if (f - start) % step == 0:
            ok, im = cap.retrieve()
            if ok:
                frames.append(im)
        f += 1
    dt = time.perf_counter() - t0
    return frames, {"backend": "opencv", "sampledFrames": len(frames), "decodedFrames": f - start,
                    "seconds": round(dt, 2), "sampledFramesPerSec": round(len(frames) / max(dt, 1e-9), 1)}


def nvdec_decode(video: str, seconds: float = 60.0) -> dict | None:
    """Hardware decode throughput via ffmpeg -hwaccel cuda (if available)."""
    if not (torch.cuda.is_available() and shutil.which("ffmpeg")):
        return None
    t0 = time.perf_counter()
    r = subprocess.run(["ffmpeg", "-v", "error", "-hwaccel", "cuda", "-ss", "600", "-t", str(seconds), "-i", video,
                        "-vf", f"fps={SAMPLE_FPS}", "-f", "null", "-"], capture_output=True, text=True)
    dt = time.perf_counter() - t0
    return {"backend": "ffmpeg-nvdec", "ok": r.returncode == 0, "videoSeconds": seconds,
            "realtimeFactor": round(seconds / max(dt, 1e-9), 2)}


def bench_torch(det: Detector, frames: list[np.ndarray], batch: int) -> dict:
    lat = []
    det(frames[:batch])  # warm-up
    if det.device == "cuda":
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
    with GpuSampler() as gs:
        t0 = time.perf_counter()
        for i in range(0, len(frames) - batch + 1, batch):
            t = time.perf_counter()
            det(frames[i:i + batch])
            if det.device == "cuda":
                torch.cuda.synchronize()
            lat.append((time.perf_counter() - t) / batch)
        wall = time.perf_counter() - t0
    n = len(lat) * batch
    return {"framesPerSec": round(n / wall, 2), "msPerFrame": {"median": round(1000 * float(np.median(lat)), 1),
            "p90": round(1000 * float(np.percentile(lat, 90)), 1)},
            "gpuUtil": gs.summary(),
            "gpuPeakMemMiB": round(torch.cuda.max_memory_allocated() / 2**20) if det.device == "cuda" else None}


def export_onnx(variant: str, weights: Path, imgsz: int, out: Path) -> Path:
    model = load(variant, weights, "cpu")
    h = (int(round(1080 * imgsz / 1920)) + 31) // 32 * 32
    dummy = torch.zeros(1, 3, h, imgsz)
    torch.onnx.export(model, dummy, str(out), input_names=["images"], output_names=["out"], opset_version=17,
                      dynamic_axes={"images": {0: "batch"}, "out": {0: "batch"}}, dynamo=False)
    return out


def bench_onnx(path: Path, frames: list[np.ndarray], imgsz: int, batch: int, providers: list[str]) -> dict:
    import onnxruntime as ort  # noqa: PLC0415

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    t = time.perf_counter()
    sess = ort.InferenceSession(str(path), so, providers=providers)
    init = time.perf_counter() - t
    used = sess.get_providers()

    def run(chunk):
        boxes, rs = zip(*(letterbox(im, imgsz) for im in chunk))
        x = np.ascontiguousarray(np.stack(boxes).transpose(0, 3, 1, 2)).astype(np.float32)
        out = sess.run(None, {"images": x})[0]
        return [postprocess(torch.from_numpy(out[i]), rs[i]) for i in range(len(chunk))]

    run(frames[:batch])
    lat = []
    with GpuSampler() as gs:
        t0 = time.perf_counter()
        for i in range(0, len(frames) - batch + 1, batch):
            t = time.perf_counter()
            run(frames[i:i + batch])
            lat.append((time.perf_counter() - t) / batch)
        wall = time.perf_counter() - t0
    n = len(lat) * batch
    return {"providers": used, "initSec": round(init, 2), "framesPerSec": round(n / wall, 2),
            "msPerFrame": {"median": round(1000 * float(np.median(lat)), 1), "p90": round(1000 * float(np.percentile(lat, 90)), 1)},
            "gpuUtil": gs.summary()}


def projection(ms_per_frame: float, price_per_hour: float | None) -> dict:
    out = {}
    for minutes in (34, 90, 140):
        frames = minutes * 60 * SAMPLE_FPS
        sec = frames * ms_per_frame / 1000
        out[f"{minutes}min"] = {"detectSeconds": round(sec), "detectMinutes": round(sec / 60, 1),
                                **({"detectCostUsd": round(sec / 3600 * price_per_hour, 3)} if price_per_hour else {})}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--weights-dir", required=True)
    ap.add_argument("--variants", nargs="+", default=["yolox_tiny", "yolox_s"])
    ap.add_argument("--imgsz", type=int, default=1280)
    ap.add_argument("--batch", nargs="+", type=int, default=[1])
    ap.add_argument("--frames", type=int, default=100)
    ap.add_argument("--threads", type=int, default=0, help="torch CPU threads (0 = default)")
    ap.add_argument("--onnx", action="store_true")
    ap.add_argument("--nvdec", action="store_true")
    ap.add_argument("--price-per-hour", type=float, default=None, help="instance $/h for the cost projection")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.threads:
        torch.set_num_threads(a.threads)
    frames, decode = read_frames(a.video, a.frames)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    report = {
        "measuredOn": {"device": device, "gpu": gpu_name(), "cpu": platform.processor() or platform.machine(),
                       "cpuCount": os.cpu_count(), "torchThreads": torch.get_num_threads(), "torch": torch.__version__},
        "frames": len(frames), "imgsz": a.imgsz, "decode": decode, "nvdec": nvdec_decode(a.video) if a.nvdec else None,
        "results": [],
    }
    for variant in a.variants:
        w = Path(a.weights_dir) / f"{variant}.pth"
        for half in ([False, True] if device == "cuda" else [False]):
            t = time.perf_counter()
            det = Detector(variant, w, a.imgsz, device=device, half=half)
            init = time.perf_counter() - t
            for b in a.batch:
                r = bench_torch(det, frames, b)
                row = {"variant": variant, "backend": f"torch-{'fp16' if half else 'fp32'}", "device": device, "batch": b,
                       "initSec": round(init, 2), **r, "projection": projection(r["msPerFrame"]["median"], a.price_per_hour)}
                report["results"].append(row)
                print(json.dumps(row), flush=True)
        if a.onnx:
            import onnxruntime as ort  # noqa: PLC0415

            path = Path(a.out).with_suffix(f".{variant}.onnx")
            export_onnx(variant, w, a.imgsz, path)
            avail = ort.get_available_providers()
            for prov in (["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"],
                         ["CUDAExecutionProvider", "CPUExecutionProvider"], ["CPUExecutionProvider"]):
                if prov[0] not in avail:
                    continue
                for b in a.batch:
                    r = bench_onnx(path, frames, a.imgsz, b, prov)
                    row = {"variant": variant, "backend": f"onnxruntime-{prov[0].replace('ExecutionProvider', '')}",
                           "device": device, "batch": b, **r, "projection": projection(r["msPerFrame"]["median"], a.price_per_hour)}
                    report["results"].append(row)
                    print(json.dumps(row), flush=True)
    report["processPeakRssMiB"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
    Path(a.out).write_text(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
