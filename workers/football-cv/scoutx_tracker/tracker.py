"""Multi-person tracker (BoT-SORT style) with camera-motion compensation and appearance cues.

Pure numpy/scipy so it runs anywhere. Produces short, reliable "tracklets"; long-term identity
(who is the target player) is decided later by `identity.py` over whole tracklets.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.optimize import linear_sum_assignment


# ---------------------------------------------------------------- Kalman (cx, cy, a, h)
class Kalman:
    def __init__(self, dt: float = 1.0) -> None:
        self.F = np.eye(8)
        for i in range(4):
            self.F[i, i + 4] = dt
        self.H = np.eye(4, 8)
        self.wp = 1.0 / 20
        self.wv = 1.0 / 160

    def initiate(self, z: np.ndarray):
        mean = np.r_[z, np.zeros(4)]
        h = z[3]
        std = [2 * self.wp * h, 2 * self.wp * h, 1e-2, 2 * self.wp * h,
               10 * self.wv * h, 10 * self.wv * h, 1e-5, 10 * self.wv * h]
        return mean, np.diag(np.square(std))

    def predict(self, mean, cov):
        h = mean[3]
        std = [self.wp * h, self.wp * h, 1e-2, self.wp * h, self.wv * h, self.wv * h, 1e-5, self.wv * h]
        Q = np.diag(np.square(std))
        return self.F @ mean, self.F @ cov @ self.F.T + Q

    def update(self, mean, cov, z):
        h = mean[3]
        R = np.diag(np.square([self.wp * h, self.wp * h, 1e-1, self.wp * h]))
        S = self.H @ cov @ self.H.T + R
        K = np.linalg.solve(S, (cov @ self.H.T).T).T
        mean = mean + K @ (z - self.H @ mean)
        cov = cov - K @ S @ K.T
        return mean, cov


def xyxy_to_z(b: np.ndarray) -> np.ndarray:
    w, h = b[2] - b[0], b[3] - b[1]
    return np.array([b[0] + w / 2, b[1] + h / 2, w / max(h, 1e-6), h])


def z_to_xyxy(m: np.ndarray) -> np.ndarray:
    cx, cy, a, h = m[:4]
    w = a * h
    return np.array([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2])


def _proximity_cost(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if len(a) == 0 or len(b) == 0:
        return np.ones((len(a), len(b)))
    ca = np.stack([(a[:, 0] + a[:, 2]) / 2, (a[:, 1] + a[:, 3]) / 2], 1)
    cb = np.stack([(b[:, 0] + b[:, 2]) / 2, (b[:, 1] + b[:, 3]) / 2], 1)
    ha, hb = a[:, 3] - a[:, 1], b[:, 3] - b[:, 1]
    hmax = np.maximum(ha[:, None], hb[None, :])
    d = np.linalg.norm(ca[:, None] - cb[None], axis=2) / np.maximum(hmax, 1)
    ratio = np.maximum(ha[:, None], hb[None, :]) / np.maximum(np.minimum(ha[:, None], hb[None, :]), 1)
    cost = 0.42 + 0.4 * d
    cost[(ratio > 1.6) | (d > 1.0)] = 1.0
    return cost


def iou_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)))
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / np.maximum(area_a[:, None] + area_b[None, :] - inter, 1e-6)


def _assign(cost: np.ndarray, thresh: float):
    if cost.size == 0:
        return [], list(range(cost.shape[0])), list(range(cost.shape[1]))
    c = cost.copy()
    c[c > thresh] = thresh + 1e3
    rows, cols = linear_sum_assignment(c)
    matches = [(r, k) for r, k in zip(rows, cols) if cost[r, k] <= thresh]
    mr = {r for r, _ in matches}
    mc = {k for _, k in matches}
    return matches, [r for r in range(cost.shape[0]) if r not in mr], [k for k in range(cost.shape[1]) if k not in mc]


@dataclass
class Track:
    tid: int
    mean: np.ndarray
    cov: np.ndarray
    feat: np.ndarray | None
    score: float
    start: int
    last: int
    hits: int = 1
    state: str = "new"  # new | tracked | lost | removed
    history: list = field(default_factory=list)

    @property
    def box(self) -> np.ndarray:
        return z_to_xyxy(self.mean)


class PlayerTracker:
    def __init__(self, fps: float = 10.0, high: float = 0.45, low: float = 0.12, new: float = 0.55,
                 buffer_sec: float = 3.0, match_thresh: float = 0.8, appearance_thresh: float = 0.35,
                 proximity_thresh: float = 0.5, gate: float = 0.30) -> None:
        self.kf = Kalman()
        self.high, self.low, self.new = high, low, new
        self.buffer = int(round(buffer_sec * fps))
        self.match_thresh = match_thresh
        self.app_thresh = appearance_thresh
        self.prox_thresh = proximity_thresh
        # Hard appearance gate: a track never jumps to someone whose kit/colours differ this much
        # (prevents identity swaps between opponents in tackles and crossings).
        self.gate = gate
        self.tracks: list[Track] = []
        self.next_id = 1
        self.frame = -1

    def _cmc(self, warp: np.ndarray | None) -> None:
        if warp is None:
            return
        R, t = warp[:, :2], warp[:, 2]
        scale = float(np.sqrt(abs(np.linalg.det(R))))
        for tr in self.tracks:
            tr.mean[:2] = R @ tr.mean[:2] + t
            tr.mean[4:6] = R @ tr.mean[4:6]
            tr.mean[3] *= scale
            tr.mean[7] *= scale

    def _gated(self, cost: np.ndarray, tracks: list[Track], feats: np.ndarray | None, det_ix: np.ndarray) -> np.ndarray:
        """Forbid matches whose shirt colours clearly differ (opponents crossing / tackling)."""
        if feats is None or cost.size == 0:
            return cost
        d_sh = np.zeros(cost.shape)
        det_sh = _shirt(feats[det_ix])
        for i, tr in enumerate(tracks):
            if tr.feat is not None:
                d_sh[i] = 1.0 - det_sh @ _shirt(tr.feat[None])[0]
        # Colour of tiny (far away) people is noisier: loosen the gate for them.
        h = self._boxes[det_ix, 3] - self._boxes[det_ix, 1]
        gate = np.where(h >= 40, self.gate, self.gate + 0.2)
        cost = cost.copy()
        cost[d_sh > gate[None, :]] = 10.0
        return cost

    @staticmethod
    def _app_dist(tracks: list[Track], feats: np.ndarray | None) -> np.ndarray:
        n, m = len(tracks), 0 if feats is None else len(feats)
        d = np.ones((n, m))
        if feats is None or m == 0:
            return d
        for i, tr in enumerate(tracks):
            if tr.feat is not None:
                d[i] = 1.0 - feats @ tr.feat
        return np.clip(d, 0, 1)

    def update(self, boxes: np.ndarray, scores: np.ndarray, feats: np.ndarray | None = None,
               warp: np.ndarray | None = None, frame_idx: int | None = None) -> list[tuple[int, np.ndarray, float, int]]:
        """boxes (N,4) xyxy, scores (N,), feats (N,D) L2-normalised or None.
        Returns [(track_id, box, score, det_index)] for tracks matched this frame."""
        self.frame = self.frame + 1 if frame_idx is None else frame_idx
        self._boxes = boxes
        for tr in self.tracks:
            tr.mean, tr.cov = self.kf.predict(tr.mean, tr.cov)
            if tr.state != "tracked":
                tr.mean[7] = 0  # don't let lost tracks grow/shrink
        self._cmc(warp)

        hi = np.where(scores >= self.high)[0]
        lo = np.where((scores >= self.low) & (scores < self.high))[0]
        active = [t for t in self.tracks if t.state in ("tracked", "lost")]
        confirmed = [t for t in active if t.hits >= 2 or t.state == "lost"]
        unconfirmed = [t for t in self.tracks if t.state == "new"]
        out: list[tuple[int, np.ndarray, float, int]] = []

        def commit(tr: Track, di: int) -> None:
            z = xyxy_to_z(boxes[di])
            tr.mean, tr.cov = self.kf.update(tr.mean, tr.cov, z)
            tr.score = float(scores[di])
            tr.last = self.frame
            tr.hits += 1
            tr.state = "tracked"
            if feats is not None and scores[di] >= self.high:
                f = feats[di]
                tr.feat = f if tr.feat is None else _norm(0.9 * tr.feat + 0.1 * f)
            out.append((tr.tid, boxes[di].copy(), float(scores[di]), int(di)))

        # 1) high-confidence detections vs confirmed tracks: IoU fused with appearance.
        tb = np.array([t.box for t in confirmed]).reshape(-1, 4)
        iou = iou_matrix(tb, boxes[hi])
        # Fast close-up runners barely overlap between frames: also allow matches by centre
        # distance (in body heights) when the size is similar; the colour gate below still applies.
        cost = np.minimum(1 - iou, _proximity_cost(tb, boxes[hi]))
        if feats is not None and len(confirmed) and len(hi):
            app = self._app_dist(confirmed, feats[hi])
            app_cost = app / 2.0
            app_cost[app > self.app_thresh] = 1.0
            app_cost[cost > self.prox_thresh] = 1.0
            # Lost tracks (no overlap after a gap) may be recovered by appearance + proximity.
            cost = np.minimum(cost, app_cost)
        cost = self._gated(cost, confirmed, feats, hi)
        m1, ut, ud = _assign(cost, self.match_thresh)
        for r, k in m1:
            commit(confirmed[r], hi[k])
        rem_tracks = [confirmed[r] for r in ut]
        rem_hi = hi[ud]

        # 2) low-confidence detections keep existing trajectories alive (IoU only).
        still = [t for t in rem_tracks if t.state == "tracked"]
        cost2 = self._gated(1 - iou_matrix(np.array([t.box for t in still]).reshape(-1, 4), boxes[lo]),
                            still, feats, lo)
        m2, ut2, _ = _assign(cost2, 0.5)
        for r, k in m2:
            commit(still[r], lo[k])
        matched2 = {still[r].tid for r, _ in m2}
        for t in rem_tracks:
            if t.tid not in matched2 and t.state == "tracked":
                t.state = "lost"

        # 3) unconfirmed tracks vs leftover high detections.
        cost3 = self._gated(1 - iou_matrix(np.array([t.box for t in unconfirmed]).reshape(-1, 4), boxes[rem_hi]),
                            unconfirmed, feats, rem_hi)
        m3, ut3, ud3 = _assign(cost3, 0.7)
        for r, k in m3:
            commit(unconfirmed[r], rem_hi[k])
        for r in ut3:
            unconfirmed[r].state = "removed"
        # 4) new tracks.
        for k in ud3:
            di = rem_hi[k]
            if scores[di] < self.new:
                continue
            mean, cov = self.kf.initiate(xyxy_to_z(boxes[di]))
            tr = Track(self.next_id, mean, cov, None if feats is None else feats[di], float(scores[di]),
                       self.frame, self.frame)
            self.next_id += 1
            self.tracks.append(tr)
            out.append((tr.tid, boxes[di].copy(), float(scores[di]), int(di)))
        # retire
        for t in self.tracks:
            if t.state == "lost" and self.frame - t.last > self.buffer:
                t.state = "removed"
        self.tracks = [t for t in self.tracks if t.state != "removed"]
        return out

    def reset(self) -> None:
        self.tracks = []


SHIRT = slice(20, 40)  # shirt band of the colour signature (see features.REGIONS)


def _shirt(F: np.ndarray) -> np.ndarray:
    P = F[:, SHIRT]
    return P / np.maximum(np.linalg.norm(P, axis=1, keepdims=True), 1e-9)


def _norm(v: np.ndarray) -> np.ndarray:
    return v / max(float(np.linalg.norm(v)), 1e-9)
