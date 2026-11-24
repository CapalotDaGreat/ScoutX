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


def _box_iou(a: np.ndarray, b: np.ndarray) -> float:
    x1, y1 = max(float(a[0]), float(b[0])), max(float(a[1]), float(b[1]))
    x2, y2 = min(float(a[2]), float(b[2])), min(float(a[3]), float(b[3]))
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = (float(a[2]) - float(a[0])) * (float(a[3]) - float(a[1])) + (float(b[2]) - float(b[0])) * (float(b[3]) - float(b[1])) - inter
    return inter / union if union > 0 else 0.0


def keep_continuous_observations(frames: np.ndarray, boxes: np.ndarray, pano: np.ndarray | None = None, *,
                                 min_iou: float = 0.4, max_hole: int = 3, max_tail: int = 4,
                                 min_height_ratio: float = 0.75, jump_bh: float = 0.45) -> np.ndarray:
    """Rows of one already-chosen tracklet that may be published as that player.

    Image overlap alone is not identity: a camera pan drives it to zero while the player stays
    put in panorama coordinates. Two shapes still are not continuity:
    a frame that misses the next box entirely while the neighbours still overlap (the track
    left and came back — E4), and a tail of at most four rows after a short hole whose
    panorama position and body size never recover (the pause-and-resume transfer).
    Longer tails are kept. Cutting them rewrites the chain, which was not selective on the
    full-match detour measurement.
    """
    n = len(frames)
    keep = np.ones(n, dtype=bool)
    if n < 2:
        return keep
    order = np.argsort(frames.astype(int), kind="stable")
    fr = frames.astype(int)[order]
    bb = np.asarray(boxes, float)[order]
    pp = None if pano is None else np.asarray(pano, float)[order]

    def bh(k: int, j: int) -> float:
        return float(np.hypot(pp[k, 0] - pp[j, 0], pp[k, 1] - pp[j, 1]) / max(float(pp[j, 2]), 1.0))

    for j in range(1, n - 1):
        if int(fr[j] - fr[j - 1]) > 2 or int(fr[j + 1] - fr[j]) > 2:
            continue
        left, right, span = _box_iou(bb[j], bb[j - 1]), _box_iou(bb[j], bb[j + 1]), _box_iou(bb[j - 1], bb[j + 1])
        # The neighbours still see each other and this frame misses the return completely.
        if right < 0.05 and left < min_iou and span > 0.15 and span > right:
            keep[order[j]] = False
    if pp is not None:
        for j in range(1, n):
            missing = int(fr[j] - fr[j - 1] - 1)
            if not (1 <= missing <= max_hole) or not keep[order[j - 1]]:
                continue
            if bh(j, j - 1) < jump_bh or float(pp[j, 2]) >= min_height_ratio * float(pp[j - 1, 2]):
                continue
            # Still the same image box: a warp spike, not a different player.
            if _box_iou(bb[j], bb[j - 1]) >= min_iou:
                continue
            tail = list(range(j, n))
            if len(tail) > max_tail:
                continue
            if any(bh(k, j - 1) < jump_bh - 0.05 and float(pp[k, 2]) >= min_height_ratio * float(pp[j - 1, 2]) for k in tail):
                continue
            for k in tail:
                keep[order[k]] = False
    return keep


def reacquire_interrupted_rows(rows, pano, kept_row: int, dropped_rows, *, fps: float, segments,
                               kit=None, kit_floor: float = 0.12, min_height_ratio: float = 0.75) -> list[int]:
    """Rows of another track at the frames a chosen tracklet can no longer publish.

    The search stays inside those refused frames. A frame that was never part of the
    refused tail, including the moment of a box steal, is not adopted. A candidate has
    to keep the last published body size and stay inside the chain's reachable step
    (slack plus maximum speed). The track that covers the most of those frames, and
    among ties the one closest to the last kept observation, is the continuation.
    A row that is the refused box again is not a different player.
    """
    from .identity import MAX_SPEED_BH, SLACK_BH  # noqa: PLC0415

    dropped_rows = np.asarray(dropped_rows, int)
    if len(dropped_rows) == 0:
        return []
    kf = int(rows[kept_row, 0])
    kt = float(rows[kept_row, 1])
    kp = np.asarray(pano[kept_row], float)
    kh = max(float(kp[2]), 1.0)
    if int(segments[kf]) != int(segments[int(rows[int(dropped_rows[0]), 0])]):
        return []
    exclude = int(rows[kept_row, 2])
    refused = {int(rows[int(r), 0]): int(r) for r in dropped_rows}
    by_tid: dict[int, list[tuple[int, int, float]]] = {}
    for r in range(len(rows)):
        f = int(rows[r, 0])
        if f not in refused or int(rows[r, 2]) == exclude or int(segments[f]) != int(segments[kf]):
            continue
        if kit is not None and float(kit[r]) < kit_floor:
            continue
        if _box_iou(rows[r, 3:7], rows[refused[f], 3:7]) >= 0.5:
            continue
        dt = float(rows[r, 1]) - kt
        if dt < 0:
            continue
        d = float(np.hypot(float(pano[r, 0]) - kp[0], float(pano[r, 1]) - kp[1])) / kh
        if d > SLACK_BH + MAX_SPEED_BH * dt or float(pano[r, 2]) < min_height_ratio * kh:
            continue
        by_tid.setdefault(int(rows[r, 2]), []).append((f, r, d))
    if not by_tid:
        return []
    tid, pts = max(by_tid.items(), key=lambda item: (len({f for f, _, _ in item[1]}),
                                                      -float(np.mean([d for _, _, d in item[1]]))))
    best: dict[int, tuple[float, int]] = {}
    for f, r, d in pts:
        if f not in best or d < best[f][0]:
            best[f] = (d, r)
    return [best[f][1] for f in sorted(best)]


def extend_recovered_track(rows, pano, recovered, *, segments, occluded=None, blocked_frames=None,
                           jump_bh: float = 0.45, min_iou: float = 0.4, max_hole: int = 3) -> list[int]:
    """Later rows of the track that filled a refused tail, while each one still continues the last.

    A reacquisition does not adopt the rest of that track. The walk stops before a gap longer
    than the publication hole, before a step that jumps in panorama and misses the previous
    image box, and before a row already in contact with a team-mate. That contact row is not
    published: the association there is ambiguous. A camera pan keeps a small panorama step,
    so image overlap alone does not stop the walk.
    """
    if not recovered:
        return []
    recovered = sorted((int(r) for r in recovered), key=lambda r: int(rows[r, 0]))
    tid = int(rows[recovered[-1], 2])
    prev = recovered[-1]
    blocked = set(blocked_frames or ())
    later = [r for r in range(len(rows)) if int(rows[r, 2]) == tid and int(rows[r, 0]) > int(rows[prev, 0])]
    later.sort(key=lambda r: (int(rows[r, 0]), r))
    out: list[int] = []
    for r in later:
        f, pf = int(rows[r, 0]), int(rows[prev, 0])
        if f in blocked or int(segments[f]) != int(segments[pf]) or f - pf - 1 > max_hole:
            break
        pp, p = pano[prev], pano[r]
        step = float(np.hypot(float(p[0]) - float(pp[0]), float(p[1]) - float(pp[1])) / max(float(pp[2]), 1.0))
        if step >= jump_bh and _box_iou(rows[r, 3:7], rows[prev, 3:7]) < min_iou:
            break
        if occluded is not None and bool(occluded[r]):
            break
        out.append(r)
        prev = r
    return out


def build_timeline(D, T, result, max_fill: int = 6, row_kit: np.ndarray | None = None,
                   kit_floor: float = 0.12) -> Timeline:
    F = len(D.times)
    from .analyze import _token, memo  # noqa: PLC0415

    occluded = memo(("occluded", _token(T), _token(row_kit) if row_kit is not None else None),
                    lambda: same_kit_occlusions(T, row_kit))
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
        cont = keep_continuous_observations(T.rows[ix, 0], T.rows[ix, 3:7], T.pano[ix])
        recovered: list[int] = []
        extended: list[int] = []
        if not cont.all() and result.evidence.get(k) in ("anchor", "number", "anchored"):
            kept_ix, dropped_ix = ix[cont], ix[~cont]
            if len(kept_ix) and len(dropped_ix) and int(T.rows[dropped_ix, 0].min()) > int(T.rows[kept_ix, 0].max()):
                # The refused tail is a different player. Another track may still be this one,
                # but only on the frames that were refused: the hole itself is not filled in.
                anchor = int(kept_ix[int(np.argmax(T.rows[kept_ix, 0]))])
                recovered = reacquire_interrupted_rows(
                    T.rows, T.pano, anchor, dropped_ix, fps=float(D.fps), segments=D.segment,
                    kit=row_kit, kit_floor=kit_floor)
                recovered = [r for r in recovered if not present[int(T.rows[r, 0])]]
                blocked = set()
                for k2 in result.chosen:
                    if k2 == k:
                        continue
                    blocked.update(int(x) for x in T.rows[T.by_tid[T.summary[k2]["tid"]], 0])
                extended = extend_recovered_track(
                    T.rows, T.pano, recovered, segments=D.segment, occluded=occluded,
                    blocked_frames=blocked)
                extended = [r for r in extended if not present[int(T.rows[r, 0])]]
            ix = kept_ix
        elif not cont.all():
            ix = ix[cont]
        if len(ix) == 0:
            continue
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
            # 5.1: the rest of the same piece (no team-mate contact in between - checked above via
            # the occlusion bounds) is the same followed person: anchored continuity up to
            # ANCHOR_SEC from the evidence, LIKELY at most.
            from .identity import ANCHOR_SEC  # noqa: PLC0415

            anch = np.zeros(len(ix), bool)
            for et in ev_t:
                lo, hi = et - ANCHOR_SEC, et + ANCHOR_SEC
                for ct in conflicts:
                    if ct > et:
                        hi = min(hi, (et + ct) / 2)
                    elif ct < et:
                        lo = max(lo, (et + ct) / 2)
                occ_t = tt[occluded[ix]]
                before, after = occ_t[occ_t < et], occ_t[occ_t > et]
                if len(before):
                    lo = max(lo, float(before.max()))
                if len(after):
                    hi = min(hi, float(after.min()))
                anch |= (tt >= lo) & (tt <= hi)
            labels = np.where(near, lab, np.where(anch, "anchored", "continuity"))
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
            conf[fr] = np.where(labels == lab, result.confidence[k], np.where(labels == "anchored", max(app, 0.8), max(app, 0.5)))
        ev[fr] = labels
        last = (fr[-1], T.rows[ix[-1], 3:7], T.pano[ix[-1]])
        if recovered or extended:
            # Neither set was read as the target number, so neither is confirmed.
            # "anchored" is the refused-tail replacement. "reacquired" is the later
            # continuation of that other track, and it stops at the next break.
            app = float(getattr(result, "appearance_score", {}).get(k, 0.5))
            for rows_ix, label in ((recovered, "anchored"), (extended, "reacquired")):
                if not rows_ix:
                    continue
                rf = T.rows[rows_ix, 0].astype(int)
                present[rf] = True
                boxes[rf] = T.rows[rows_ix, 3:7]
                pano[rf] = T.pano[rows_ix]
                conf[rf] = max(app, 0.8)
                ev[rf] = label
                last = (int(rf[-1]), T.rows[rows_ix[-1], 3:7], T.pano[rows_ix[-1]])
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
    for lab in ("number", "anchor", "anchored", "reacquired", "appearance", "continuity", "contact_unclear", "interpolated"):
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
