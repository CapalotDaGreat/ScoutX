"""Camera motion compensation for handheld / panning match footage.

Estimates a 2x3 similarity transform that maps points in the previous frame to the current
frame, using sparse optical flow on background pixels (people are masked out so moving
players do not drag the estimate). Works on a downscaled grey image for speed.
"""

from __future__ import annotations

import cv2
import numpy as np

IDENTITY = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float64)


class CameraMotion:
    def __init__(self, work_width: int = 640) -> None:
        self.work_width = work_width
        self._prev_gray: np.ndarray | None = None
        self._prev_pts: np.ndarray | None = None
        self._scale = 1.0

    def reset(self) -> None:
        self._prev_gray = None
        self._prev_pts = None

    def _mask(self, shape: tuple[int, int], boxes: np.ndarray | None) -> np.ndarray:
        mask = np.full(shape, 255, dtype=np.uint8)
        # Ignore the outer border (rolling shutter / vignetting) and the people.
        h, w = shape
        mask[: int(h * 0.02)] = 0
        mask[-int(h * 0.02):] = 0
        if boxes is not None and len(boxes):
            for x1, y1, x2, y2 in (boxes * self._scale).astype(int):
                mask[max(0, y1 - 2): y2 + 2, max(0, x1 - 2): x2 + 2] = 0
        return mask

    def update(self, frame_bgr: np.ndarray, person_boxes: np.ndarray | None = None) -> tuple[np.ndarray, float]:
        """Returns (affine prev->cur in full-res pixels, quality 0..1)."""
        h, w = frame_bgr.shape[:2]
        self._scale = self.work_width / float(w)
        small = cv2.resize(frame_bgr, (self.work_width, int(round(h * self._scale))), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        warp = IDENTITY.copy()
        quality = 0.0
        if self._prev_gray is not None and self._prev_pts is not None and len(self._prev_pts) >= 8:
            nxt, status, _ = cv2.calcOpticalFlowPyrLK(self._prev_gray, gray, self._prev_pts, None,
                                                      winSize=(21, 21), maxLevel=3)
            ok = status.reshape(-1) == 1
            p0, p1 = self._prev_pts[ok], nxt[ok]
            if len(p0) >= 8:
                m, inliers = cv2.estimateAffinePartial2D(p0, p1, method=cv2.RANSAC, ransacReprojThreshold=2.0)
                if m is not None:
                    quality = float(inliers.sum()) / max(1, len(p0))
                    m = m.astype(np.float64)
                    m[:, 2] /= self._scale  # translation back to full resolution
                    warp = m
        self._prev_gray = gray
        self._prev_pts = cv2.goodFeaturesToTrack(gray, maxCorners=400, qualityLevel=0.01, minDistance=8,
                                                 mask=self._mask(gray.shape, person_boxes), blockSize=3)
        return warp, quality


def apply_affine(points: np.ndarray, warp: np.ndarray) -> np.ndarray:
    """points: (N, 2)."""
    return points @ warp[:, :2].T + warp[:, 2]


def scene_cut(prev_small: np.ndarray | None, small: np.ndarray, threshold: float = 0.45) -> bool:
    if prev_small is None:
        return False
    a = cv2.calcHist([prev_small], [0, 1], None, [16, 16], [0, 180, 0, 256])
    b = cv2.calcHist([small], [0, 1], None, [16, 16], [0, 180, 0, 256])
    cv2.normalize(a, a)
    cv2.normalize(b, b)
    return cv2.compareHist(a, b, cv2.HISTCMP_BHATTACHARYYA) > threshold
