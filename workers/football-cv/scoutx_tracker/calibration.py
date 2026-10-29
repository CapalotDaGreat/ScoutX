"""Pitch calibration: image <-> pitch-metre homographies with explicit validity gates.

Two sources, both validated the same way:
  * manual  - the user (or an annotator) clicks >= 4 known pitch landmarks on one reference frame
              of a shot (corners, penalty-box corners, centre-line/touchline intersections ...).
              The homography is propagated to the other frames of the same shot through the
              camera-motion chain (panorama transforms). Propagation is only trusted while the
              accumulated camera-motion quality stays high and within MAX_PROPAGATION_SEC.
  * automatic: `detect_pitch_lines` finds confidence-scored pitch-line candidates (white, thin,
              grass on BOTH sides - which rejects advertising boards and fences) and their
              intersections (candidate landmarks). An automatic homography needs >= 4 identified,
              non-collinear landmarks; `auto_calibration_feasibility` reports per frame whether that
              geometry is even present. On a touchline phone recording it almost never is (measured:
              see docs/video/tracking-v3.2-report), so the candidates are offered to the user instead
              (manual calibration assistance), never silently turned into a homography.
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


# --------------------------------------------------------------------------- landmark candidates
@dataclass
class LineCandidate:
    p1: tuple[float, float]
    p2: tuple[float, float]
    angle: float          # degrees in [0, 180)
    length: float         # source pixels
    confidence: float     # 0..1: length x straightness x grass-on-both-sides


def _grass_both_sides(grass: np.ndarray, x1, y1, x2, y2, off: int = 6) -> float:
    """Share of samples along the segment with grass on both normal sides (rejects board edges)."""
    n = 20
    dx, dy = x2 - x1, y2 - y1
    L = max(np.hypot(dx, dy), 1e-6)
    nx, ny = -dy / L, dx / L
    ok = 0
    H, W = grass.shape
    for t in np.linspace(0.05, 0.95, n):
        x, y = x1 + t * dx, y1 + t * dy
        a = (int(round(y + ny * off)), int(round(x + nx * off)))
        b = (int(round(y - ny * off)), int(round(x - nx * off)))
        if 0 <= a[0] < H and 0 <= a[1] < W and 0 <= b[0] < H and 0 <= b[1] < W and grass[a] and grass[b]:
            ok += 1
    return ok / n


def detect_pitch_lines(frame_bgr: np.ndarray, work_w: int = 960) -> list[LineCandidate]:
    """Pitch-line candidates in source pixels, merged per direction, with confidence."""
    H0, W0 = frame_bgr.shape[:2]
    sc = work_w / W0
    small = cv2.resize(frame_bgr, (work_w, int(round(H0 * sc))), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    grass = cv2.inRange(hsv, (30, 40, 40), (90, 255, 255)) > 0
    white = cv2.inRange(hsv, (0, 0, 165), (180, 70, 255))
    tophat = cv2.morphologyEx(white, cv2.MORPH_TOPHAT, np.ones((9, 9), np.uint8))
    near_grass = cv2.dilate(grass.astype(np.uint8) * 255, np.ones((11, 11), np.uint8))
    lines_img = cv2.bitwise_and(tophat, near_grass)
    segs = cv2.HoughLinesP(lines_img, 1, np.pi / 360, 35, minLineLength=40, maxLineGap=12)
    if segs is None:
        return []
    raw = []
    # OpenCV 4 returns (N, 1, 4); OpenCV 5 also exposes (N, 4).
    for x1, y1, x2, y2 in np.asarray(segs).reshape(-1, 4).astype(float):
        both = _grass_both_sides(grass, x1, y1, x2, y2)
        if both < 0.6:
            continue
        raw.append((x1, y1, x2, y2, both))
    # Merge collinear pieces (same angle within 3 deg, normal distance within 6 px).
    merged: list[list] = []
    for x1, y1, x2, y2, both in sorted(raw, key=lambda r: -np.hypot(r[2] - r[0], r[3] - r[1])):
        ang = np.degrees(np.arctan2(y2 - y1, x2 - x1)) % 180
        th = np.radians(ang)
        rho = -x1 * np.sin(th) + y1 * np.cos(th)
        for m in merged:
            da = min(abs(ang - m[0]), 180 - abs(ang - m[0]))
            if da < 3 and abs(rho - m[1]) < 6:
                m[2].append((x1, y1, x2, y2, both))
                break
        else:
            merged.append([ang, rho, [(x1, y1, x2, y2, both)]])
    out = []
    for ang, _rho, parts in merged:
        pts = np.array([[p[0], p[1]] for p in parts] + [[p[2], p[3]] for p in parts])
        d = np.array([np.cos(np.radians(ang)), np.sin(np.radians(ang))])
        proj = pts @ d
        a, b = pts[np.argmin(proj)], pts[np.argmax(proj)]
        length = float(np.hypot(*(b - a)))
        covered = sum(np.hypot(p[2] - p[0], p[3] - p[1]) for p in parts) / max(length, 1e-6)
        both = float(np.mean([p[4] for p in parts]))
        conf = float(np.clip(length / (0.5 * work_w), 0, 1) * np.clip(covered, 0, 1) ** 0.5 * both)
        out.append(LineCandidate((a[0] / sc, a[1] / sc), (b[0] / sc, b[1] / sc), float(ang), length / sc, conf))
    return sorted(out, key=lambda c: -c.confidence)


def line_intersections(lines: list[LineCandidate], min_angle: float = 15.0, margin: float = 0.15,
                       shape: tuple[int, int] = (1080, 1920)) -> list[dict]:
    """Intersections of non-parallel line candidates near both segments: landmark candidates."""
    out = []
    H, W = shape
    for i in range(len(lines)):
        for j in range(i + 1, len(lines)):
            a, b = lines[i], lines[j]
            da = min(abs(a.angle - b.angle), 180 - abs(a.angle - b.angle))
            if da < min_angle:
                continue
            p = _intersect(a, b)
            if p is None or not (-0.05 * W <= p[0] <= 1.05 * W and -0.05 * H <= p[1] <= 1.05 * H):
                continue
            if _near_segment(a, p, margin) and _near_segment(b, p, margin):
                out.append({"point": (float(p[0]), float(p[1])), "lines": (i, j), "angle": float(da),
                            "confidence": round(min(a.confidence, b.confidence) * min(da / 45.0, 1.0), 3)})
    return sorted(out, key=lambda c: -c["confidence"])


def _intersect(a: LineCandidate, b: LineCandidate):
    (x1, y1), (x2, y2) = a.p1, a.p2
    (x3, y3), (x4, y4) = b.p1, b.p2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return px, py


def _near_segment(line: LineCandidate, p, margin: float) -> bool:
    (x1, y1), (x2, y2) = line.p1, line.p2
    d = np.array([x2 - x1, y2 - y1])
    L2 = float(d @ d)
    t = float((np.array(p) - np.array([x1, y1])) @ d / max(L2, 1e-9))
    return -margin <= t <= 1 + margin


def auto_calibration_feasibility(frame_bgr: np.ndarray, min_conf: float = 0.15) -> dict:
    """Per-frame geometry check: is an automatic homography even possible here?
    Needs >= 2 line directions and >= 4 well-spread landmark candidates (exact, non-collinear)."""
    lines = [c for c in detect_pitch_lines(frame_bgr) if c.confidence >= min_conf]
    dirs = []
    for c in lines:
        if all(min(abs(c.angle - d), 180 - abs(c.angle - d)) > 12 for d in dirs):
            dirs.append(c.angle)
    xs = line_intersections(lines, shape=frame_bgr.shape[:2])
    good = [x for x in xs if x["confidence"] >= min_conf]
    spread = 0.0
    if len(good) >= 3:
        spread = float(cv2.contourArea(cv2.convexHull(np.array([g["point"] for g in good], np.float32))))
    feasible = len(dirs) >= 2 and len(good) >= 4 and spread >= 0.02 * frame_bgr.shape[0] * frame_bgr.shape[1]
    return {"lines": len(lines), "directions": len(dirs), "landmarkCandidates": len(good),
            "spreadPx2": round(spread), "feasible": bool(feasible)}
