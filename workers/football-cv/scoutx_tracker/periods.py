"""Camera states and match periods.

Camera state (per frame, from cheap image + detection features):
  NON_FOOTBALL  - pitch barely visible (camera pointing at the ground, crowd, car park ...)
  CLOSE_UP      - pitch visible but people are large (few players, short range)
  PLAY_VIEW     - pitch visible with several players at playing distance
Match periods (per recording, editable by the user):
  play / non_play blocks. Non-play = long stretches without football activity (pre-match,
  half-time, post-match, camera interruptions). Short stoppages stay inside play.
Original source timestamps are never changed; periods only label them.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

NON_FOOTBALL, CLOSE_UP, PLAY_VIEW = "NON_FOOTBALL", "CLOSE_UP", "PLAY_VIEW"


def grass_fraction(frame_bgr: np.ndarray) -> float:
    """Share of pitch-green pixels in a downscaled frame (lower 3/4, the sky is ignored)."""
    small = cv2.resize(frame_bgr, (160, 90), interpolation=cv2.INTER_AREA)[22:]
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    return float(((h >= 30) & (h < 90) & (s >= 50) & (v >= 40)).mean())


def camera_states(grass: np.ndarray, dets: np.ndarray, n_frames: int, height: int = 1080) -> np.ndarray:
    """dets: (N,7) frame, t, x1, y1, x2, y2, score. Returns one state per frame."""
    conf = dets[dets[:, 6] >= 0.4]
    fr = conf[:, 0].astype(int)
    h = (conf[:, 5] - conf[:, 3]) / height
    count = np.bincount(fr, minlength=n_frames)[:n_frames]
    med_h = np.zeros(n_frames)
    order = np.argsort(fr)
    for f, hs in zip(*_group(fr[order], h[order])):
        med_h[f] = np.median(hs)
    out = np.full(n_frames, PLAY_VIEW, dtype=object)
    g = _smooth_bool(grass >= 0.2, 9)
    out[~g] = NON_FOOTBALL
    out[g & (count <= 3) & (med_h >= 0.3)] = CLOSE_UP
    return out


def _group(keys: np.ndarray, vals: np.ndarray):
    if len(keys) == 0:
        return [], []
    cut = np.flatnonzero(np.diff(keys)) + 1
    return [k[0] for k in np.split(keys, cut)], np.split(vals, cut)


def _smooth_bool(x: np.ndarray, k: int) -> np.ndarray:
    if len(x) < k:
        return x
    pad = k // 2
    xp = np.pad(x.astype(float), (pad, pad), mode="edge")
    return np.convolve(xp, np.ones(k) / k, mode="valid") >= 0.5


@dataclass
class Period:
    start: float
    end: float
    kind: str                 # "play" | "non_play" | "unobserved"
    label: str                # first_half, second_half, play, half_time, pre_match, post_match, interruption
    source: str = "detected"  # detected | user
    confidence: str = "heuristic"


@dataclass
class Timeline:
    periods: list[Period] = field(default_factory=list)

    def kind_at(self, t: np.ndarray) -> np.ndarray:
        out = np.full(len(t), "unknown", dtype=object)
        for p in self.periods:
            out[(t >= p.start) & (t < p.end)] = p.kind
        return out

    def in_play(self, t: np.ndarray) -> np.ndarray:
        m = np.zeros(len(t), bool)
        for p in self.periods:
            if p.kind == "play":
                m |= (t >= p.start) & (t < p.end)
        return m

    def to_json(self) -> list[dict]:
        return [p.__dict__ for p in self.periods]


def detect_periods(times: np.ndarray, states: np.ndarray, activity: np.ndarray, min_idle_sec: float = 180.0,
                   min_unobserved_sec: float = 20.0, corrections: dict | None = None) -> Timeline:
    """Per-frame category: unobserved (camera not showing football), idle (pitch visible but
    hardly anyone moving) or play. Idle stretches shorter than `min_idle_sec` are stoppages and
    stay inside play; longer ones are non-play (warm-up end, half-time, post-match). Camera
    interruptions are 'unobserved': the match may well continue, we just can't see it.
    User corrections (kickoff / half-time / full-time) replace the detected match boundaries."""
    fps = 1.0 / max(float(np.median(np.diff(times))), 1e-3) if len(times) > 1 else 10.0
    # 5.0 fix: for recordings shorter than the 30 s window np.convolve(mode="same") returned the
    # window's length instead of the recording's, and period detection crashed.
    win = max(1, min(int(round(30 * fps)), len(activity)))
    act = np.convolve(np.nan_to_num(activity), np.ones(win) / win, mode="same")
    cat = np.where(states == NON_FOOTBALL, 2, np.where(act >= 0.05, 0, 1))  # 0 play, 1 idle, 2 unobserved
    # Absorb short idle / unobserved runs into play.
    for code, min_sec in ((2, min_unobserved_sec), (1, min_idle_sec)):
        for a, b, val in _runs_val(cat):
            if val == code and (b - a) / fps < min_sec:
                cat[a:b] = 0
    kinds = {0: "play", 1: "non_play", 2: "unobserved"}
    periods: list[Period] = []
    for a, b, val in _runs_val(cat):
        t0, t1 = float(times[a]), float(times[b - 1]) + 1 / fps
        if periods and periods[-1].kind == kinds[val]:
            periods[-1].end = t1
        else:
            periods.append(Period(t0, t1, kinds[val], kinds[val] if val != 2 else "camera_interruption"))
    _label(periods)
    tl = Timeline(periods)
    if corrections:
        tl = apply_corrections(tl, corrections, float(times[0]), float(times[-1]) + 1 / fps)
    return tl


def _runs_val(x: np.ndarray):
    out, start = [], 0
    for i in range(1, len(x) + 1):
        if i == len(x) or x[i] != x[start]:
            out.append((start, i, int(x[start])))
            start = i
    return out


def _runs_bool(x: np.ndarray):
    out, start = [], 0
    for i in range(1, len(x) + 1):
        if i == len(x) or x[i] != x[start]:
            out.append((start, i, bool(x[start])))
            start = i
    return out


def _label(periods: list[Period]) -> None:
    plays = [p for p in periods if p.kind == "play"]
    long_plays = [p for p in plays if p.end - p.start >= 15 * 60]
    if len(long_plays) == 2:
        long_plays[0].label, long_plays[1].label = "first_half", "second_half"
    for i, p in enumerate(periods):
        if p.kind != "non_play":
            continue
        if i == 0:
            p.label = "pre_match"
        elif i == len(periods) - 1:
            p.label = "post_match"
        elif p.end - p.start >= 8 * 60:
            p.label = "half_time"


def apply_corrections(tl: Timeline, c: dict, t_start: float, t_end: float) -> Timeline:
    """c: {"kickoff": s, "halftimeStart": s, "secondHalfStart": s, "fulltime": s} (any subset).
    Boundaries given by the user replace the detected ones."""
    k = c.get("kickoff")
    hs, ss, ft = c.get("halftimeStart"), c.get("secondHalfStart"), c.get("fulltime")
    if k is None and ft is None and hs is None:
        return tl
    k = t_start if k is None else float(k)
    ft = t_end if ft is None else float(ft)
    periods = []
    if k > t_start:
        periods.append(Period(t_start, k, "non_play", "pre_match", "user", "user"))
    if hs is not None and ss is not None:
        periods += [Period(k, float(hs), "play", "first_half", "user", "user"),
                    Period(float(hs), float(ss), "non_play", "half_time", "user", "user"),
                    Period(float(ss), ft, "play", "second_half", "user", "user")]
    else:
        periods.append(Period(k, ft, "play", "play", "user", "user"))
    if ft < t_end:
        periods.append(Period(ft, t_end, "non_play", "post_match", "user", "user"))
    # Camera interruptions detected inside the user's play periods stay unobserved.
    unobserved = [p for p in tl.periods if p.kind == "unobserved"]
    out: list[Period] = []
    for p in periods:
        cur = p.start
        if p.kind == "play":
            for u in unobserved:
                if u.end <= cur or u.start >= p.end:
                    continue
                if u.start > cur:
                    out.append(Period(cur, u.start, "play", p.label, "user", "user"))
                out.append(Period(max(u.start, cur), min(u.end, p.end), "unobserved", "camera_interruption"))
                cur = min(u.end, p.end)
        if cur < p.end:
            out.append(Period(cur, p.end, p.kind, p.label, p.source, p.confidence))
    return Timeline(out)
