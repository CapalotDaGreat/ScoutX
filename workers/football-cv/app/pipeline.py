"""Segment analysis orchestration with injectable components so it can be tested without a GPU.

Event detection and pitch mapping are not implemented: those stages are always reported as
`unavailable` and no events are emitted. Nothing here guesses.
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Iterable, Iterator, Protocol

import numpy as np

from .contract import SegmentRequest, SegmentResult
from .identity import (
    Track,
    TrackObservation,
    associate,
    availability_windows,
    candidate_payload,
    target_trace,
    visible_seconds,
)
from .teams import kit_rgb, team_match

WORKER_VERSION = "football-cv/0.2.0"


@dataclass
class Box:
    x1: float
    y1: float
    x2: float
    y2: float
    score: float


class FrameSource(Protocol):
    def frames(self, url: str, headers: str | None, start_sec: float, end_sec: float, fps: float) -> Iterator[tuple[float, np.ndarray]]: ...


class Detector(Protocol):
    def people(self, frame: np.ndarray) -> list[Box]: ...


class Tracker(Protocol):
    def update(self, boxes: list[Box]) -> list[tuple[str, Box]]: ...


class JerseyReader(Protocol):
    def read(self, back_crop: np.ndarray) -> tuple[str | None, float]: ...


@dataclass
class Components:
    source: FrameSource
    detector: Detector
    tracker_factory: "TrackerFactory"
    jersey_reader: JerseyReader
    # Exact model identifiers; an approval covers one worker version with one model set.
    models: dict[str, str] | None = None


class TrackerFactory(Protocol):
    def __call__(self) -> Tracker: ...


def camera_view(heights: Iterable[float]) -> str:
    """Median person height relative to the frame decides wide / medium / close."""
    values = list(heights)
    if not values:
        return "non_play"
    typical = median(values)
    if typical < 0.12:
        return "wide"
    if typical < 0.3:
        return "medium"
    return "close"


def _crop(frame: np.ndarray, box: Box, top: float, bottom: float) -> np.ndarray:
    height, width = frame.shape[:2]
    x1, x2 = int(max(0, box.x1)), int(min(width, box.x2))
    y1 = int(max(0, box.y1 + (box.y2 - box.y1) * top))
    y2 = int(min(height, box.y1 + (box.y2 - box.y1) * bottom))
    return frame[y1:y2, x1:x2]


def analyse_segment(request: SegmentRequest, components: Components, trace: list[dict] | None = None) -> SegmentResult:
    """`trace` (evaluation only) receives the target's per-sample boxes; the service never passes it."""
    tracker = components.tracker_factory()
    tracks: dict[str, Track] = {}
    heights: list[float] = []
    decoded = 0
    step = 1.0 / request.sampling.fps
    tracking_state = "complete"
    try:
        for time_sec, frame in components.source.frames(
            request.source.url, request.source.headers, request.startSec, request.endSec, request.sampling.fps
        ):
            decoded += 1
            frame_height = frame.shape[0] or 1
            boxes = [box for box in components.detector.people(frame) if box.score >= 0.4]
            heights.extend((box.y2 - box.y1) / frame_height for box in boxes)
            for track_id, box in tracker.update(boxes):
                torso = _crop(frame, box, 0.15, 0.5)
                if torso.size == 0:
                    continue
                jersey, jersey_confidence = components.jersey_reader.read(torso)
                tracks.setdefault(track_id, Track(track_id)).observations.append(
                    TrackObservation(
                        time_sec=time_sec,
                        jersey_read=jersey,
                        jersey_confidence=jersey_confidence,
                        team_match=team_match(torso, request.target.kitPrimaryColor, request.target.kitSecondaryColor),
                        box=(box.x1, box.y1, box.x2, box.y2) if trace is not None else None,
                    )
                )
    except Exception:  # noqa: BLE001 - a broken stream must yield an honest failure, not a crash
        tracking_state = "failed"

    view = camera_view(heights) if decoded else "unclear"
    kit_known = kit_rgb(request.target.kitPrimaryColor) is not None or kit_rgb(request.target.kitSecondaryColor) is not None
    if tracking_state == "failed" or decoded == 0:
        association = associate([], request.target.jerseyNumber)
        tracking_state = "failed"
    else:
        association = associate(list(tracks.values()), request.target.jerseyNumber, kit_known)
    if trace is not None:
        trace.extend(target_trace(association))
    windows = availability_windows(association, request.startSec, request.endSec, step, wide_camera=view == "wide")
    analysed = min(request.endSec - request.startSec, decoded * step)
    result = SegmentResult(
        workerVersion=WORKER_VERSION,
        models=components.models or {},
        segmentIndex=request.segmentIndex,
        stages={
            "tracking": tracking_state,
            "identity": "complete" if tracking_state == "complete" else "failed",
            "events": "unavailable",
            "pitch": "unavailable",
        },
        cameraView=view,
        identity={"state": association.state, "candidates": candidate_payload(association.candidates)},
        availability=windows,
        coverage={
            "analysedSec": round(analysed, 3),
            "targetVisibleSec": round(min(analysed, visible_seconds(windows)), 3),
            "framesDecoded": decoded,
        },
        events=[],
    )
    # Only the target's description leaves the worker; all other tracks are dropped here.
    tracks.clear()
    return result
