"""Pitch calibration: image <-> pitch-metre homographies with explicit validity gates.

Two sources, both validated the same way:
  * manual  - the user (or an annotator) clicks >= 4 known pitch landmarks on one reference frame
              of a shot (corners, penalty-box corners, centre-line/touchline intersections ...).
              The homography is propagated to the other frames of the same shot through the
              camera-motion chain (panorama transforms). Propagation is only trusted while the
              accumulated camera-motion quality stays high and within MAX_PROPAGATION_SEC.
  * automatic line-based landmark detection is NOT implemented: `line_evidence` only measures
              how much pitch-line geometry is visible, to decide whether it is worth attempting.
A position is accepted only when its calibration is valid; otherwise it is dropped (never guessed).
Every accepted position carries its calibration id (provenance).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0
MAX_REPROJECTION_M = 1.0
MAX_PROPAGATION_SEC = 20.0
MIN_CMC_QUALITY = 0.7

# Named landmarks in pitch metres (origin = left touchline/goal-line corner, x along length).
LANDMARKS = {
    "corner_bl": (0.0, 0.0), "corner_tl": (0.0, PITCH_WIDTH_M),
    "corner_br": (PITCH_LENGTH_M, 0.0), "corner_tr": (PITCH_LENGTH_M, PITCH_WIDTH_M),
    "halfway_bottom": (PITCH_LENGTH_M / 2, 0.0), "halfway_top": (PITCH_LENGTH_M / 2, PITCH_WIDTH_M),
    "centre_spot": (PITCH_LENGTH_M / 2, PITCH_WIDTH_M / 2),
    "lbox_bottom": (16.5, PITCH_WIDTH_M / 2 - 20.16), "lbox_top": (16.5, PITCH_WIDTH_M / 2 + 20.16),
    "rbox_bottom": (PITCH_LENGTH_M - 16.5, PITCH_WIDTH_M / 2 - 20.16),
    "rbox_top": (PITCH_LENGTH_M - 16.5, PITCH_WIDTH_M / 2 + 20.16),
    "lbox_goal_bottom": (0.0, PITCH_WIDTH_M / 2 - 20.16), "lbox_goal_top": (0.0, PITCH_WIDTH_M / 2 + 20.16),
    "rbox_goal_bottom": (PITCH_LENGTH_M, PITCH_WIDTH_M / 2 - 20.16),
    "rbox_goal_top": (PITCH_LENGTH_M, PITCH_WIDTH_M / 2 + 20.16),
    "lpenalty_spot": (11.0, PITCH_WIDTH_M / 2), "rpenalty_spot": (PITCH_LENGTH_M - 11.0, PITCH_WIDTH_M / 2),
}


@dataclass
class Calibration:
    id: str
    frame: int
    H: np.ndarray | None              # image -> pitch metres, for `frame`
    status: str                       # valid | invalid
    reason: str | None = None
    reprojection_m: float | None = None
    source: str = "manual"
    points: list = field(default_factory=list)


def fit_manual(cal_id: str, frame: int, image_pts: list[tuple[float, float]], names: list[str]) -> Calibration:
    if len(image_pts) != len(names) or len(names) < 4:
        return Calibration(cal_id, frame, None, "invalid", "need >= 4 named landmarks")
    try:
        world = np.array([LANDMARKS[n] for n in names], np.float64)
    except KeyError as e:
        return Calibration(cal_id, frame, None, "invalid", f"unknown landmark {e}")
    img = np.array(image_pts, np.float64)
    if len(names) == 4:
        H = cv2.getPerspectiveTransform(img.astype(np.float32), world.astype(np.float32)).astype(np.float64)
    else:
        H, _ = cv2.findHomography(img, world, 0)
    if H is None or not np.isfinite(H).all():
        return Calibration(cal_id, frame, None, "invalid", "degenerate landmark geometry")
    err = float(np.max(np.linalg.norm(project(H, img) - world, axis=1)))
    # With exactly 4 points the fit is exact; require non-collinear, well-spread points instead.
    area = cv2.contourArea(cv2.convexHull(world.astype(np.float32)))
    if area < 200.0:
        return Calibration(cal_id, frame, None, "invalid", "landmarks too close together", err)
    if err > MAX_REPROJECTION_M:
        return Calibration(cal_id, frame, None, "invalid", f"reprojection error {err:.2f} m", err)
    return Calibration(cal_id, frame, H, "valid", None, err, "manual", list(zip(names, map(tuple, img.tolist()))))


def project(H: np.ndarray, pts: np.ndarray) -> np.ndarray:
    p = np.c_[pts, np.ones(len(pts))] @ H.T
    return p[:, :2] / p[:, 2:3]


def propagate(cal: Calibration, P: np.ndarray, segment: np.ndarray, times: np.ndarray,
              cmc_quality: np.ndarray) -> dict[int, np.ndarray]:
    """Per-frame image->pitch homographies within the calibrated frame's shot.
    P[f] maps image coords of frame f to the shot reference; H_f = H_ref @ inv(P[ref]) @ P[f]."""
    if cal.status != "valid" or cal.H is None:
        return {}
    ref = cal.frame
    out = {}
    base = cal.H @ np.linalg.inv(P[ref])
    for step in (1, -1):
        f = ref
        while 0 <= f < len(times) and segment[f] == segment[ref] and abs(times[f] - times[ref]) <= MAX_PROPAGATION_SEC:
            if f != ref and cmc_quality[f if step == 1 else f + 1] < MIN_CMC_QUALITY:
                break
            out[f] = base @ P[f]
            f += step
    return out


def pitch_positions(boxes: np.ndarray, present: np.ndarray, H_by_frame: dict[int, np.ndarray],
                    cal_of_frame: dict[int, str]) -> tuple[np.ndarray, np.ndarray]:
    """Foot points -> pitch metres for frames with a valid homography; nan elsewhere.
    Positions outside the pitch (+3 m margin) are rejected as invalid geometry."""
    pos = np.full((len(present), 2), np.nan)
    prov = np.array([""] * len(present), dtype=object)
    for f, H in H_by_frame.items():
        if not present[f]:
            continue
        x1, y1, x2, y2 = boxes[f]
        p = project(H, np.array([[(x1 + x2) / 2, y2]]))[0]
        if -3 <= p[0] <= PITCH_LENGTH_M + 3 and -3 <= p[1] <= PITCH_WIDTH_M + 3:
            pos[f] = p
            prov[f] = cal_of_frame.get(f, "")
    return pos, prov


def observed_heatmap(pos: np.ndarray, bins: tuple[int, int] = (21, 14)) -> dict:
    ok = ~np.isnan(pos[:, 0])
    if ok.sum() == 0:
        return {"status": "unavailable", "reason": "no calibrated positions", "observedFrames": 0}
    h, _, _ = np.histogram2d(pos[ok, 0], pos[ok, 1], bins=bins, range=[[0, PITCH_LENGTH_M], [0, PITCH_WIDTH_M]])
    return {"status": "observed_only", "observedFrames": int(ok.sum()), "bins": list(bins),
            "grid": (h / max(h.sum(), 1)).round(4).tolist(),
            "note": "Occupancy while calibrated and visible only; unobserved time is not interpolated."}


def line_evidence(frame_bgr: np.ndarray) -> dict:
    """How much pitch-line geometry is visible (white thin structures on grass)."""
    small = cv2.resize(frame_bgr, (640, 360), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    grass = cv2.inRange(hsv, (30, 50, 40), (90, 255, 255))
    grass = cv2.dilate(grass, np.ones((9, 9), np.uint8))
    white = cv2.inRange(hsv, (0, 0, 170), (180, 60, 255))
    tophat = cv2.morphologyEx(white, cv2.MORPH_TOPHAT, np.ones((7, 7), np.uint8))
    lines_img = cv2.bitwise_and(tophat, grass)
    segs = cv2.HoughLinesP(lines_img, 1, np.pi / 180, 40, minLineLength=60, maxLineGap=8)
    if segs is None:
        return {"segments": 0, "orientations": 0}
    ang = np.array([np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180 for x1, y1, x2, y2 in segs[:, 0]])
    clusters = []
    for a in sorted(ang):
        if not clusters or min(abs(a - clusters[-1]), 180 - abs(a - clusters[-1])) > 15:
            clusters.append(a)
    return {"segments": int(len(segs)), "orientations": len(clusters)}
