"""Player moments: watchable, context-aware clip windows around the target's own actions.

A moment is built only from material the engine already measured for the TARGET:
  * ball events on frames where the target is CONFIRMED_VISIBLE or LIKELY_VISIBLE
    (contacts, carries, pass attempts; duel/tackle *candidates* stay flagged for review), and
  * on-camera spells: stretches of several seconds where the player is CONFIRMED (shown as
    confirmed) or only LIKELY identified (shown as "needs your review" - the owner's answer on
    such a moment becomes identity feedback for this match). A recording with poor ball
    visibility therefore still yields moments the player can watch.

Clip boundaries are context-aware rather than a fixed +/- N seconds:
  * a lead-in before the action and an outcome window after it (pass -> until the receiver),
  * never across a camera cut (a clip that jumps to a different shot is confusing),
  * never into a non-play period (half-time, warm-up),
  * clamped to [MIN_CLIP, MAX_CLIP], overlapping moments in the same shot are merged.

Nothing here creates a football event: moments only re-package events and identity spans that
already exist, and keep their identity state and candidate flag.
"""

from __future__ import annotations

import numpy as np

CLAIMED = ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")
# seconds before / after the action; pass and duel windows extend to the outcome
LEAD = {"contact": 4.0, "carry": 3.0, "pass_attempt": 4.0, "duel_candidate": 4.0, "tackle_candidate": 4.0, "spell": 0.0}
TAIL = {"contact": 3.0, "carry": 2.0, "pass_attempt": 2.0, "duel_candidate": 3.0, "tackle_candidate": 3.0, "spell": 0.0}
MIN_CLIP, MAX_CLIP = 4.0, 20.0
SPELL_MIN_SEC = 4.0
MAX_SPELLS = {"CONFIRMED_VISIBLE": 16, "LIKELY_VISIBLE": 24}
MAX_MOMENTS = 80
TRACK_HZ = 2.0
# merged-moment headline: the most informative action wins
PRIORITY = ["pass_attempt", "carry", "contact", "tackle_candidate", "duel_candidate", "spell"]


def _true_cuts(segment: np.ndarray, chunk_starts: set[int]) -> np.ndarray:
    """Frame indices where the camera shot changes (stage-1 chunk joins are not cuts)."""
    ch = np.flatnonzero(np.diff(segment) != 0) + 1
    return np.array([c for c in ch if int(c) not in chunk_starts], dtype=np.int64)


def _shot_bounds(f: int, cuts: np.ndarray, n: int) -> tuple[int, int]:
    """[a, b) frame range of the camera shot containing frame f."""
    i = int(np.searchsorted(cuts, f, side="right"))
    a = int(cuts[i - 1]) if i > 0 else 0
    b = int(cuts[i]) if i < len(cuts) else n
    return a, b


def _play_bounds(f: int, period_kind: np.ndarray) -> tuple[int, int]:
    """Frame range around f that is not a non-play period."""
    n = len(period_kind)
    a = f
    while a > 0 and period_kind[a - 1] != "non_play":
        a -= 1
    b = f + 1
    while b < n and period_kind[b] != "non_play":
        b += 1
    return a, b


def clip_window(kind: str, start: float, end: float, times: np.ndarray, cuts: np.ndarray,
                period_kind: np.ndarray) -> tuple[float, float]:
    """Context-aware [clipStart, clipEnd] (seconds) for an action spanning [start, end]."""
    n = len(times)
    fa = int(np.clip(np.searchsorted(times, start), 0, n - 1))
    fb = int(np.clip(np.searchsorted(times, end), 0, n - 1))
    sa, sb = _shot_bounds(fa, cuts, n)
    pa, pb = _play_bounds(fa, period_kind)
    lo_f, hi_f = max(sa, pa), min(sb, pb) - 1
    lo, hi = float(times[lo_f]), float(times[max(lo_f, hi_f)])
    c0 = max(lo, start - LEAD.get(kind, 3.0))
    c1 = min(hi, max(end, float(times[fb])) + TAIL.get(kind, 3.0))
    if c1 - c0 > MAX_CLIP:  # keep the action itself in view
        mid = (start + min(end, start + MAX_CLIP - 2.0)) / 2
        c0 = max(lo, mid - MAX_CLIP / 2)
        c1 = min(hi, c0 + MAX_CLIP)
    if c1 - c0 < MIN_CLIP:  # grow symmetrically inside the shot if possible
        need = MIN_CLIP - (c1 - c0)
        c0 = max(lo, c0 - need / 2)
        c1 = min(hi, c0 + MIN_CLIP)
    return round(c0, 2), round(c1, 2)


def _spells(times: np.ndarray, states: np.ndarray, present: np.ndarray, cuts: np.ndarray,
            state: str = "CONFIRMED_VISIBLE") -> list[tuple[float, float]]:
    ok = present & (states == state)
    cut_set = set(int(c) for c in cuts)
    out, f, n = [], 0, len(times)
    while f < n:
        if not ok[f]:
            f += 1
            continue
        a = f
        while f + 1 < n and ok[f + 1] and (f + 1) not in cut_set:
            f += 1
        if times[f] - times[a] >= SPELL_MIN_SEC:
            out.append((float(times[a]), float(times[f])))
        f += 1
    out.sort(key=lambda s: s[1] - s[0], reverse=True)
    return out[:MAX_SPELLS[state]]


def _indicator(times, boxes, present, states, c0, c1, width, height) -> list[list[float]]:
    """Normalised target box track inside the clip (only on claimed frames), ~2 Hz."""
    idx = np.flatnonzero((times >= c0) & (times <= c1) & present & np.isin(states, CLAIMED))
    out, last = [], -1e9
    for f in idx:
        if times[f] - last < 1.0 / TRACK_HZ:
            continue
        x1, y1, x2, y2 = boxes[f]
        if not np.all(np.isfinite(boxes[f])):
            continue
        out.append([round(float(times[f]), 2), round(x1 / width, 4), round(y1 / height, 4),
                    round((x2 - x1) / width, 4), round((y2 - y1) / height, 4)])
        last = times[f]
    return out[:60]


def build_moments(times: np.ndarray, states: np.ndarray, present: np.ndarray, boxes: np.ndarray,
                  segment: np.ndarray, period_kind: np.ndarray, events: list[dict],
                  chunk_starts: set[int] | None = None, crop_times: list[tuple[float, str]] | None = None,
                  width: int = 1920, height: int = 1080) -> list[dict]:
    """Moments sorted by time. `crop_times` = (time, path) of TARGET close-up crops for thumbnails."""
    times = np.asarray(times, float)
    states = np.asarray(states).astype(str)
    cuts = _true_cuts(np.asarray(segment), chunk_starts or set())
    raw = []
    for i, e in enumerate(events):
        if e.get("identityState") not in CLAIMED:
            continue
        c0, c1 = clip_window(e["type"], float(e["start"]), float(e["end"]), times, cuts, period_kind)
        raw.append({"kinds": [e["type"]], "events": [i], "start": float(e["start"]), "end": float(e["end"]),
                    "clipStart": c0, "clipEnd": c1, "states": [e["identityState"]],
                    "candidate": e["type"].endswith("_candidate"), "outcome": e.get("outcome")})
    covered = [(m["clipStart"], m["clipEnd"]) for m in raw]
    for state in ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE"):
        for a, b in _spells(times, states, present, cuts, state):
            if any(a < c1 and b > c0 for c0, c1 in covered):
                continue  # an action moment already shows this stretch
            c0, c1 = clip_window("spell", a, min(b, a + MAX_CLIP), times, cuts, period_kind)
            raw.append({"kinds": ["spell"], "events": [], "start": a, "end": b, "clipStart": c0, "clipEnd": c1,
                        "states": [state], "candidate": False, "outcome": None})
            covered.append((c0, c1))
    raw.sort(key=lambda m: m["clipStart"])
    merged: list[dict] = []
    for m in raw:
        prev = merged[-1] if merged else None
        same_shot = prev is not None and not np.any((cuts > np.searchsorted(times, prev["clipStart"]))
                                                   & (cuts <= np.searchsorted(times, m["clipStart"])))
        # candidates never merge with confirmed actions: they keep their own review flag
        if prev and same_shot and m["clipStart"] <= prev["clipEnd"] and prev["candidate"] == m["candidate"] \
                and max(prev["clipEnd"], m["clipEnd"]) - prev["clipStart"] <= MAX_CLIP:
            prev["kinds"] += m["kinds"]
            prev["events"] += m["events"]
            prev["states"] += m["states"]
            prev["end"] = max(prev["end"], m["end"])
            prev["clipEnd"] = max(prev["clipEnd"], m["clipEnd"])
            prev["outcome"] = prev["outcome"] or m["outcome"]
        else:
            merged.append(dict(m))
    out = []
    for m in merged[:MAX_MOMENTS]:
        kinds = sorted(set(m["kinds"]), key=PRIORITY.index)
        state = "CONFIRMED_VISIBLE" if all(s == "CONFIRMED_VISIBLE" for s in m["states"]) else "LIKELY_VISIBLE"
        thumb = None
        if crop_times:
            best = min(crop_times, key=lambda c: abs(c[0] - m["start"]))
            if m["clipStart"] - 0.5 <= best[0] <= m["clipEnd"] + 0.5:
                thumb = best[1]
        out.append({
            "id": f"m_{int(round(m['clipStart'] * 10))}",
            "kind": kinds[0], "kinds": kinds,
            "start": round(m["start"], 2), "end": round(m["end"], 2),
            "clipStart": m["clipStart"], "clipEnd": m["clipEnd"],
            "identityState": state, "candidate": bool(m["candidate"]),
            **({"outcome": m["outcome"]} if m["outcome"] else {}),
            "eventIndices": m["events"],
            "indicator": _indicator(times, boxes, present, states, m["clipStart"], m["clipEnd"], width, height),
            "thumbCrop": thumb,
        })
    return out
