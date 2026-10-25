"""Real model backends. Heavy libraries are imported lazily so the contract, identity logic and
tests run without a GPU or model weights.

Licences (verify again before any production use):
  - PyAV (BSD-3-Clause) for streaming decode; nothing is written to disk.
  - RT-DETR via Hugging Face transformers (Apache-2.0); default weights
    PekingU/rtdetr_r50vd_coco_o365 (Apache-2.0).
  - supervision ByteTrack (MIT).
  - EasyOCR (Apache-2.0) for jersey digits on the torso crop. No face model is loaded.
"""

from __future__ import annotations

import os
from typing import Iterator

import numpy as np

from .pipeline import Box, Components, IDENTITY_DETECTION_THRESHOLD, TRACKING_DETECTION_THRESHOLD
from .identity import valid_read
from .source_pts import sample_recording_frames, validate_recording_interval

DETECTOR_MODEL = os.environ.get("CV_DETECTOR_MODEL", "PekingU/rtdetr_r50vd_coco_o365")
PERSON_LABELS = {"person"}


class PyAvFrameSource:
    def frames(self, url: str, headers: str | None, start_sec: float, end_sec: float, fps: float) -> Iterator[tuple[float, np.ndarray]]:
        import av  # noqa: PLC0415

        validate_recording_interval(start_sec, end_sec, fps)
        options = {"rw_timeout": "30000000", "protocol_whitelist": "http,https,tcp,tls"}
        if headers:
            options["headers"] = headers
        with av.open(url, options=options, timeout=60) as container:
            stream = container.streams.video[0]
            yield from sample_recording_frames(container, stream, start_sec, end_sec, fps)


class RtDetrDetector:
    def __init__(self, *, local_only: bool = False, cpu: bool = False) -> None:
        import torch  # noqa: PLC0415
        from transformers import AutoImageProcessor, RTDetrForObjectDetection  # noqa: PLC0415

        self._torch = torch
        self._device = "cuda" if not cpu and torch.cuda.is_available() else "cpu"
        self._processor = AutoImageProcessor.from_pretrained(DETECTOR_MODEL, local_files_only=local_only)
        self._model = RTDetrForObjectDetection.from_pretrained(DETECTOR_MODEL, local_files_only=local_only).to(self._device).eval()

    def people(self, frame: np.ndarray) -> list[Box]:
        inputs = self._processor(images=frame, return_tensors="pt").to(self._device)
        with self._torch.no_grad():
            outputs = self._model(**inputs)
        results = self._processor.post_process_object_detection(
            outputs, target_sizes=[frame.shape[:2]], threshold=TRACKING_DETECTION_THRESHOLD
        )[0]
        labels = self._model.config.id2label
        boxes = []
        for score, label, box in zip(results["scores"], results["labels"], results["boxes"]):
            if labels[int(label)] in PERSON_LABELS:
                x1, y1, x2, y2 = (float(v) for v in box.tolist())
                boxes.append(Box(x1, y1, x2, y2, float(score)))
        return boxes


class ByteTrackTracker:
    def __init__(self, fps: float = 2.0) -> None:
        import supervision as sv  # noqa: PLC0415

        self._sv = sv
        self._tracker = sv.ByteTrack(track_activation_threshold=IDENTITY_DETECTION_THRESHOLD,
                                     frame_rate=max(1, int(round(fps))))

    def update(self, boxes: list[Box]) -> list[tuple[str, Box]]:
        if not boxes:
            self._tracker.update_with_detections(self._sv.Detections.empty())
            return []
        detections = self._sv.Detections(
            xyxy=np.array([[b.x1, b.y1, b.x2, b.y2] for b in boxes], dtype=float),
            confidence=np.array([b.score for b in boxes], dtype=float),
            class_id=np.zeros(len(boxes), dtype=int),
        )
        tracked = self._tracker.update_with_detections(detections)
        out = []
        for xyxy, confidence, tracker_id in zip(tracked.xyxy, tracked.confidence, tracked.tracker_id):
            x1, y1, x2, y2 = (float(v) for v in xyxy)
            out.append((f"t{int(tracker_id)}", Box(x1, y1, x2, y2, float(confidence))))
        return out


class EasyOcrJerseyReader:
    def __init__(self, *, local_only: bool = False, cpu: bool = False) -> None:
        import easyocr  # noqa: PLC0415
        import torch  # noqa: PLC0415

        self._reader = easyocr.Reader(["en"], gpu=not cpu and torch.cuda.is_available(),
                                      download_enabled=not local_only, verbose=False)

    def read(self, back_crop: np.ndarray) -> tuple[str | None, float]:
        if back_crop.shape[0] < 24 or back_crop.shape[1] < 16:
            return None, 0.0
        best: tuple[str | None, float] = (None, 0.0)
        readings = set()
        for _, text, confidence in self._reader.readtext(back_crop, allowlist="0123456789", detail=1):
            digits = str(text).strip()
            if valid_read(digits, float(confidence)):
                readings.add(digits)
                if float(confidence) > best[1]:
                    best = (digits, float(confidence))
        return best if len(readings) == 1 else (None, 0.0)


def _package_version(name: str) -> str:
    from importlib.metadata import PackageNotFoundError, version  # noqa: PLC0415

    try:
        return version(name)
    except PackageNotFoundError:
        return "missing"


def model_versions() -> dict[str, str]:
    """What an approval record pins: weights id plus the library versions that run them."""
    return {
        "detector": f"{DETECTOR_MODEL}@transformers-{_package_version('transformers')}",
        "tracker": f"bytetrack@supervision-{_package_version('supervision')}",
        "jerseyReader": f"easyocr-{_package_version('easyocr')}",
        "decoder": f"pyav-{_package_version('av')}",
    }


def default_components(fps: float = 2.0, *, local_only: bool = False, cpu: bool = False) -> Components:
    return Components(
        source=PyAvFrameSource(),
        detector=RtDetrDetector(local_only=local_only, cpu=cpu),
        tracker_factory=lambda: ByteTrackTracker(fps),
        jersey_reader=EasyOcrJerseyReader(local_only=local_only, cpu=cpu),
        models=model_versions(),
    )
