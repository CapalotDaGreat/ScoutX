"""Per-frame target identity states and the coverage partition.

States (exactly one per analysed frame, highest priority first):

  NON_MATCH_PERIOD     Frame lies in a non-play period (pre-match, half-time, post-match), from
                       detection or the user's kickoff/half-time/full-time corrections.
  CONFIRMED_OFF_PITCH  The user said the player was off the pitch (substituted, injured) then.
  CONFIRMED_VISIBLE    The target is in view and the tracklet carries hard evidence: the target
                       number was read on it, or the user confirmed it ("that's me").
  LIKELY_VISIBLE       The target is in view according to appearance + motion continuity, the
                       uncalibrated identity score is >= LIKELY and no competing candidate of
                       similar score is in view at the same moment.
  AMBIGUOUS            Either the chosen candidate scores below LIKELY, another plausible
                       candidate (score >= COMPETITOR) is in view at the same time, or the
                       followed box carries a nearby read that cannot be the target number.
  OFF_CAMERA           Reserved: requires positive evidence that the player is on the pitch but
                       outside the camera view (e.g. calibrated full-pitch view without him).
                       The handheld/follow-cam pipeline cannot establish this, so it is never
                       emitted automatically - such frames are UNKNOWN.
  UNKNOWN              No usable evidence: target not identified, or camera not showing play.

Scores are UNCALIBRATED (not probabilities) until calibrated on labelled footage.
"""

from __future__ import annotations

import numpy as np

CONFIRMED_VISIBLE = "CONFIRMED_VISIBLE"
LIKELY_VISIBLE = "LIKELY_VISIBLE"
AMBIGUOUS = "AMBIGUOUS"
OFF_CAMERA = "OFF_CAMERA"
CONFIRMED_OFF_PITCH = "CONFIRMED_OFF_PITCH"
NON_MATCH_PERIOD = "NON_MATCH_PERIOD"
UNKNOWN = "UNKNOWN"
ALL_STATES = (CONFIRMED_VISIBLE, LIKELY_VISIBLE, AMBIGUOUS, OFF_CAMERA, CONFIRMED_OFF_PITCH, NON_MATCH_PERIOD, UNKNOWN)

LIKELY = 0.75
COMPETITOR = 0.35


def frame_states(T, res, tl, period_kind: np.ndarray, camera: np.ndarray | None = None,
                 off_pitch: list[tuple[float, float]] | None = None,
                 likely: float = LIKELY, competitor: float = COMPETITOR) -> tuple[np.ndarray, np.ndarray]:
    """Returns (state per frame, competitor score per frame)."""
    F = len(tl.times)
    states = np.full(F, UNKNOWN, dtype=object)
    chosen = set(res.chosen)
    # Highest competing candidate score visible at each frame (candidates not in the chain).
    comp = np.zeros(F)
    for k, sc in res.score.items():
        if k in chosen or sc < competitor:
            continue
        fr = T.rows[T.by_tid[T.summary[k]["tid"]], 0].astype(int)
        comp[fr] = np.maximum(comp[fr], sc)
    conf = np.asarray(tl.conf, float)
    ev = np.asarray(tl.evidence).astype(str)
    present = np.asarray(tl.present, bool)
    hard = present & np.isin(ev, ["number", "anchor"])
    contrary = present & (ev == "conflict")
    soft = present & ~hard & ~contrary
    states[soft & (conf >= likely) & (comp < competitor)] = LIKELY_VISIBLE
    states[soft & ((conf < likely) | (comp >= competitor))] = AMBIGUOUS
    states[hard] = CONFIRMED_VISIBLE
    # A read on the followed box that cannot be the target: never claimed, at best ambiguous.
    states[contrary] = AMBIGUOUS
    states[~present & (comp >= competitor)] = AMBIGUOUS
    if camera is not None:
        # A frame where the camera shows no football can't hold a visible target claim.
        states[(camera == "NON_FOOTBALL") & ~hard] = UNKNOWN
    for a, b in off_pitch or []:
        states[(tl.times >= a) & (tl.times < b)] = CONFIRMED_OFF_PITCH
    states[period_kind == "non_play"] = NON_MATCH_PERIOD
    return states, comp


def coverage(times: np.ndarray, states: np.ndarray, period_kind: np.ndarray, camera: np.ndarray | None) -> dict:
    """Exact partition of the recording (seconds). Every frame lands in one leaf:

    recording = nonMatch + offPitch + match
    match     = unobserved (camera not on play) + analysed
    analysed  = confirmed + likely + ambiguous + notIdentified
    """
    dt = float(np.median(np.diff(times))) if len(times) > 1 else 0.1
    n = len(times)
    non_match = period_kind == "non_play"
    off = (states == CONFIRMED_OFF_PITCH) & ~non_match
    rest = ~non_match & ~off
    unobs = rest & ((period_kind == "unobserved") | ((camera == "NON_FOOTBALL") if camera is not None else False))
    unobs &= states != CONFIRMED_VISIBLE
    analysed = rest & ~unobs

    def sec(mask) -> float:
        return round(float(np.count_nonzero(mask)) * dt, 1)

    out = {
        "recordingSec": round(n * dt, 1),
        "nonMatchSec": sec(non_match),
        "offPitchSec": sec(off),
        "matchSec": sec(rest),
        "unobservedSec": sec(unobs),
        "analysedSec": sec(analysed),
        "confirmedVisibleSec": sec(analysed & (states == CONFIRMED_VISIBLE)),
        "likelyVisibleSec": sec(analysed & (states == LIKELY_VISIBLE)),
        "ambiguousSec": sec(analysed & (states == AMBIGUOUS)),
        "notIdentifiedSec": sec(analysed & np.isin(states, [UNKNOWN, OFF_CAMERA])),
        "denominators": {
            "visiblePctOfAnalysed": "(confirmed + likely) / analysed match time (camera on play)",
            "note": "Percentages of the recording are not percentages of the player's playing time.",
        },
    }
    a = max(out["analysedSec"], 1e-9)
    out["visiblePctOfAnalysed"] = round(100 * (out["confirmedVisibleSec"] + out["likelyVisibleSec"]) / a, 1)
    return out
