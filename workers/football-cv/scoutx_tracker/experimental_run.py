"""Experimental analysis loop. Default off, and not called by extract() or the orchestrator.

One working stream feeds scheduling, propagation, OCR gating and the budget. Propagated boxes
are continuity observations. They are not detections and they are not identity claims.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from scoutx_tracker.ladder import Proposal, review
from scoutx_tracker.preparation import SourceDescriptor, StreamError, open_working_stream
from scoutx_tracker.propagate import BoxPropagator
from scoutx_tracker.recording_assessment import assess
from scoutx_tracker.scheduler import decide

SCENE_MEAN_ABS = 8.0
OVERLAP_IOU = 0.25
OCR_SHARPNESS = 30.0
SCHEMA = "pitchproof.experimental-run.v1"


@dataclass
class RunConfig:
    enabled: bool = False
    mode: str = "direct"
    analysis_fps: float | None = None
    scheduler_enabled: bool = False
    camera_class: str = "touchline"
    ocr_policy: str = "off"
    max_frames: int | None = None
    wall_budget_sec: float | None = None
    calibration_points: int = 0
    profile_preprocess: bool = False
    proposal: Proposal | None = None
    policy: str = "risk"
    target_anchor: tuple[float, float, float, float] | None = None


@dataclass
class RunState:
    cancel: bool = False
    detector_calls: int = 0
    escalations: list[str] = field(default_factory=list)


def _gray(frame: np.ndarray) -> np.ndarray:
    small = cv2.resize(frame, (32, 18), interpolation=cv2.INTER_AREA)
    if small.ndim == 3:
        return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    return small


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    x1, y1 = max(float(a[0]), float(b[0])), max(float(a[1]), float(b[1]))
    x2, y2 = min(float(a[2]), float(b[2])), min(float(a[3]), float(b[3]))
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area = max(0.0, float(a[2] - a[0])) * max(0.0, float(a[3] - a[1]))
    other = max(0.0, float(b[2] - b[0])) * max(0.0, float(b[3] - b[1]))
    union = area + other - inter
    return inter / union if union else 0.0


def _invoke(detector, frame: np.ndarray, imgsz: int | None):
    if imgsz is None:
        return detector(frame)
    if not hasattr(detector, "detect_at"):
        raise RuntimeError(
            "target_dynamic requires detector.detect_at(frame, imgsz); a logged size is not inference"
        )
    return detector.detect_at(frame, int(imgsz))


def identity_state(anchor, boxes: np.ndarray, acquired: bool, signals: set[str]) -> str:
    """Geometric state relative to a supplied anchor. It is not an identity probability."""
    matched = _target_index(boxes, anchor) is not None
    if anchor is None or not matched:
        if acquired and len(boxes) == 0:
            return "lost"
        if acquired:
            return "reacquisition"
        return "discovery"
    if signals & {"target_overlap", "contradictory_jersey", "target_disappeared"}:
        return "at_risk"
    return "tracking"


def _target_index(boxes: np.ndarray, anchor: tuple[float, float, float, float] | None) -> int | None:
    if anchor is None or len(boxes) == 0:
        return None
    overlaps = [_iou(box, np.asarray(anchor, np.float32)) for box in boxes]
    best = int(np.argmax(overlaps))
    return best if overlaps[best] >= OVERLAP_IOU else None


def _signals(previous: np.ndarray | None, frame: np.ndarray, boxes: np.ndarray, has_key: bool,
             anchor: tuple[float, float, float, float] | None = None) -> set[str]:
    signals: set[str] = set()
    current = _gray(frame)
    if previous is not None and float(np.abs(previous.astype(np.int16) - current.astype(np.int16)).mean()) >= SCENE_MEAN_ABS:
        signals.add("scene_change")
    if not has_key:
        signals.add("poor_propagation")
    target = _target_index(boxes, anchor)
    target_hit = False
    other_hit = False
    for index in range(len(boxes)):
        for other in range(index + 1, len(boxes)):
            if _iou(boxes[index], boxes[other]) < OVERLAP_IOU:
                continue
            if target is not None and (index == target or other == target):
                target_hit = True
            else:
                other_hit = True
    if target_hit or other_hit:
        signals.add("similar_kit_crossing")
    if target_hit:
        signals.add("target_overlap")
    elif other_hit:
        signals.add("unrelated_overlap")
    return signals


def _legible(crop: np.ndarray) -> bool:
    if crop.ndim != 3 or crop.shape[0] < 24 or crop.shape[1] < 16:
        return False
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var()) >= OCR_SHARPNESS


def _crop_key(crop: np.ndarray) -> str:
    small = cv2.resize(crop, (16, 16), interpolation=cv2.INTER_AREA)
    return hashlib.sha256(np.ascontiguousarray(small).tobytes()).hexdigest()


def _torso(frame: np.ndarray) -> np.ndarray | None:
    if frame.shape[0] < 24 or frame.shape[1] < 16:
        return None
    return frame[: min(frame.shape[0], 72), : min(frame.shape[1], 48)]


def run_experimental(source: SourceDescriptor, config: RunConfig, *, path: str = "",
                     frames: list[np.ndarray] | None = None, detector=None, reader=None,
                     state: RunState | None = None) -> dict:
    """Run the experimental loop and return a manifest of what actually executed."""
    if config.ocr_policy not in ("off", "every", "gated"):
        raise ValueError("ocr policy must be off, every or gated")
    if config.max_frames is not None and config.max_frames < 0:
        raise ValueError("frame budget cannot be negative")
    state = state or RunState()
    assessment = assess(source, calibration_points=config.calibration_points)
    manifest = {
        "schema": SCHEMA,
        "analysisComplete": False,
        "accuracyValidated": False,
        "identityPublished": False,
        "executed": False,
        "prepEnabled": config.enabled,
        "appliedMode": "direct" if not config.enabled else config.mode,
        "schedulerEnabled": config.scheduler_enabled,
        "ocrPolicy": config.ocr_policy,
        "decodePasses": 0,
        "decodedFrames": 0,
        "workingFrames": 0,
        "discoverySamples": 0,
        "extractionSamples": 0,
        "detectorInvocations": 0,
        "detectorInvocationsAvoided": 0,
        "propagatedFrames": 0,
        "escalations": [],
        "ocrInvocations": 0,
        "ocrCacheHits": 0,
        "ocrIllegibleSkips": 0,
        "ocrEvidence": [],
        "contradictoryReads": [],
        "loneDigits": [],
        "physicalMetres": assessment.physical_metres,
        "offCameraPositions": assessment.off_camera_positions,
        "preprocessSec": None,
        "preprocessKind": None,
        "decodeSec": 0.0,
        "wallSec": 0.0,
        "stopped": "not_started",
        "error": "",
        "policy": config.policy,
        "decisions": [],
        "recoveryPasses": 0,
        "recoveries": [],
        "continuityClaims": 0,
    }
    if config.proposal is not None:
        admission = review(config.proposal)
        manifest["admission"] = admission.reason
        if not admission.admitted:
            manifest["stopped"] = "refused"
            return manifest
    if detector is None:
        raise ValueError("the experimental loop needs a detector callable")
    started = time.perf_counter()
    try:
        stream = open_working_stream(
            source, enabled=config.enabled, mode=config.mode, analysis_fps=config.analysis_fps,
            path=path, frames=frames, end=source.duration_sec,
        )
    except StreamError as exc:
        manifest["stopped"] = "decode_error"
        manifest["error"] = str(exc)
        manifest["wallSec"] = round(time.perf_counter() - started, 6)
        return manifest
    propagator = BoxPropagator()
    has_key = False
    previous = None
    carried = np.zeros((0, 4), np.float32)
    keyed_height = 0.0
    acquired = False
    since_full = 0
    provenance = getattr(detector, "provenance", None)
    if isinstance(provenance, dict):
        manifest["detector"] = dict(provenance)
    cache: dict[str, tuple[str, float]] = {}
    seen_numbers: set[str] = set()
    manifest["decodePasses"] = 1
    manifest["executed"] = stream.executed
    try:
        while True:
            if state.cancel or stream.cancelled:
                manifest["stopped"] = "cancelled"
                break
            if config.wall_budget_sec is not None and time.perf_counter() - started >= config.wall_budget_sec:
                manifest["stopped"] = "budget"
                break
            if config.max_frames is not None and manifest["workingFrames"] >= config.max_frames:
                manifest["stopped"] = "budget"
                break
            try:
                index, presentation, frame = next(stream)
            except StopIteration:
                manifest["stopped"] = "end"
                break
            frame = np.asarray(frame)
            if config.profile_preprocess and manifest["preprocessSec"] is None:
                from scoutx_tracker.yolox_net import letterbox  # noqa: PLC0415

                mark = time.perf_counter()
                letterbox(frame, 640)
                manifest["preprocessSec"] = round(time.perf_counter() - mark, 6)
                manifest["preprocessKind"] = "measured_letterbox_only"
            signals = _signals(previous, frame, carried, has_key, config.target_anchor)
            if has_key and len(carried) == 0:
                signals.add("target_disappeared")
            if len(carried) and keyed_height > 0:
                median_height = float(np.median(carried[:, 3] - carried[:, 1]))
                if abs(median_height - keyed_height) / keyed_height >= 0.4:
                    signals.add("scale_change")
            previous = _gray(frame)
            state_name = identity_state(config.target_anchor, carried, acquired, signals) if config.policy != "risk" else "not_conditioned"
            decision = decide(
                signals, since_full, enabled=config.scheduler_enabled, camera_class=config.camera_class,
                policy=config.policy,
            )
            detected = decision.defer_to_current_pipeline or decision.full_frame_detect
            reason = decision.reason
            used_imgsz = decision.imgsz
            if config.scheduler_enabled and config.policy in ("target", "target_recovery", "target_dynamic"):
                if state_name in ("discovery", "lost", "reacquisition", "at_risk"):
                    detected = True
                    reason = state_name
                    used_imgsz = 1280 if config.policy == "target_dynamic" else used_imgsz
                elif config.policy == "target_dynamic" and state_name == "tracking":
                    detected = True
                    used_imgsz = 1280 if decision.full_frame_detect else 640
                    reason = "tracking_1280" if used_imgsz == 1280 else "tracking_640"
                elif state_name == "tracking" and not detected:
                    reason = "tracking_propagated"
            recovery_done = False
            if detected:
                boxes, scores = _invoke(detector, frame, used_imgsz if config.policy == "target_dynamic" else None)
                boxes = np.asarray(boxes, np.float32).reshape(-1, 4)
                scores = np.asarray(scores, np.float32).reshape(-1)
                if len(scores) != len(boxes):
                    raise ValueError("the detector returned a different number of scores and boxes")
                propagator.key(frame, boxes, scores if len(scores) else np.zeros(0, np.float32))
                has_key = True
                carried = boxes
                if _target_index(boxes, config.target_anchor) is not None:
                    acquired = True
                if len(boxes):
                    keyed_height = float(np.median(boxes[:, 3] - boxes[:, 1]))
                since_full = 0
                state.detector_calls += 1
                manifest["detectorInvocations"] += 1
                if reason not in ("scheduler_off", "continuity_holds"):
                    manifest["escalations"].append({"frame": index, "time": presentation, "reason": reason})
                target_box = None
                matched = _target_index(boxes, config.target_anchor)
                if matched is not None:
                    target_box = boxes[matched]
                if config.policy == "target_recovery" and state_name == "at_risk":
                    if target_box is None or not hasattr(detector, "recover"):
                        recovery_done = False
                    else:
                        returned = detector.recover(
                            frame, target_box, frame_id=str(index), presentation_sec=float(presentation),
                            reason=state_name,
                        )
                        evidence = returned[2] if isinstance(returned, tuple) and len(returned) >= 3 and isinstance(returned[2], dict) else None
                        if evidence is not None:
                            manifest["recoveries"].append(json.loads(json.dumps(evidence)))
                        recovery_done = True
                        manifest["recoveryPasses"] += 1
            else:
                carried = np.asarray(propagator.step(frame)[0], np.float32).reshape(-1, 4)
                since_full += 1
                manifest["detectorInvocationsAvoided"] += 1
                manifest["propagatedFrames"] += 1
            manifest["decisions"].append({
                "frame": index, "time": presentation, "signals": sorted(signals),
                "detected": detected, "reason": reason, "state": state_name, "imgsz": used_imgsz,
                "highRes": decision.high_res_recovery, "recoveryExecuted": recovery_done,
                "continuityClaim": False, "publishedPosition": False,
            })
            manifest["workingFrames"] += 1
            manifest["extractionSamples"] += 1
            if index % 5 == 0:
                manifest["discoverySamples"] += 1
            crop = _torso(frame) if detected else None
            if crop is not None and config.ocr_policy != "off":
                key = _crop_key(crop)
                if config.ocr_policy == "gated" and not _legible(crop):
                    manifest["ocrIllegibleSkips"] += 1
                elif config.ocr_policy == "gated" and key in cache:
                    manifest["ocrCacheHits"] += 1
                    _record_read(manifest, presentation, cache[key][0], cache[key][1], seen_numbers, cached=True)
                else:
                    if reader is None:
                        raise ValueError("an OCR policy other than off needs a reader")
                    text, confidence = reader(crop)
                    manifest["ocrInvocations"] += 1
                    cache[key] = (str(text or ""), float(confidence))
                    _record_read(manifest, presentation, cache[key][0], cache[key][1], seen_numbers, cached=False)
    finally:
        stream.close()
        manifest["decodedFrames"] = stream.frames_yielded
        manifest["decodeSec"] = round(stream.decode_sec, 6)
        manifest["wallSec"] = round(time.perf_counter() - started, 6)
    manifest["analysisComplete"] = manifest["stopped"] == "end" and manifest["workingFrames"] > 0 and not manifest["error"]
    return manifest


def _record_read(manifest: dict, presentation: float, text: str, confidence: float,
                 seen_numbers: set[str], *, cached: bool) -> None:
    full = len(text) == 2 and text.isdigit() and text[0] != "0"
    lone = len(text) == 1 and text.isdigit()
    row = {"time": presentation, "text": text, "confidence": confidence, "fullNumber": full,
           "loneDigit": lone, "cached": cached, "identityClaim": False}
    manifest["ocrEvidence"].append(row)
    if lone:
        manifest["loneDigits"].append(row)
    if full:
        if seen_numbers and text not in seen_numbers:
            manifest["contradictoryReads"].append(row)
        seen_numbers.add(text)


class BackendUnavailable(RuntimeError):
    """The requested inference backend cannot run. No other backend is substituted."""


SMALL_PLAYER_PX = 48


def match_boxes(reference: np.ndarray, candidate: np.ndarray, iou_min: float = 0.5) -> dict:
    """Greedy IoU match. Unmatched boxes stay unmatched; nothing is invented for them."""
    reference = np.asarray(reference, np.float32).reshape(-1, 4)
    candidate = np.asarray(candidate, np.float32).reshape(-1, 4)
    used = set()
    pairs = []
    for index, box in enumerate(reference):
        best, best_iou = None, iou_min
        for other, candidate_box in enumerate(candidate):
            if other in used:
                continue
            overlap = _iou(box, candidate_box)
            if overlap >= best_iou:
                best, best_iou = other, overlap
        if best is not None:
            used.add(best)
            pairs.append({"reference": index, "candidate": best, "iou": round(best_iou, 4)})
    return {
        "matched": len(pairs),
        "referenceOnly": len(reference) - len(pairs),
        "candidateOnly": len(candidate) - len(used),
        "meanIou": round(float(np.mean([pair["iou"] for pair in pairs])), 4) if pairs else None,
        "pairs": pairs,
    }


class YoloxSession:
    """One explicit YOLOX backend. A missing runtime or a requested GPU is an error."""

    def __init__(self, backend: str, *, variant: str = "yolox_s", imgsz: int = 1280,
                 provider: str = "CPUExecutionProvider", precision: str = "fp32", threads: int | None = None) -> None:
        self.recovery_log: list[dict] = []
        if precision != "fp32":
            raise BackendUnavailable(
                "only FP32 is executed; the earlier GPU FP16 run failed accuracy validation and is not repeated")
        if provider not in ("CPUExecutionProvider", "CUDAExecutionProvider", "TensorrtExecutionProvider"):
            raise BackendUnavailable(f"unknown execution provider {provider}")
        if backend in ("cuda", "tensorrt"):
            raise BackendUnavailable(f"{backend} was requested; refusing to run that configuration on CPU")
        if backend == "onnx":
            self._load_onnx(variant, imgsz, provider, threads)
            return
        if backend != "torch":
            raise BackendUnavailable(f"unknown backend {backend}")
        if provider != "CPUExecutionProvider":
            import torch  # noqa: PLC0415

            if not torch.cuda.is_available():
                raise BackendUnavailable("PyTorch CUDA was requested and CUDA is not available; refusing to run on CPU")
            raise BackendUnavailable("PyTorch GPU execution is not wired; refusing to run the CPU module")
        import hashlib  # noqa: PLC0415

        import torch  # noqa: PLC0415

        from scoutx_tracker.extract import WEIGHTS_SHA256  # noqa: PLC0415
        from scoutx_tracker.yolox_net import Detector as TorchDetector  # noqa: PLC0415

        root = Path(os.environ.get("SCOUTX_WEIGHTS_DIR", str(Path.home() / ".cache" / "scoutx" / "weights")))
        weights = root / f"{variant}.pth"
        if not weights.is_file():
            raise BackendUnavailable(f"weights missing at {weights}")
        digest = hashlib.sha256(weights.read_bytes()).hexdigest()
        expected = WEIGHTS_SHA256.get(variant)
        if expected and digest != expected:
            raise BackendUnavailable(f"weights hash mismatch for {variant}")
        if threads is not None:
            torch.set_num_threads(threads)
        started = time.perf_counter()
        self._impl = TorchDetector(variant, weights, imgsz, device="cpu", half=False)
        self.load_sec = time.perf_counter() - started
        self.last: dict = {}
        self.provenance = {
            "backend": "torch",
            "provider": "CPUExecutionProvider",
            "requestedProviderRan": True,
            "device": "cpu",
            "precision": "fp32",
            "variant": variant,
            "imgsz": imgsz,
            "weightsSha256": digest,
            "torch": torch.__version__,
            "threads": torch.get_num_threads(),
            "batch": 1,
            "nms": {"conf": 0.05, "iou": 0.6, "classes": [0, 32]},
            "loadSec": round(self.load_sec, 4),
            "fallback": None,
        }

    def _load_onnx(self, variant: str, imgsz: int, provider: str, threads: int | None) -> None:
        try:
            import onnxruntime as ort  # noqa: PLC0415
        except ImportError as exc:
            raise BackendUnavailable("onnxruntime is not installed; refusing to substitute PyTorch") from exc
        available = ort.get_available_providers()
        if provider not in available:
            raise BackendUnavailable(f"{provider} is not available ({available}); refusing to fall back")
        import hashlib  # noqa: PLC0415

        from scoutx_tracker.extract import WEIGHTS_SHA256  # noqa: PLC0415
        from scoutx_tracker.yolox_net import OnnxDetector  # noqa: PLC0415

        root = Path(os.environ.get("SCOUTX_WEIGHTS_DIR", str(Path.home() / ".cache" / "scoutx" / "weights")))
        weights = root / f"{variant}.pth"
        if not weights.is_file():
            raise BackendUnavailable(f"weights missing at {weights}")
        digest = hashlib.sha256(weights.read_bytes()).hexdigest()
        expected = WEIGHTS_SHA256.get(variant)
        if expected and digest != expected:
            raise BackendUnavailable(f"weights hash mismatch for {variant}")
        previous = os.environ.get("SCOUTX_ORT_PROVIDERS")
        os.environ["SCOUTX_ORT_PROVIDERS"] = provider
        started = time.perf_counter()
        try:
            self._impl = OnnxDetector(variant, weights, imgsz, threads or 0)
        finally:
            if previous is None:
                os.environ.pop("SCOUTX_ORT_PROVIDERS", None)
            else:
                os.environ["SCOUTX_ORT_PROVIDERS"] = previous
        if self._impl.providers[0] != provider:
            self._impl.close()
            raise BackendUnavailable(f"session started on {self._impl.providers[0]} after {provider} was requested")
        self.load_sec = time.perf_counter() - started
        self.last = {}
        self.provenance = {
            "backend": "onnx", "provider": self._impl.providers[0], "requestedProviderRan": True,
            "device": "gpu" if self._impl.on_gpu else "cpu", "precision": "fp32", "variant": variant,
            "imgsz": imgsz, "weightsSha256": digest, "onnxruntime": ort.__version__,
            "threads": threads, "batch": 1, "nms": {"conf": 0.05, "iou": 0.6, "classes": [0, 32]},
            "loadSec": round(self.load_sec, 4), "fallback": None,
        }

    def close(self) -> None:
        self._impl.close()

    def release_job(self) -> None:
        """Drop job-specific outputs. The loaded network stays."""
        self.recovery_log.clear()
        self.last = {}

    def __call__(self, frame: np.ndarray):
        persons, scores, _balls, _ball_scores = self.forward(frame)
        return persons, scores

    def detect_at(self, frame: np.ndarray, imgsz: int):
        """Runs the already loaded network at one of 640, 960 or 1280. It does not reload weights."""
        size = int(imgsz)
        if size not in (640, 960, 1280):
            raise ValueError("experimental detector sizes are 640, 960 and 1280")
        if size == int(self._impl.imgsz):
            persons, scores, _balls, _ball_scores = self.forward(frame)
            self.last["imgsz"] = size
            return persons, scores
        import torch

        from scoutx_tracker.yolox_net import letterbox, postprocess

        started = time.perf_counter()
        cpu = time.process_time()
        canvas, ratio = letterbox(np.asarray(frame), size)
        tensor = torch.from_numpy(np.ascontiguousarray(canvas.transpose(2, 0, 1)[None])).float()
        with torch.inference_mode():
            raw = self._impl.model(tensor).float()
        xyxy, score, classes = postprocess(raw[0], ratio)
        persons = classes == 0
        elapsed = time.perf_counter() - started
        self.last = {
            "forwardSec": round(elapsed, 4),
            "processSec": round(time.process_time() - cpu, 4),
            "personCount": int(persons.sum()),
            "ballCount": int((classes == 32).sum()),
            "smallPlayers": int(((xyxy[persons, 3] - xyxy[persons, 1]) < SMALL_PLAYER_PX).sum()) if persons.any() else 0,
            "imgsz": size,
            "inputShape": [int(value) for value in tensor.shape],
        }
        return xyxy[persons], score[persons]

    def recover(self, frame: np.ndarray, box: np.ndarray, *, frame_id: str = "",
                presentation_sec: float | None = None, reason: str = ""):
        """Second forward on a crop with one box of context. The evidence record is appended and not reused."""
        frame = np.asarray(frame)
        height, width = frame.shape[:2]
        x1, y1, x2, y2 = (float(value) for value in box)
        span_x = max(1.0, x2 - x1)
        span_y = max(1.0, y2 - y1)
        left = max(0, int(np.floor(x1 - span_x)))
        top = max(0, int(np.floor(y1 - span_y)))
        right = min(width, int(np.ceil(x2 + span_x)))
        bottom = min(height, int(np.ceil(y2 + span_y)))
        started = time.perf_counter()
        if right - left < 32 or bottom - top < 32:
            persons = np.zeros((0, 4), np.float32)
            scores = np.zeros(0, np.float32)
            input_shape: list[int] = []
        else:
            persons, scores = self.detect_at(frame[top:bottom, left:right], 1280)
            if len(persons):
                persons = np.asarray(persons, np.float32).copy()
                persons[:, [0, 2]] += left
                persons[:, [1, 3]] += top
            input_shape = [int(value) for value in self.last.get("inputShape", [])]
        evidence = {
            "frameId": str(frame_id),
            "presentationSec": None if presentation_sec is None else round(float(presentation_sec), 3),
            "frameWidth": int(width),
            "frameHeight": int(height),
            "crop": [left, top, right, bottom],
            "padding": [round(span_x, 3), round(span_y, 3)],
            "inputShape": input_shape,
            "reason": str(reason),
            "candidate": [round(float(value), 3) for value in box],
            "detections": [[round(float(value), 3) for value in row] for row in np.asarray(persons).reshape(-1, 4)],
            "origin": [left, top],
            "model": dict(getattr(self, "provenance", {}) or {}),
            "runtimeSec": round(time.perf_counter() - started, 4),
        }
        frozen = json.loads(json.dumps(evidence))
        self.recovery_log.append(frozen)
        self.last["recovery"] = frozen
        return persons, scores, frozen

    def forward(self, frame: np.ndarray):
        started = time.perf_counter()
        cpu = time.process_time()
        xyxy, score, classes = self._impl([frame])[0]
        elapsed = time.perf_counter() - started
        from scoutx_tracker.yolox_net import letterbox

        canvas, _ratio = letterbox(np.asarray(frame), int(self._impl.imgsz))
        persons = classes == 0
        balls = classes == 32
        self.last = {
            "forwardSec": round(elapsed, 4),
            "processSec": round(time.process_time() - cpu, 4),
            "personCount": int(persons.sum()),
            "ballCount": int(balls.sum()),
            "smallPlayers": int(((xyxy[persons, 3] - xyxy[persons, 1]) < SMALL_PLAYER_PX).sum()) if persons.any() else 0,
        }
        self.last["imgsz"] = int(self._impl.imgsz)
        self.last["inputShape"] = [1, 3, int(canvas.shape[0]), int(canvas.shape[1])]
        return xyxy[persons], score[persons], xyxy[balls], score[balls]


class ReusableSession:
    """One loaded model, with job buffers that are cleared before the next job starts."""

    def __init__(self, model) -> None:
        self.model = model
        self.loads = 1
        self._frames: list[str] = []
        self._job: str | None = None

    def open_job(self, job_id: str) -> None:
        if self._job is not None:
            raise RuntimeError("close the open job before starting another")
        self._frames.clear()
        self._job = job_id

    def observe(self, frame_id: str) -> None:
        if self._job is None:
            raise RuntimeError("no open job")
        self._frames.append(frame_id)

    def close_job(self) -> dict:
        if self._job is None:
            raise RuntimeError("no open job")
        snapshot = {"job": self._job, "frames": list(self._frames)}
        self._frames.clear()
        self._job = None
        return snapshot
