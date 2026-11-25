"""Risk-aware perception schedule. Off unless SCOUTX_SCHEDULER=risk.

Off means the current pipeline: detect every working frame, and do not add OCR, appearance,
high-resolution recovery or ball detection from this module.

On is not a fixed stride. Frames are skipped only while no escalation is present and a periodic
full-frame detection is still inside its interval. A skipped frame does not prove the player
was visible.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

ESCALATIONS = frozenset({
    "scene_change",
    "rapid_camera",
    "low_cmc",
    "similar_kit_crossing",
    "uncertain_association",
    "target_disappeared",
    "reentry",
    "scale_change",
    "possible_substitution",
    "contradictory_jersey",
    "poor_propagation",
})
OPTIONAL = frozenset({"ball_requested", "unrelated_overlap"})
TARGET_ESCALATIONS = (ESCALATIONS - {"similar_kit_crossing"}) | {"target_overlap"}
POLICIES = {
    "risk": ESCALATIONS,
    "target": TARGET_ESCALATIONS,
    "target_recovery": TARGET_ESCALATIONS,
    "target_dynamic": TARGET_ESCALATIONS,
}
APPEARANCE = frozenset({
    "similar_kit_crossing", "uncertain_association", "poor_propagation",
    "target_disappeared", "reentry", "possible_substitution", "scale_change",
})
HIGH_RES = frozenset({
    "contradictory_jersey", "target_disappeared", "reentry", "scale_change", "possible_substitution",
})

# Unvalidated intervals, in working frames. Broadcast is the shortest because cuts are common.
# These numbers are not an accuracy result.
PERIODIC_FULL_FRAMES = {"panoramic": 40, "touchline": 20, "broadcast": 10}


@dataclass(frozen=True)
class ScheduleDecision:
    defer_to_current_pipeline: bool
    full_frame_detect: bool
    appearance: bool
    ocr: bool
    high_res_recovery: bool
    ball: bool
    layer: str
    reason: str
    visibility_between_frames: str
    accuracy_validated: bool
    imgsz: int | None = None


def decide(signals: set[str] | frozenset[str], frames_since_full: int, *, enabled: bool = False,
           camera_class: str = "touchline", policy: str = "risk") -> ScheduleDecision:
    if policy == "fixed_stride":
        raise ValueError("fixed stride is not adaptive inference; the keyframe-every-2 trial already failed")
    if policy not in POLICIES:
        raise ValueError(f"unknown scheduling policy {policy!r}")
    if frames_since_full < 0:
        raise ValueError("frames_since_full cannot be negative")
    unknown = set(signals) - ESCALATIONS - OPTIONAL - {"target_overlap"}
    if unknown:
        raise ValueError(f"unknown scheduler signals: {sorted(unknown)}")
    if not enabled:
        return ScheduleDecision(
            True, True, False, False, False, False, "current", "scheduler_off",
            "current_pipeline", False,
        )
    if camera_class not in PERIODIC_FULL_FRAMES:
        raise ValueError("camera class must be panoramic, touchline or broadcast")
    reasons = set(signals) & POLICIES[policy]
    periodic = frames_since_full >= PERIODIC_FULL_FRAMES[camera_class]
    if reasons or periodic:
        high_res = bool(reasons & HIGH_RES)
        if policy == "target_recovery" and "target_overlap" in reasons:
            high_res = True
        return ScheduleDecision(
            False, True,
            bool(reasons & APPEARANCE) or "target_overlap" in reasons,
            "contradictory_jersey" in reasons,
            high_res,
            "ball_requested" in signals,
            "recovery" if reasons else "periodic",
            ",".join(sorted(reasons)) if reasons else "periodic_full_frame",
            "guaranteed_only_on_sampled_frames",
            False,
            1280 if policy == "target_dynamic" else None,
        )
    return ScheduleDecision(
        False, False, False, False, False, "ball_requested" in signals, "cheap", "continuity_holds",
        "not_guaranteed", False,             640 if policy == "target_dynamic" else None,
    )


SCENE_MEAN_ABS = 8.0
OVERLAP_IOU = 0.25


def frame_gray(frame: np.ndarray) -> np.ndarray:
    small = cv2.resize(frame, (32, 18), interpolation=cv2.INTER_AREA)
    if small.ndim == 3:
        return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    return small


def box_iou(a: np.ndarray, b: np.ndarray) -> float:
    x1, y1 = max(float(a[0]), float(b[0])), max(float(a[1]), float(b[1]))
    x2, y2 = min(float(a[2]), float(b[2])), min(float(a[3]), float(b[3]))
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    area = max(0.0, float(a[2] - a[0])) * max(0.0, float(a[3] - a[1]))
    other = max(0.0, float(b[2] - b[0])) * max(0.0, float(b[3] - b[1]))
    union = area + other - inter
    return inter / union if union else 0.0


def perception_signals(previous: np.ndarray | None, frame: np.ndarray, boxes: np.ndarray, has_key: bool,
                       anchor: tuple[float, float, float, float] | None = None) -> set[str]:
    signals: set[str] = set()
    current = frame_gray(frame)
    if previous is not None and float(np.abs(previous.astype(np.int16) - current.astype(np.int16)).mean()) >= SCENE_MEAN_ABS:
        signals.add("scene_change")
    if not has_key:
        signals.add("poor_propagation")
    target = None
    if anchor is not None and len(boxes):
        overlaps = [box_iou(box, np.asarray(anchor, np.float32)) for box in boxes]
        best = int(np.argmax(overlaps))
        target = best if overlaps[best] >= OVERLAP_IOU else None
    target_hit = False
    other_hit = False
    for index in range(len(boxes)):
        for other in range(index + 1, len(boxes)):
            if box_iou(boxes[index], boxes[other]) < OVERLAP_IOU:
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
