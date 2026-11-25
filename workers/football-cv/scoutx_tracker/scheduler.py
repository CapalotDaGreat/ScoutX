"""Risk-aware perception schedule. Default off, and not called by extract().

Off means the current pipeline: detect every working frame, and do not add OCR, appearance,
high-resolution recovery or ball detection from this module.

On is not a fixed stride. Frames are skipped only while no escalation is present and a periodic
full-frame detection is still inside its interval. A skipped frame does not prove the player
was visible.
"""

from __future__ import annotations

from dataclasses import dataclass

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
        "not_guaranteed", False, 640 if policy == "target_dynamic" else None,
    )
