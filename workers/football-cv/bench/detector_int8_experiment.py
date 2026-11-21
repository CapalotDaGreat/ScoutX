"""Detector INT8 experiment (2026-11-21). OFFLINE MEASUREMENT ONLY - nothing in the engine changes.

Quantises the pinned YOLOX-s @1280 ONNX export to static INT8 (QDQ, per-channel weights) with ONNX Runtime and compares
it with the FP32 export on real proxy frames: latency and box agreement (persons at the stage-1 thresholds, ball).

    python bench/detector_int8_experiment.py \
        --onnx ~/.cache/scoutx/weights/yolox_s.1280.onnx \
        --calib CLIP_A.mp4 CLIP_B.mp4 --eval CLIP_C.mp4 CLIP_D.mp4 \
        --out-model /tmp/yolox_s.1280.int8.onnx --out-json results.json

Calibration and evaluation clips must be different recordings windows (the run refuses overlap by path).
Variants (`--variant`):
  body  - quantise backbone, neck and the head conv towers; keep the 9 prediction convs and the decode tail in FP32
          (recommended; quantising the decode tail puts box coordinates and scores on one uint8 scale and returns
          no boxes at all)
  convs - quantise only Conv nodes outside the prediction convs (correct boxes, but little speed-up)

To run stage 1 with the result, copy the .pth next to the INT8 file renamed to `yolox_s.1280.onnx` and point
SCOUTX_WEIGHTS_DIR at that directory. The engine reports it as `yolox_s@1280/onnx-int8`. Judge it only with
bench/gates/balanced_5.2.json against the CPU FP32 run (bench/compare_runs.py); box agreement here is not a gate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scoutx_tracker.yolox_net import letterbox, postprocess  # noqa: E402

PERSON, BALL = 0, 32


def frames(path: str, n: int) -> np.ndarray:
    cap = cv2.VideoCapture(path)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    want = set(np.linspace(0, total - 1, n).astype(int).tolist())
    out, i = [], 0
    while True:
        ok, f = cap.read()
        if not ok:
            break
        if i in want:
            out.append(f)
        i += 1
    return np.stack(out)


def prep(im: np.ndarray):
    b, r = letterbox(im, 1280)
    return np.ascontiguousarray(b.transpose(2, 0, 1)[None]).astype(np.float32), r


def session(path: str):
    import onnxruntime as ort  # noqa: PLC0415

    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.enable_cpu_mem_arena = False
    return ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])


def detect(sess, fr: np.ndarray):
    import torch  # noqa: PLC0415

    outs, ts = [], []
    for f in fr:
        x, r = prep(f)
        t = time.perf_counter()
        o = sess.run(None, {"images": x})[0]
        ts.append(time.perf_counter() - t)
        b, s, c = postprocess(torch.from_numpy(o[0]), r, conf=0.05)
        outs.append((np.asarray(b), np.asarray(s), np.asarray(c)))
    return outs, ts


def iou(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area = lambda z: (z[:, 2] - z[:, 0]) * (z[:, 3] - z[:, 1])  # noqa: E731
    return inter / (area(a)[:, None] + area(b)[None, :] - inter + 1e-9)


def agreement(ref, got, cls: int, thr: float, min_h: float = 0.0) -> dict:
    total = hit = extra = 0
    ious, sdiff = [], []
    for (rb, rs, rc), (gb, gs, gc) in zip(ref, got):
        m1 = (rc == cls) & (rs >= thr)
        m2 = (gc == cls) & (gs >= thr)
        A, As, B, Bs = rb[m1], rs[m1], gb[m2], gs[m2]
        keep = (A[:, 3] - A[:, 1]) >= min_h
        total += int(keep.sum())
        if len(A) and len(B):
            M = iou(A, B)
            best, j = M.max(1), M.argmax(1)
            ok = (best >= 0.5) & keep
            hit += int(ok.sum())
            ious += best[ok].tolist()
            sdiff += np.abs(As[ok] - Bs[j[ok]]).tolist()
            extra += int((M.max(0) < 0.5).sum())
        else:
            extra += len(B)
    r4 = lambda v: round(float(v), 4)  # noqa: E731
    return {"fp32Boxes": total, "matched": hit, "recallVsFp32": r4(hit / max(total, 1)), "int8OnlyBoxes": extra,
            "meanIoU": r4(np.mean(ious)) if ious else None, "p5IoU": r4(np.percentile(ious, 5)) if ious else None,
            "meanAbsScoreDiff": r4(np.mean(sdiff)) if sdiff else None}


def sha256(p: str) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--onnx", required=True)
    ap.add_argument("--calib", nargs="+", required=True)
    ap.add_argument("--eval", nargs="+", required=True)
    ap.add_argument("--variant", choices=("body", "convs"), default="body")
    ap.add_argument("--calib-frames", type=int, default=20, help="frames per calibration clip")
    ap.add_argument("--eval-frames", type=int, default=60, help="frames per evaluation clip")
    ap.add_argument("--out-model", required=True)
    ap.add_argument("--out-json", required=True)
    a = ap.parse_args()
    if set(map(str, map(Path.resolve, map(Path, a.calib)))) & set(map(str, map(Path.resolve, map(Path, a.eval)))):
        print("refused: calibration and evaluation clips overlap")
        return 2

    import onnx  # noqa: PLC0415
    from onnxruntime.quantization import CalibrationDataReader, QuantFormat, QuantType, quantize_static  # noqa: PLC0415
    from onnxruntime.quantization.shape_inference import quant_pre_process  # noqa: PLC0415

    nodes = onnx.load(a.onnx).graph.node
    preds = [n.name for n in nodes if n.op_type == "Conv" and "preds" in n.name]
    tail = [n.name for n in nodes if n.name.startswith("/head/")
            and not n.name.startswith(("/head/stems", "/head/cls_convs", "/head/reg_convs"))]
    calib = np.concatenate([frames(c, a.calib_frames) for c in a.calib])

    class Reader(CalibrationDataReader):
        def __init__(self) -> None:
            self.it = iter([{"images": prep(f)[0]} for f in calib])

        def get_next(self):
            return next(self.it, None)

    pre = str(Path(a.out_model).with_suffix(".pre.onnx"))
    quant_pre_process(a.onnx, pre, skip_symbolic_shape=True)
    quantize_static(pre, a.out_model, Reader(), quant_format=QuantFormat.QDQ, per_channel=True,
                    activation_type=QuantType.QUInt8, weight_type=QuantType.QInt8,
                    op_types_to_quantize=["Conv"] if a.variant == "convs" else None,
                    nodes_to_exclude=preds if a.variant == "convs" else tail,
                    extra_options={"CalibMovingAverage": True})
    Path(pre).unlink(missing_ok=True)

    s32, s8 = session(a.onnx), session(a.out_model)
    res = {"variant": a.variant, "fp32Sha256": sha256(a.onnx), "int8Sha256": sha256(a.out_model),
           "calibration": {"clips": [Path(c).name for c in a.calib], "framesPerClip": a.calib_frames},
           "clips": {}}
    for clip in a.eval:
        fr = frames(clip, a.eval_frames)
        detect(s32, fr[:3])
        detect(s8, fr[:3])
        r32, t32 = detect(s32, fr)
        r8, t8 = detect(s8, fr)
        res["clips"][Path(clip).name] = {
            "frames": len(fr),
            "fp32MsPerFrameMedian": round(1000 * float(np.median(t32)), 1),
            "int8MsPerFrameMedian": round(1000 * float(np.median(t8)), 1),
            "person@0.12": agreement(r32, r8, PERSON, 0.12),
            "person@0.12,h>=80px": agreement(r32, r8, PERSON, 0.12, 80),
            "person@0.4,h>=80px (OCR crops)": agreement(r32, r8, PERSON, 0.4, 80),
            "ball@0.05": agreement(r32, r8, BALL, 0.05),
        }
    Path(a.out_json).write_text(json.dumps(res, indent=1) + "\n")
    print(json.dumps(res, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
