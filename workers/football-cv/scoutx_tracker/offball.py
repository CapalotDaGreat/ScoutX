"""Off-ball observations (4.1) - measured only on frames where the target's identity is CONFIRMED.

What is measured (directly observed, per frame):
  * distance from the target to the nearest opponent and to the nearest team-mate, in the
    target's own body heights (image plane; scale-normalised, so it does not need pitch
    calibration, but perspective still distorts it - reported as such);
  * episodes of 2 s or more in which no opponent was within 3 body heights ("free"), or one was
    within 1 body height ("tightly marked"), each with timestamps so it can be watched.

What is NOT claimed: no metres, no speeds, no tactical intent. Interpretations ("being free
can make you available for a pass") are produced separately by the coach and labelled as such.
Below MIN_CONFIRMED_SEC of confirmed footage no match-level figure is reported (status
"insufficient").

5.0 - evidence-specific sufficiency: a single, continuous confirmed sequence of at least
MIN_SEQUENCE_SEC in which the nearest opponent is measured on most frames can support a *narrow*
observation about that sequence only ("in this 8-second clip an opponent stayed within one body
height of you"). It never supports a claim about the whole match. Sequence observations are
returned even when the match-level status is "insufficient".
"""

from __future__ import annotations

import numpy as np

MIN_CONFIRMED_SEC = 60.0
FREE_BH, TIGHT_BH = 3.0, 1.0
MIN_EPISODE_SEC = 2.0
MIN_SEQUENCE_SEC = 6.0
SEQ_MEASURED_SHARE = 0.7
SEQ_FREE_SHARE, SEQ_TIGHT_SHARE = 0.7, 0.6
SEQ_MIN_TARGET_H = 60.0  # px: smaller players -> nearby opponents are too often missed by the detector


def _episodes(times: np.ndarray, flags: np.ndarray, min_sec: float, max_gap: float) -> list[tuple[float, float]]:
    """Runs of flagged samples (gaps up to `max_gap` s tolerated) lasting at least `min_sec`."""
    out: list[tuple[float, float]] = []
    a = last = None

    def close():
        if a is not None and last - a >= min_sec:
            out.append((float(a), float(last)))

    for t, f in zip(times, flags):
        if f:
            if a is None or t - last > max_gap:
                close()
                a = t
            last = t
        elif a is not None:
            close()
            a = last = None
    close()
    return out


def offball_observations(times: np.ndarray, states: np.ndarray, boxes: np.ndarray, present: np.ndarray,
                         rows: np.ndarray, team_by_tid: dict[int, str], fps: float = 10.0,
                         min_confirmed_sec: float = MIN_CONFIRMED_SEC) -> dict:
    """rows: (N, >=7) frame, t, tid, x1, y1, x2, y2 of every tracked person (the target's own row
    is recognised by overlap and skipped)."""
    times = np.asarray(times, float)
    ok = np.asarray(present, bool) & (np.asarray(states).astype(str) == "CONFIRMED_VISIBLE")
    confirmed_sec = float(ok.sum()) / fps
    base = {"method": "image-plane distance to the nearest opponent / team-mate, in the target's body heights, "
                      "on confirmed frames only", "caveat": "perspective distorts distances; not metres",
            "confirmedSec": round(confirmed_sec, 1), "minConfirmedSec": min_confirmed_sec}
    if confirmed_sec < min_confirmed_sec:
        return {"status": "insufficient", **base}
    opp, mate = _distances(times, ok, boxes, rows, team_by_tid)
    measured = np.isfinite(opp)
    if measured.sum() / fps < min_confirmed_sec / 2:
        return {"status": "insufficient", **base, "reason": "opponents rarely visible near the target"}
    o = opp[measured]
    t_m = times[measured]
    free = _episodes(t_m, o > FREE_BH, MIN_EPISODE_SEC, 1.0)
    tight = _episodes(t_m, o < TIGHT_BH, MIN_EPISODE_SEC, 1.0)
    return {
        "status": "measured", **base,
        "measuredSec": round(float(measured.sum()) / fps, 1),
        "nearestOpponentBodyHeights": {"median": round(float(np.median(o)), 2), "p25": round(float(np.percentile(o, 25)), 2),
                                       "p75": round(float(np.percentile(o, 75)), 2)},
        "nearestTeammateBodyHeights": ({"median": round(float(np.nanmedian(mate[measured])), 2)}
                                       if np.isfinite(mate[measured]).any() else None),
        "freeShare": round(float((o > FREE_BH).mean()), 3),
        "tightShare": round(float((o < TIGHT_BH).mean()), 3),
        "freeEpisodes": [{"start": round(a, 2), "end": round(b, 2)} for a, b in free][:20],
        "tightEpisodes": [{"start": round(a, 2), "end": round(b, 2)} for a, b in tight][:20],
    }


def _distances(times, ok, boxes, rows, team_by_tid):
    """Per-frame nearest opponent / team-mate distance in target body heights (NaN when unmeasured)."""
    by_frame: dict[int, list[int]] = {}
    for i, f in enumerate(rows[:, 0].astype(int)):
        by_frame.setdefault(f, []).append(i)
    fr_idx = np.flatnonzero(ok)
    opp = np.full(len(times), np.nan)
    mate = np.full(len(times), np.nan)
    for f in fr_idx:
        x1, y1, x2, y2 = boxes[f]
        h = y2 - y1
        if not np.isfinite(h) or h < 20:
            continue
        foot = np.array([(x1 + x2) / 2, y2])
        d_o, d_m = [], []
        for i in by_frame.get(int(f), []):
            b = rows[i, 3:7]
            ix = max(0.0, min(x2, b[2]) - max(x1, b[0])) * max(0.0, min(y2, b[3]) - max(y1, b[1]))
            if ix / max(1e-6, (x2 - x1) * (y2 - y1)) > 0.5:
                continue  # the target itself
            d = float(np.hypot((b[0] + b[2]) / 2 - foot[0], b[3] - foot[1])) / h
            team = team_by_tid.get(int(rows[i, 2]), "unknown")
            if team == "opponent":
                d_o.append(d)
            elif team == "team":
                d_m.append(d)
        if d_o:
            opp[f] = min(d_o)
        if d_m:
            mate[f] = min(d_m)
    return opp, mate


def _sequences(times: np.ndarray, ok: np.ndarray, max_gap: float) -> list[tuple[int, int]]:
    """Index ranges [i, j] of continuous confirmed frames (gaps up to `max_gap` s)."""
    idx = np.flatnonzero(ok)
    out, a = [], None
    for p, i in enumerate(idx):
        if a is None:
            a = i
        elif times[i] - times[idx[p - 1]] > max_gap:
            out.append((a, idx[p - 1]))
            a = i
    if a is not None:
        out.append((a, idx[-1]))
    return out


def sequence_observations(times, states, boxes, present, rows, team_by_tid, fps: float = 10.0,
                          min_sec: float = MIN_SEQUENCE_SEC) -> list[dict]:
    """Narrow, clip-level observations from continuous confirmed sequences (see module doc)."""
    times = np.asarray(times, float)
    ok = np.asarray(present, bool) & (np.asarray(states).astype(str) == "CONFIRMED_VISIBLE")
    if not ok.any():
        return []
    opp, mate = _distances(times, ok, boxes, rows, team_by_tid)
    out = []
    for i, j in _sequences(times, ok, 0.5):
        dur = float(times[j] - times[i])
        if dur < min_sec:
            continue
        seg = slice(i, j + 1)
        conf_frames = ok[seg]
        hs = (boxes[seg][:, 3] - boxes[seg][:, 1])[conf_frames]
        if not np.isfinite(hs).any() or float(np.nanmedian(hs)) < SEQ_MIN_TARGET_H:
            out.append({"start": round(float(times[i]), 2), "end": round(float(times[j]), 2), "kind": "unmeasured",
                        "reason": "you are too small in the picture to measure who is near you"})
            continue
        o = opp[seg][conf_frames]
        m = np.isfinite(o)
        if m.mean() < SEQ_MEASURED_SHARE:
            out.append({"start": round(float(times[i]), 2), "end": round(float(times[j]), 2), "kind": "unmeasured",
                        "reason": "opponents not visible near you for most of the sequence"})
            continue
        o = o[m]
        free, tight = float((o > FREE_BH).mean()), float((o < TIGHT_BH).mean())
        kind = "free" if free >= SEQ_FREE_SHARE else "tight" if tight >= SEQ_TIGHT_SHARE else "mixed"
        mt = mate[seg][conf_frames]
        out.append({"start": round(float(times[i]), 2), "end": round(float(times[j]), 2), "kind": kind,
                    "measuredSec": round(float(m.sum()) / fps, 1),
                    "nearestOpponentMedianBH": round(float(np.median(o)), 2),
                    "freeShare": round(free, 3), "tightShare": round(tight, 3),
                    "nearestTeammateMedianBH": (round(float(np.nanmedian(mt)), 2) if np.isfinite(mt).any() else None)})
    return out[:20]
