"""Per-frame target identity states and the coverage partition.

States (exactly one per analysed frame, highest priority first):

  NON_MATCH_PERIOD     Frame lies in a non-play period (pre-match, half-time, post-match), from
                       detection or the user's kickoff/half-time/full-time corrections.
  CONFIRMED_OFF_PITCH  The user said the player was off the pitch (substituted, injured) then.
  CONFIRMED_VISIBLE    The target is in view and the tracklet carries hard evidence: the target
                       number was read on it, or the user confirmed it ("that's me").
  LIKELY_VISIBLE       The target is in view according to appearance + motion continuity, the
                       uncalibrated identity score is >= LIKELY and no competing candidate of
                       similar score is in view at the same moment; or (5.1, "anchored") the
                       followed person is joined to hard evidence by clean tracker hand-offs or
                       clear team-mate-contact links within 30 s of it.
  AMBIGUOUS            Either the chosen candidate scores below LIKELY, another plausible
                       candidate (score >= COMPETITOR) is in view at the same time, the
                       followed box carries a nearby read that cannot be the target number, or
                       (5.1) the chain reached it through a team-mate contact with an unclear
                       outcome and no new hard evidence since.
  OFF_CAMERA           Reserved: requires positive evidence that the player is on the pitch but
                       outside the camera view (e.g. calibrated full-pitch view without him).
                       The handheld/follow-cam pipeline cannot establish this, so it is never
                       emitted automatically - such frames are UNKNOWN.
  UNKNOWN              No usable evidence: target not identified, or camera not showing play.

Scores are UNCALIBRATED (not probabilities) until calibrated on labelled footage.
"""

from __future__ import annotations

import os

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
# 5.3 CANDIDATE D (off by default; SCOUTX_APPEARANCE_ONLY_LIKELY=0 enables it): no LIKELY claim from appearance alone.
# A chain member with evidence "appearance" (not joined to hard evidence: not number/anchor/anchored/interpolated)
# gets conf = sigmoid(app*rel), i.e. its own appearance posterior plus +1 logit for being on the chain - but its
# chain membership was chosen from that same appearance score. Measured on IMG_4809 (all labelled frames: default
# full match, default and HLG-reference interval runs): 0 correct appearance-only LIKELY claims, 19 wrong-player and
# 12 unmatched; every correct claim came from number / anchored / interpolated evidence. With the flag such frames
# are AMBIGUOUS. Thresholds are unchanged; identity resolution itself is unchanged (states only).
APPEARANCE_ONLY_LIKELY = os.environ.get("SCOUTX_APPEARANCE_ONLY_LIKELY", "1") != "0"
# 5.3 CANDIDATE I (off by default; SCOUTX_INTERP_NO_UPGRADE=1 enables it): a gap filled by interpolation between two
# chain tracklets (stats.timeline, evidence "interpolated") may not be claimed more strongly than the samples that
# bound it. Before: the fill took conf = min(conf before, tracklet confidence) and went through the generic
# conf >= LIKELY test, so a 1-2 sample gap between two AMBIGUOUS (appearance-only under D, contact_unclear or
# conflict) samples became an isolated LIKELY claim. Found 2026-11-18 on held-out IMG_4529 under T+D+C (#12 at
# 2,040.3-2,041.4 s, #17 at 2,523.6 s: all four wrong-player LIKELY samples were interpolated fills bordered by
# AMBIGUOUS); the same pattern exists on development IMG_4809 E6 (51.8 / 1,299.6 / 1,831.4 s, unlabelled frames).
INTERP_NO_UPGRADE = os.environ.get("SCOUTX_INTERP_NO_UPGRADE", "0") == "1"
_CLAIMS = (CONFIRMED_VISIBLE, LIKELY_VISIBLE)


def cap_interpolated(states: np.ndarray, ev: np.ndarray, present: np.ndarray) -> np.ndarray:
    """Interpolated runs stay claimed only when both bounding samples are claims (or the run touches an end of the
    recording and its one bounding sample is a claim). Never upgrades anything; only claim -> AMBIGUOUS."""
    out = states.copy()
    n = len(states)
    i = 0
    while i < n:
        if present[i] and ev[i] == "interpolated" and states[i] in _CLAIMS:
            j = i
            while j + 1 < n and present[j + 1] and ev[j + 1] == "interpolated":
                j += 1
            before = states[i - 1] if i > 0 else None
            after = states[j + 1] if j + 1 < n else None
            bounds = [b for b in (before, after) if b is not None]
            if not bounds or any(b not in _CLAIMS for b in bounds):
                out[i:j + 1] = np.where(np.isin(states[i:j + 1], _CLAIMS), AMBIGUOUS, states[i:j + 1])
            i = j + 1
        else:
            i += 1
    return out


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
    # 5.1: reached through a team-mate contact whose outcome is unclear -> never likely
    unclear = soft & (ev == "contact_unclear")
    # 5.1 anchored continuity: joined to hard evidence by clean hand-offs / clear contact links
    # within ANCHOR_SEC -> LIKELY whatever look-alikes are in view (never confirmed)
    anchored = soft & (ev == "anchored")
    rest = soft & ~unclear & ~anchored
    states[rest & (conf >= likely) & (comp < competitor)] = LIKELY_VISIBLE
    states[rest & ((conf < likely) | (comp >= competitor))] = AMBIGUOUS
    if not APPEARANCE_ONLY_LIKELY:
        states[rest & (ev == "appearance")] = AMBIGUOUS
    states[unclear] = AMBIGUOUS
    states[anchored] = LIKELY_VISIBLE
    states[hard] = CONFIRMED_VISIBLE
    # A read on the followed box that cannot be the target: never claimed, at best ambiguous.
    states[contrary] = AMBIGUOUS
    states[~present & (comp >= competitor)] = AMBIGUOUS
    if INTERP_NO_UPGRADE:
        states = cap_interpolated(states, ev, present)
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
