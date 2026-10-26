"""Ball tracking and evidence-gated ball events for the target player.

Ball tracks: per-frame detections are linked over time in camera-compensated (panorama)
coordinates with a constant-velocity gate; short gaps are allowed, isolated / static detections
are discarded.

Events (each with start/end, evidence frame times, uncalibrated confidence and review state):
  contact    - ball in the target's foot zone on >= 2 frames AND (a change of ball direction/speed
               OR sustained control >= 0.6 s). Proximity alone is not a contact.
  carry      - contact where the ball stays in the foot zone >= 1.5 s while the player moves.
  pass_attempt - after a contact the ball leaves with >= 3 m/s-equivalent on one continuous track.
Pass outcome:
  completed  - the SAME continuous ball track (no gap > 0.3 s) reaches controlled contact
               (>= 2 frames) by a team-mate within 4 s, no opponent contact in between, camera on play.
  incomplete - same, but the first controlled contact is by an opponent.
  unknown    - anything else (ball lost from view, receiver unclear, referee, camera cut ...).
Unknown outcomes are never counted as completed or incomplete.
Duel / tackle CANDIDATES (3.2) - listed for review, never counted as statistics:
  duel_candidate   - the target and an opponent are both within reach of the tracked ball
                     (foot zone widened by 50 %) on >= 3 frames of one ball track.
  tackle_candidate - a duel candidate where the opponent had controlled contact (>= 2 frames)
                     before and the target has controlled contact after, on the same ball track.
Counts in the summary are split by identity state: only CONFIRMED_VISIBLE moments may ever back
a verified statistic; LIKELY moments are reported separately as unverified.
"""

from __future__ import annotations

import numpy as np

from .features import PALETTE, region_hist

GAP_FRAMES = 3
CONTACT_MIN_FRAMES = 2


def _foot_zone(ball_xy: np.ndarray, box: np.ndarray) -> bool:
    x1, y1, x2, y2 = box
    h = max(y2 - y1, 1.0)
    fx = (x1 + x2) / 2
    return abs(ball_xy[0] - fx) <= 0.5 * h and (y2 - 0.35 * h) <= ball_xy[1] <= (y2 + 0.15 * h)


def ball_tracks(D, P: np.ndarray, min_score: float = 0.15, min_len: int = 4) -> dict[int, np.ndarray]:
    """Returns {frame: [x, y, diameter, score, track_id]} for frames on a valid ball track.
    P: (F,3,3) panorama transforms (image -> shot reference)."""
    by_frame: dict[int, list] = {}
    for f, _, x1, y1, x2, y2, s in D.balls:
        if s < min_score:
            continue
        d = max(x2 - x1, y2 - y1)
        if d < 3 or d > 90:
            continue
        by_frame.setdefault(int(f), []).append(np.array([(x1 + x2) / 2, (y1 + y2) / 2, d, s]))
    # Person scale per frame (median confident height) to gate implausibly big "balls".
    conf = D.dets[D.dets[:, 6] >= 0.4]
    med_h: dict[int, float] = {}
    if len(conf):
        order = np.argsort(conf[:, 0])
        fr = conf[order, 0].astype(int)
        hs = conf[order, 5] - conf[order, 3]
        cut = np.flatnonzero(np.diff(fr)) + 1
        for g, h in zip(np.split(fr, cut), np.split(hs, cut)):
            med_h[int(g[0])] = float(np.median(h))
    tracks: list[list[tuple[int, np.ndarray, np.ndarray]]] = []
    active: list[int] = []
    for f in sorted(by_frame):
        cands = [c for c in by_frame[f] if c[2] <= 0.45 * med_h.get(f, 1e9)]
        pts = []
        for c in cands:
            M = P[f]
            px = M[0, 0] * c[0] + M[0, 1] * c[1] + M[0, 2]
            py = M[1, 0] * c[0] + M[1, 1] * c[1] + M[1, 2]
            pts.append(np.array([px, py]))
        used = set()
        still = []
        for ti in active:
            tr = tracks[ti]
            lf, _, lp = tr[-1]
            if f - lf > GAP_FRAMES + 1 or D.segment[f] != D.segment[lf]:
                continue
            vel = (tr[-1][2] - tr[-2][2]) / max(tr[-1][0] - tr[-2][0], 1) if len(tr) >= 2 else np.zeros(2)
            pred = lp + vel * (f - lf)
            scale = med_h.get(f, 60.0)
            best, bd = None, 1e9
            for j, p in enumerate(pts):
                if j in used:
                    continue
                d = float(np.linalg.norm(p - pred))
                if d < bd and d <= 1.8 * scale * (f - lf):
                    best, bd = j, d
            if best is not None:
                used.add(best)
                tr.append((f, cands[best], pts[best]))
            still.append(ti)
        for j, p in enumerate(pts):
            if j not in used:
                tracks.append([(f, cands[j], p)])
                still.append(len(tracks) - 1)
        active = still
    out: dict[int, np.ndarray] = {}
    for tid, tr in enumerate(tracks):
        if len(tr) < min_len or np.mean([c[3] for _, c, _ in tr]) < 0.3:
            continue
        span = np.ptp(np.array([p for _, _, p in tr]), axis=0)
        if float(np.hypot(*span)) < 5:  # never moves: a spare ball / false positive
            continue
        for f, c, _ in tr:
            if f not in out or c[3] > out[f][3]:
                out[f] = np.r_[c, tid]
    return out


def team_of(summary_row: dict, kit_min: float) -> str:
    kit = summary_row["kit1"] + 0.5 * summary_row["kit2"]
    if kit >= kit_min:
        return "team"
    shirt = region_hist(summary_row["sig"], "shirt")
    if shirt[PALETTE.index("black")] + shirt[PALETTE.index("darkgrey")] > 0.55:
        return "official_or_unknown"
    return "opponent" if kit < 0.08 else "unknown"


def ball_events(D, T, tl, states: np.ndarray, P: np.ndarray, camera: np.ndarray | None, fps: float,
                kit_min: float = 0.22) -> tuple[list[dict], dict]:
    balls = ball_tracks(D, P)
    F = len(tl.times)
    target_ok = tl.present & np.isin(states, ["CONFIRMED_VISIBLE", "LIKELY_VISIBLE"])
    near = np.zeros(F, bool)
    for f in np.flatnonzero(target_ok):
        b = balls.get(int(f))
        if b is not None and _foot_zone(b[:2], tl.boxes[f]):
            near[f] = True
    # Rows per frame for receivers.
    order = np.argsort(T.rows[:, 0], kind="stable")
    rf = T.rows[order, 0].astype(int)
    team_by_tid = {s["tid"]: team_of(s, kit_min) for s in T.summary}
    events: list[dict] = []
    f = 0
    while f < F:
        if not near[f]:
            f += 1
            continue
        a = f
        while f < F and (near[f] or (f + 1 < F and near[f + 1])):
            f += 1
        b = f  # [a, b)
        frames = [g for g in range(a, b) if near[g]]
        if len(frames) < CONTACT_MIN_FRAMES:
            continue
        track_ids = {int(balls[g][4]) for g in frames}
        motion_change = _direction_change(balls, P, a, b)
        held = (b - a) / fps
        if not motion_change and held < 0.6:
            continue  # ball merely passing near the player: not a contact
        ev = {"type": "carry" if held >= 1.5 else "contact", "start": float(tl.times[a]),
              "end": float(tl.times[b - 1]), "evidenceTimes": [float(tl.times[g]) for g in frames[:: max(1, len(frames) // 5)]],
              "identityState": str(states[a]), "tid": None, "reviewState": "unreviewed",
              "confidence": round(min(1.0, 0.4 + 0.1 * len(frames) + (0.2 if motion_change else 0.0)), 2),
              "confidenceKind": "uncalibrated"}
        events.append(ev)
        # Pass attempt: same ball track leaves the foot zone fast.
        last_tid = int(balls[frames[-1]][4])
        dep = _departure(balls, P, frames[-1], last_tid, fps)
        if dep is None:
            continue
        outcome, receiver_t, evidence = _receive(balls, P, T, order, rf, team_by_tid, tl, dep, last_tid, camera, fps)
        events.append({"type": "pass_attempt", "start": float(tl.times[frames[-1]]),
                       "end": float(receiver_t if receiver_t is not None else tl.times[min(F - 1, dep + int(fps))]),
                       "outcome": outcome, "outcomeEvidence": evidence, "identityState": str(states[a]),
                       "evidenceTimes": [float(tl.times[frames[-1]])], "tid": None, "reviewState": "unreviewed",
                       "confidence": 0.5 if outcome == "unknown" else 0.7, "confidenceKind": "uncalibrated"})
    events += _duel_candidates(balls, T, order, rf, team_by_tid, tl, states, target_ok, fps)
    passes = [e for e in events if e["type"] == "pass_attempt"]
    contacts = [e for e in events if e["type"] in ("contact", "carry")]
    summary = {
        "contactsConfirmedIdentity": sum(1 for e in contacts if e["identityState"] == "CONFIRMED_VISIBLE"),
        "duelCandidates": sum(1 for e in events if e["type"] == "duel_candidate"),
        "tackleCandidates": sum(1 for e in events if e["type"] == "tackle_candidate"),
        "contacts": sum(1 for e in events if e["type"] in ("contact", "carry")),
        "carries": sum(1 for e in events if e["type"] == "carry"),
        "passAttempts": len(passes),
        "completedPasses": sum(1 for e in passes if e["outcome"] == "completed"),
        "incompletePasses": sum(1 for e in passes if e["outcome"] == "incomplete"),
        "unknownOutcomePasses": sum(1 for e in passes if e["outcome"] == "unknown"),
        "ballFramesTracked": len(balls),
        "provenance": "model_estimate_unvalidated",
        "note": "Ball detections are frequently missed for far-away play; counts are lower bounds "
                "and have not been validated against labelled events. Duel/tackle candidates need review "
                "and are never counted as statistics.",
    }
    return events, summary


def _pano(P, f, xy):
    M = P[f]
    return np.array([M[0, 0] * xy[0] + M[0, 1] * xy[1] + M[0, 2], M[1, 0] * xy[0] + M[1, 1] * xy[1] + M[1, 2]])


def _direction_change(balls, P, a, b) -> bool:
    seq = [(g, _pano(P, g, balls[g][:2])) for g in range(max(0, a - 3), b + 3) if g in balls]
    if len(seq) < 4:
        return False
    v = [(p2 - p1) / (g2 - g1) for (g1, p1), (g2, p2) in zip(seq, seq[1:])]
    for v1, v2 in zip(v, v[1:]):
        n1, n2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if max(n1, n2) < 1.0:
            continue
        cosang = float(v1 @ v2 / max(n1 * n2, 1e-9))
        if cosang < 0.85 or abs(n1 - n2) / max(n1, n2) > 0.4:
            return True
    return False


def _departure(balls, P, f_last: int, track_id: int, fps: float) -> int | None:
    seq = [g for g in range(f_last + 1, f_last + int(0.8 * fps) + 1) if g in balls and int(balls[g][4]) == track_id]
    if len(seq) < 3:
        return None
    p0, p1 = _pano(P, f_last, balls[f_last][:2]), _pano(P, seq[-1], balls[seq[-1]][:2])
    scale = max(balls[f_last][2] * 8.0, 20.0)  # ball ~0.22 m -> ~8 diameters per 1.8 m
    speed_bh = float(np.linalg.norm(p1 - p0)) / scale / ((seq[-1] - f_last) / fps)
    return seq[0] if speed_bh >= 1.7 else None  # ~3 m/s


def _receive(balls, P, T, order, rf, team_by_tid, tl, dep, track_id, camera, fps):
    end = min(len(tl.times), dep + int(4 * fps))
    last = dep
    run_team, run_tid, run_len = None, None, 0
    for f in range(dep, end):
        if f not in balls or int(balls[f][4]) != track_id:
            if f - last > GAP_FRAMES:
                return "unknown", None, "ball track interrupted"
            continue
        if camera is not None and camera[f] == "NON_FOOTBALL":
            return "unknown", None, "camera left the play"
        last = f
        lo, hi = np.searchsorted(rf, f), np.searchsorted(rf, f, side="right")
        holder = None
        for r in T.rows[order[lo:hi]]:
            if tl.present[f] and np.allclose(r[3:7], tl.boxes[f], atol=2):
                continue
            if _foot_zone(balls[f][:2], r[3:7]):
                holder = r
                break
        if holder is None:
            run_team, run_len = None, 0
            continue
        team = team_by_tid.get(int(holder[2]), "unknown")
        if team == run_team and int(holder[2]) == run_tid:
            run_len += 1
        else:
            run_team, run_tid, run_len = team, int(holder[2]), 1
        if run_len >= CONTACT_MIN_FRAMES:
            if team == "team":
                return "completed", float(tl.times[f]), "verified"
            if team == "opponent":
                return "incomplete", float(tl.times[f]), "verified"
            return "unknown", float(tl.times[f]), "receiver team unclear"
    return "unknown", None, "no controlled reception observed"


def _reach(ball_xy: np.ndarray, box: np.ndarray, widen: float = 1.5) -> bool:
    x1, y1, x2, y2 = box
    h = max(y2 - y1, 1.0)
    fx = (x1 + x2) / 2
    return abs(ball_xy[0] - fx) <= 0.5 * h * widen and (y2 - 0.45 * h) <= ball_xy[1] <= (y2 + 0.25 * h)


def _duel_candidates(balls, T, order, rf, team_by_tid, tl, states, target_ok, fps) -> list[dict]:
    """Target and an opponent simultaneously within reach of the same tracked ball."""
    F = len(tl.times)
    contest = np.zeros(F, bool)
    opp_holder: dict[int, int] = {}
    for f in np.flatnonzero(target_ok):
        b = balls.get(int(f))
        if b is None or not _reach(b[:2], tl.boxes[f]):
            continue
        lo, hi = np.searchsorted(rf, f), np.searchsorted(rf, f, side="right")
        for r in T.rows[order[lo:hi]]:
            if np.allclose(r[3:7], tl.boxes[f], atol=2) or team_by_tid.get(int(r[2])) != "opponent":
                continue
            if _reach(b[:2], r[3:7]):
                contest[f] = True
                opp_holder[int(f)] = int(r[2])
                break
    out = []
    for a, b_ in _runs_bool(contest):
        if b_ - a < 3:
            continue
        ev = {"type": "duel_candidate", "start": float(tl.times[a]), "end": float(tl.times[b_ - 1]),
              "evidenceTimes": [float(tl.times[g]) for g in range(a, b_, max(1, (b_ - a) // 4))],
              "identityState": str(states[a]), "reviewState": "candidate", "countedInStats": False,
              "confidence": 0.4, "confidenceKind": "uncalibrated"}
        out.append(ev)
        # Tackle: opponent controlled the ball (in his foot zone, >= 2 frames) just before, target after.
        track = int(balls[a][4])
        before = [g for g in range(max(0, a - int(fps)), a) if g in balls and int(balls[g][4]) == track
                  and opp_holder.get(a) is not None and _holder_has(T, order, rf, opp_holder[a], g, balls[g])]
        after = [g for g in range(b_, min(F, b_ + int(fps))) if g in balls and int(balls[g][4]) == track
                 and target_ok[g] and _foot_zone(balls[g][:2], tl.boxes[g])]
        if len(before) >= 2 and len(after) >= 2:
            out.append({**ev, "type": "tackle_candidate", "end": float(tl.times[after[-1]]),
                        "evidence": "opponent control before, target control after on one ball track"})
    return out


def _holder_has(T, order, rf, tid, f, ball) -> bool:
    lo, hi = np.searchsorted(rf, f), np.searchsorted(rf, f, side="right")
    for r in T.rows[order[lo:hi]]:
        if int(r[2]) == tid:
            return _foot_zone(ball[:2], r[3:7])
    return False


def _runs_bool(mask: np.ndarray) -> list[tuple[int, int]]:
    out, a = [], None
    for i, v in enumerate(mask):
        if v and a is None:
            a = i
        elif not v and a is not None:
            out.append((a, i)); a = None  # noqa: E702
    if a is not None:
        out.append((a, len(mask)))
    return out
