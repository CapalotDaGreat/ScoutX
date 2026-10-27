"""Off-ball observations (4.1) - measured only on frames where the target's identity is CONFIRMED.

What is measured (directly observed, per frame):
  * distance from the target to the nearest opponent and to the nearest team-mate, in the
    target's own body heights (image plane; scale-normalised, so it does not need pitch
    calibration, but perspective still distorts it - reported as such);
  * episodes of 2 s or more in which no opponent was within 3 body heights ("free"), or one was
    within 1 body height ("tightly marked"), each with timestamps so it can be watched.

What is NOT claimed: no metres, no speeds, no tactical intent. Interpretations ("being free
can make you available for a pass") are produced separately by the coach and labelled as such.
Below MIN_CONFIRMED_SEC of confirmed footage nothing is reported (status "insufficient").
"""

from __future__ import annotations

import numpy as np

MIN_CONFIRMED_SEC = 60.0
FREE_BH, TIGHT_BH = 3.0, 1.0
MIN_EPISODE_SEC = 2.0


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
