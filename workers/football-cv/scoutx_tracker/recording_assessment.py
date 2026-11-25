"""Cheap recording suitability. It does not read pixels and it does not promise a metric.

Physical metres stay unavailable until a calibration exists, and even then they are not
validated. Positions are never filled in for time the player spends off camera.
"""

from __future__ import annotations

from dataclasses import dataclass

from scoutx_tracker.preparation import SourceDescriptor

HIGHLIGHT_MIN_LONG_SIDE = 1280
HIGHLIGHT_MIN_FPS = 10
HIGHLIGHT_MIN_DURATION_SEC = 60


@dataclass(frozen=True)
class RecordingAssessment:
    highlights: str
    identity: str
    physical_metres: str
    physical_reason: str
    off_camera_positions: str
    notes: tuple[str, ...]


def assess(source: SourceDescriptor, *, calibration_points: int = 0) -> RecordingAssessment:
    if calibration_points < 0:
        raise ValueError("calibration point count cannot be negative")
    notes: list[str] = []
    if source.codec not in ("h264", "hevc"):
        highlights = "unsupported"
        notes.append("The upload probe accepts h264 and hevc only.")
    elif (max(source.width, source.height) >= HIGHLIGHT_MIN_LONG_SIDE
          and source.fps >= HIGHLIGHT_MIN_FPS
          and source.duration_sec >= HIGHLIGHT_MIN_DURATION_SEC):
        highlights = "possible"
    else:
        highlights = "limited"
        notes.append("Resolution, frame rate or duration is below the highlight suitability floor.")
    if source.transfer == "arib-std-b67":
        notes.append("HLG source. The extractor default remains OpenCV until a candidate passes the gates.")
    if calibration_points >= 4:
        physical = "not_validated"
        reason = "Calibration points exist. Metres have not passed an acceptance gate."
    else:
        physical = "unavailable"
        reason = "No calibrated pitch, so distance and speed are not reported from this recording."
    if source.camera_class in ("touchline", "broadcast") and calibration_points < 4:
        notes.append("This camera class has no established pitch landmarks in the current evidence.")
    notes.append("Highlight suitability is not an identity or accuracy result.")
    return RecordingAssessment(
        highlights=highlights,
        identity="not_measured",
        physical_metres=physical,
        physical_reason=reason,
        off_camera_positions="not_invented",
        notes=tuple(notes),
    )
