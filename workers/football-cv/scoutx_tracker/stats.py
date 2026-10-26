"""Stage 4: per-player statistics from the target timeline.

All physical numbers are estimates from a single moving phone camera without pitch
calibration: ground distance is measured in "body heights" in camera-motion-compensated
coordinates and converted with an average player height (1.8 m). Movement straight towards or
away from the camera is under-counted, so distances are conservative.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .identity import PLAYER_HEIGHT_M

SPRINT_MS = 5.5        # >= 19.8 km/h
HIGH_INTENSITY_MS = 4.0  # >= 14.4 km/h
MAX_MS = 10.5


@dataclass
class Timeline:
    frames: np.ndarray      # (F,) global frame index
    times: np.ndarray       # (F,) seconds
    present: np.ndarray     # (F,) bool
    boxes: np.ndarray       # (F,4)
    pano: np.ndarray        # (F,3) foot x, y, height in shot-panorama units
    segment: np.ndarray     # (F,)
    conf: np.ndarray        # (F,)
    evidence: np.ndarray    # (F,) object: label or ""
    interpolated: np.ndarray  # (F,) bool


HARD_EVIDENCE_RADIUS_SEC = 4.0


SAME_KIT_OVERLAP = 0.5   # share of the smaller box covered by a team-mate's box
SAME_KIT_SCORE = 0.3     # kit score that makes the other box a team-mate


def same_kit_occlusions(T, row_kit: np.ndarray | None) -> np.ndarray:
    """Per tracklet row: does another detection wearing the same kit overlap this box heavily?
    Tracker identity swaps between team-mates need such contact, so hard evidence (a number read,
    a user answer) never reaches across one."""
    R = T.rows
    occ = np.zeros(len(R), bool)
    if row_kit is None or len(R) == 0:
        return occ
    order = np.argsort(R[:, 0], kind="stable")
    frames = R[order, 0].astype(int)
    bounds = np.flatnonzero(np.diff(frames)) + 1
    for grp in np.split(order, bounds):
        if len(grp) < 2:
            continue
        b = R[grp, 3:7]
        x1 = np.maximum(b[:, None, 0], b[None, :, 0])
        y1 = np.maximum(b[:, None, 1], b[None, :, 1])
        x2 = np.minimum(b[:, None, 2], b[None, :, 2])
        y2 = np.minimum(b[:, None, 3], b[None, :, 3])
        inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
        area = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
        cover = inter / np.maximum(np.minimum(area[:, None], area[None, :]), 1e-9)
        np.fill_diagonal(cover, 0)
        mate = row_kit[grp] >= SAME_KIT_SCORE
        occ[grp] = ((cover >= SAME_KIT_OVERLAP) & mate[None, :]).any(1)
    return occ


def build_timeline(D, T, result, max_fill: int = 6, row_kit: np.ndarray | None = None,
                   kit_floor: float = 0.12) -> Timeline:
    F = len(D.times)
    occluded = same_kit_occlusions(T, row_kit)
    present = np.zeros(F, bool)
    boxes = np.zeros((F, 4))
    pano = np.zeros((F, 3))
    conf = np.zeros(F)
    ev = np.array([""] * F, dtype=object)
    interp = np.zeros(F, bool)
    last = None
    for k in result.chosen:
        s = T.summary[k]
        ix = T.by_tid[s["tid"]]
        if row_kit is not None and result.evidence.get(k) not in ("anchor", "number"):
            # Frame-level check: drop moments where the box clearly isn't wearing the target kit
            # (occlusions / brief swaps inside an otherwise correct tracklet).
            h = T.rows[ix, 6] - T.rows[ix, 4]
            keep = (row_kit[ix] >= kit_floor) | (h < 40)
            if keep.sum() < 3:
                continue
            ix = ix[keep]
        fr = T.rows[ix, 0].astype(int)
        lab = result.evidence[k]
        ev_t = getattr(result, "evidence_times", {}).get(k, [])
        if lab in ("anchor", "number"):
            # Hard evidence is local: one read / answer confirms its own neighbourhood only. The
            # rest of the tracklet keeps it as continuity (a same-team swap can hide inside).
            tt = T.rows[ix, 1]
            near = np.zeros(len(ix), bool)
            conflicts = getattr(result, "conflict_times", {}).get(k, [])
            for et in ev_t:
                lo, hi = et - HARD_EVIDENCE_RADIUS_SEC, et + HARD_EVIDENCE_RADIUS_SEC
                # Never past the midpoint towards a read that cannot be the target: the identity
                # may change anywhere between the two reads.
                for ct in conflicts:
                    if ct > et:
                        hi = min(hi, (et + ct) / 2)
                    elif ct < et:
                        lo = max(lo, (et + ct) / 2)
                # ... nor across contact with a team-mate (where trackers swap identities).
                occ_t = tt[occluded[ix]]
                before, after = occ_t[occ_t < et], occ_t[occ_t > et]
                if len(before):
                    lo = max(lo, float(before.max()))
                if len(after):
                    hi = min(hi, float(after.min()))
                near |= (tt >= lo) & (tt <= hi)
            labels = np.where(near, lab, "continuity")
        else:
            labels = np.full(len(ix), lab, dtype=object)
        conflicts = getattr(result, "conflict_times", {}).get(k, [])
        if conflicts:
            # Contrary evidence: where the nearest read on this tracklet cannot be the target
            # (another number, or a digit the target number lacks), the moment is not claimed.
            tt = T.rows[ix, 1]
            ev_t = getattr(result, "evidence_times", {}).get(k, []) if lab in ("anchor", "number") else []
            d_conf = np.min(np.abs(tt[:, None] - np.asarray(conflicts)[None, :]), axis=1)
            d_ev = np.min(np.abs(tt[:, None] - np.asarray(ev_t)[None, :]), axis=1) if ev_t else np.full(len(tt), np.inf)
            labels = np.where((d_conf <= HARD_EVIDENCE_RADIUS_SEC) & (d_conf < d_ev), "conflict", labels)
        if last is not None:
            lf, lb, lp = last
            gap = fr[0] - lf
            if 1 < gap <= max_fill and D.segment[lf] == D.segment[fr[0]]:
                for g in range(1, gap):
                    a = g / gap
                    f = lf + g
                    present[f] = True
                    interp[f] = True
                    boxes[f] = (1 - a) * lb + a * T.rows[ix[0], 3:7]
                    pano[f] = (1 - a) * lp + a * T.pano[ix[0]]
                    conf[f] = min(conf[lf], result.confidence[k])
                    ev[f] = "interpolated"
        present[fr] = True
        boxes[fr] = T.rows[ix, 3:7]
        pano[fr] = T.pano[ix]
        conf[fr] = result.confidence[k]
        if lab in ("anchor", "number"):
            # Away from the evidence, confidence is what appearance alone supports, but never below
            # the continuity floor of a tracklet that is anchored somewhere.
            app = getattr(result, "appearance_score", {}).get(k, 0.5)
            conf[fr] = np.where(labels == lab, result.confidence[k], max(app, 0.5))
        ev[fr] = labels
        last = (fr[-1], T.rows[ix[-1], 3:7], T.pano[ix[-1]])
    return Timeline(np.arange(F), D.times.copy(), present, boxes, pano, D.segment.copy(), conf, ev, interp)


def _runs(mask: np.ndarray) -> list[tuple[int, int]]:
    """[start, end) index runs where mask is True."""
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    if start is not None:
        out.append((start, len(mask)))
    return out


def _smooth(x: np.ndarray, k: int) -> np.ndarray:
    if len(x) < 3 or k <= 1:
        return x.copy()
    k = min(k, len(x) if len(x) % 2 else len(x) - 1)
    pad = k // 2
    xp = np.pad(x, (pad, pad), mode="edge")
    return np.convolve(xp, np.ones(k) / k, mode="valid")


def _median(x: np.ndarray, k: int) -> np.ndarray:
    if len(x) < 3:
        return x.copy()
    pad = k // 2
    xp = np.pad(x, (pad, pad), mode="edge")
    return np.array([np.median(xp[i:i + k]) for i in range(len(x))])


def speeds(tl: Timeline, fps: float, frame_width: int = 1920, hfov_deg: float = 65.0) -> np.ndarray:
    """Per-frame ground speed estimate in m/s (nan where not visible).

    Pinhole model: a player of ~1.8 m with box height h (in camera-compensated pixels) stands at
    depth Z = f * 1.8 / h. Sideways motion is the panorama displacement scaled by Z / f; motion
    towards/away from the camera is the change in Z. Depth from box height is noisy for small,
    far-away players, so that component is smoothed hard and faded out beyond ~40 m.
    """
    f = (frame_width / 2) / np.tan(np.radians(hfov_deg / 2))
    v = np.full(len(tl.times), np.nan)
    pieces = []
    for a, b in _runs(tl.present):
        cuts = [a] + [i for i in range(a + 1, b) if tl.segment[i] != tl.segment[i - 1]] + [b]
        pieces += list(zip(cuts[:-1], cuts[1:]))
    for a, b in pieces:
        if b - a < 4:
            continue
        x = _smooth(tl.pano[a:b, 0], 5)
        h = _smooth(_median(np.maximum(tl.pano[a:b, 2], 8.0), 11), 9)
        Z = f * PLAYER_HEIGHT_M / h
        dx = np.gradient(x) * fps                      # px / s
        lateral = np.abs(dx) * Z / f                   # m / s
        dZ = np.gradient(_smooth(Z, 13)) * fps         # m / s
        # Depth from box height is only trusted up close, and damped: pose changes (leaning,
        # stretching) also change the box height.
        trust = 0.8 * np.clip((40.0 - Z) / 20.0, 0.0, 1.0)
        sp = np.hypot(lateral, dZ * trust)
        v[a:b] = np.clip(_smooth(sp, 5), 0, MAX_MS)
    return v


def ball_track(D, min_score: float = 0.25) -> dict[int, np.ndarray]:
    """Best ball detection per frame -> centre (x, y, size)."""
    best: dict[int, np.ndarray] = {}
    for f, t, x1, y1, x2, y2, s in D.balls:
        if s < min_score:
            continue
        f = int(f)
        if f not in best or s > best[f][3]:
            best[f] = np.array([(x1 + x2) / 2, (y1 + y2) / 2, max(x2 - x1, y2 - y1), s])
    return best


def _near_feet(ball: np.ndarray, box: np.ndarray) -> bool:
    x1, y1, x2, y2 = box
    h = max(y2 - y1, 1)
    if ball[2] > 0.5 * h:  # ball can't be bigger than half a player
        return False
    fx = (x1 + x2) / 2
    return abs(ball[0] - fx) <= 0.55 * h and (y1 + 0.55 * h) <= ball[1] <= (y2 + 0.18 * h)


def involvements(D, T, tl: Timeline, fps: float, kit_min: float = 0.22) -> list[dict]:
    balls = ball_track(D)
    near = np.zeros(len(tl.times), bool)
    for f in np.where(tl.present)[0]:
        b = balls.get(int(f))
        if b is not None and _near_feet(b, tl.boxes[f]):
            near[f] = True
    # Merge touches separated by short gaps into one involvement.
    episodes = []
    for a, b in _runs(near):
        if episodes and a - episodes[-1][1] <= int(0.8 * fps):
            episodes[-1][1] = b
        else:
            episodes.append([a, b])
    # Index other people per frame for pass outcome.
    rows_by_frame: dict[int, np.ndarray] = {}
    order = np.argsort(T.rows[:, 0], kind="stable")
    fr = T.rows[order, 0].astype(int)
    kit_of_tid = {s["tid"]: s["kit1"] + 0.5 * s["kit2"] for s in T.summary}
    out = []
    for a, b in episodes:
        end = b - 1
        target_box = tl.boxes[end]
        outcome = "unknown"
        for f in range(b, min(len(tl.times), b + int(3.5 * fps))):
            if tl.segment[f] != tl.segment[end]:
                break
            ball = balls.get(f)
            if ball is None:
                continue
            lo, hi = np.searchsorted(fr, f), np.searchsorted(fr, f, side="right")
            hit = None
            for r in T.rows[order[lo:hi]]:
                box = r[3:7]
                if tl.present[f] and np.allclose(box, tl.boxes[f], atol=2):
                    continue
                if _near_feet(ball, box):
                    hit = r
                    break
            if hit is not None:
                if f - b < int(0.4 * fps):
                    # Someone right next to the target at release: contested ball.
                    outcome = "contested"
                else:
                    outcome = "teammate" if kit_of_tid.get(int(hit[2]), 0) >= kit_min else "opponent"
                break
        out.append({"start": float(tl.times[a]), "end": float(tl.times[end]), "frames": int(b - a),
                    "outcome": outcome, "box": [float(v) for v in target_box]})
    return out


def compute_stats(D, T, tl: Timeline, fps: float, result) -> dict:
    v = speeds(tl, fps, frame_width=getattr(D, 'width', 1920) or 1920)
    dt = 1.0 / fps
    vis = tl.present
    visible_sec = float(vis.sum() * dt)
    total_sec = float(len(tl.times) * dt)
    valid = ~np.isnan(v)
    dist = float(np.nansum(v[valid]) * dt)
    sprint_runs = [(a, b) for a, b in _runs(np.nan_to_num(v) >= SPRINT_MS) if (b - a) >= int(1.0 * fps)]
    hi_runs = [(a, b) for a, b in _runs(np.nan_to_num(v) >= HIGH_INTENSITY_MS) if (b - a) >= int(1.0 * fps)]
    top = float(np.nanpercentile(v[valid], 99)) if valid.sum() > 20 else None
    inv = involvements(D, T, tl, fps)
    passes_ok = sum(1 for e in inv if e["outcome"] == "teammate")
    lost = sum(1 for e in inv if e["outcome"] == "opponent")
    # 5-minute activity buckets.
    buckets = []
    t0, t1 = float(tl.times[0]), float(tl.times[-1])
    edges = np.arange(np.floor(t0 / 300) * 300, t1 + 300, 300)
    for a, b in zip(edges[:-1], edges[1:]):
        m = (tl.times >= a) & (tl.times < b)
        if not m.any():
            continue
        buckets.append({
            "from": float(a), "to": float(b),
            "visibleSec": round(float((vis & m).sum() * dt), 1),
            "distanceM": round(float(np.nansum(v[m]) * dt), 1),
            "involvements": sum(1 for e in inv if a <= e["start"] < b),
            "sprints": sum(1 for s, _ in sprint_runs if a <= tl.times[s] < b),
        })
    evidence_sec = {}
    for lab in ("number", "anchor", "appearance", "continuity", "interpolated"):
        evidence_sec[lab] = round(float(((tl.evidence == lab) & vis).sum() * dt), 1)
    return {
        "recordingSec": round(total_sec, 1),
        "visibleSec": round(visible_sec, 1),
        "visiblePct": round(100 * visible_sec / max(total_sec, 1e-9), 1),
        "distanceVisibleM": round(dist, 0),
        "workRateMPerMin": round(dist / max(visible_sec / 60, 1e-9), 1) if visible_sec > 30 else None,
        "topSpeedKmh": round(top * 3.6, 1) if top is not None else None,
        "avgSpeedKmh": round(float(np.nanmean(v[valid])) * 3.6, 1) if valid.any() else None,
        "sprints": len(sprint_runs),
        "sprintDistanceM": round(float(sum(np.nansum(v[a:b]) * dt for a, b in sprint_runs)), 0),
        "highIntensityRuns": len(hi_runs),
        "ballInvolvements": len(inv),
        "possessionSec": round(float(sum(e["frames"] for e in inv) * dt), 1),
        "passesToTeammate": passes_ok,
        "ballsLost": lost,
        "contested": sum(1 for e in inv if e["outcome"] == "contested"),
        "identityEvidenceSec": evidence_sec,
        "numberSightings": int(sum(1 for k in result.chosen if result.evidence.get(k) == "number")),
        "buckets": buckets,
        "involvementList": inv,
        "sprintList": [{"start": float(tl.times[a]), "end": float(tl.times[b - 1]),
                        "peakKmh": round(float(np.nanpercentile(v[a:b], 90)) * 3.6, 1)} for a, b in sprint_runs],
        "speed": v,
    }
