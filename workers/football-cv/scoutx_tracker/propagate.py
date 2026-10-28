"""5.1 adaptive detection: carry person boxes from a detector frame to the next frame(s) with
local optical flow instead of running the 1280 px detector on every frame.

On 2 vCPU the detector is ~76 % of dense stage-1 time (0.35 s per 1080p frame). With
`key_every=2` the detector runs on every second frame - exactly the frames on which crops (for
number reading) and grid descriptors are stored, so OCR and appearance inputs are unchanged -
and the frame in between gets the propagated boxes, which keep the tracker continuous.
Players that enter on an in-between frame are picked up on the next detector frame (0.1 s
later at 10 fps). Balls are not propagated (they move too fast for this); ball detections exist
on detector frames only.
"""

from __future__ import annotations

import cv2
import numpy as np

SCORE_DECAY = 0.92        # a propagated box is a little less certain than a detection
# Propagated boxes enter the tracker below its high-confidence threshold (0.45): they can only
# extend an existing track (IoU stage), never start one or win an appearance re-association.
PROP_SCORE_CAP = float(__import__("os").environ.get("SCOUTX_PROP_SCORE_CAP", "1.0"))
MIN_POINTS = 4
MAX_SCALE_STEP = 0.15     # per frame


class BoxPropagator:
    def __init__(self, work_width: int = 960) -> None:
        self.work_width = work_width
        self._gray: np.ndarray | None = None
        self._scale = 1.0
        self.boxes = np.zeros((0, 4), np.float32)
        self.scores = np.zeros(0, np.float32)

    def _small(self, frame: np.ndarray) -> np.ndarray:
        h, w = frame.shape[:2]
        self._scale = self.work_width / float(w)
        small = cv2.resize(frame, (self.work_width, int(round(h * self._scale))), interpolation=cv2.INTER_AREA)
        return cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)

    def reset(self) -> None:
        self._gray = None
        self.boxes = np.zeros((0, 4), np.float32)
        self.scores = np.zeros(0, np.float32)

    def key(self, frame: np.ndarray, boxes: np.ndarray, scores: np.ndarray) -> None:
        """A detector frame: remember its image and boxes."""
        self._gray = self._small(frame)
        self.boxes = np.asarray(boxes, np.float32).reshape(-1, 4).copy()
        self.scores = np.asarray(scores, np.float32).reshape(-1).copy()

    def step(self, frame: np.ndarray, warp: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
        """Boxes on `frame` (the frame after the last key/step). `warp`: camera motion prev->cur
        (2x3, full-resolution pixels), used for boxes whose own points cannot be tracked."""
        gray = self._small(frame)
        if self._gray is None or len(self.boxes) == 0:
            self._gray = gray
            return np.zeros((0, 4), np.float32), np.zeros(0, np.float32)
        s = self._scale
        pts, owner = [], []
        for i, (x1, y1, x2, y2) in enumerate(self.boxes * s):
            w, h = x2 - x1, y2 - y1
            if w < 2 or h < 4:
                continue
            # grid over the upper body and legs (skip the outer margin: background)
            gx = np.linspace(x1 + 0.2 * w, x2 - 0.2 * w, 3)
            gy = np.linspace(y1 + 0.1 * h, y2 - 0.1 * h, 6)
            g = np.stack(np.meshgrid(gx, gy), -1).reshape(-1, 2)
            pts.append(g)
            owner.extend([i] * len(g))
        out_b = self.boxes.copy()
        if pts:
            p0 = np.concatenate(pts).astype(np.float32).reshape(-1, 1, 2)
            p1, st, err = cv2.calcOpticalFlowPyrLK(self._gray, gray, p0, None, winSize=(15, 15), maxLevel=3)
            owner_a = np.asarray(owner)
            ok = st.reshape(-1) == 1
            d = (p1 - p0).reshape(-1, 2) / s
            for i in range(len(self.boxes)):
                m = ok & (owner_a == i)
                x1, y1, x2, y2 = self.boxes[i]
                if m.sum() >= MIN_POINTS:
                    dx, dy = np.median(d[m], 0)
                    q0, q1 = p0.reshape(-1, 2)[m], p1.reshape(-1, 2)[m]
                    s0 = np.std(q0[:, 1]) + 1e-6
                    sc = float(np.clip(np.std(q1[:, 1]) / s0, 1 - MAX_SCALE_STEP, 1 + MAX_SCALE_STEP))
                    cx, cy = (x1 + x2) / 2 + dx, (y1 + y2) / 2 + dy
                    hw, hh = (x2 - x1) / 2 * sc, (y2 - y1) / 2 * sc
                    out_b[i] = [cx - hw, cy - hh, cx + hw, cy + hh]
                elif warp is not None:
                    c = np.array([[x1, y1], [x2, y2]], np.float64) @ warp[:, :2].T + warp[:, 2]
                    out_b[i] = c.reshape(-1)
        H, W = frame.shape[:2]
        out_b[:, [0, 2]] = np.clip(out_b[:, [0, 2]], 0, W - 1)
        out_b[:, [1, 3]] = np.clip(out_b[:, [1, 3]], 0, H - 1)
        keep = ((out_b[:, 2] - out_b[:, 0]) >= 2) & ((out_b[:, 3] - out_b[:, 1]) >= 4)
        self.boxes, self.scores = out_b[keep], (self.scores * SCORE_DECAY)[keep]
        self._gray = gray
        return self.boxes.copy(), np.minimum(self.scores, PROP_SCORE_CAP)
