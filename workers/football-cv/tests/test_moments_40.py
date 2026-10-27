"""Video Intelligence 4.0: moment clip windows (context-aware, target-only, no invented events)."""

import numpy as np

from scoutx_tracker.invariants import check
from scoutx_tracker.moments import MAX_CLIP, build_moments, clip_window, _true_cuts

FPS = 10.0


def _base(n_sec=120.0):
    times = np.arange(0, n_sec, 1 / FPS)
    n = len(times)
    states = np.array(["CONFIRMED_VISIBLE"] * n, dtype=object)
    present = np.ones(n, bool)
    boxes = np.tile(np.array([100.0, 200.0, 140.0, 300.0]), (n, 1))
    segment = np.ones(n, np.int64)
    period = np.array(["play"] * n, dtype=object)
    return times, states, present, boxes, segment, period


def test_clip_never_crosses_a_camera_cut():
    times, _s, _p, _b, segment, period = _base()
    segment[int(48 * FPS):] = 2  # cut at 48 s
    cuts = _true_cuts(segment, set())
    c0, c1 = clip_window("contact", 49.0, 49.5, times, cuts, period)
    assert c0 >= 48.0 and c1 >= 49.5


def test_chunk_join_is_not_a_cut():
    times, _s, _p, _b, segment, period = _base()
    segment[int(48 * FPS):] = 2
    cuts = _true_cuts(segment, {int(48 * FPS)})
    c0, _c1 = clip_window("contact", 49.0, 49.5, times, cuts, period)
    assert c0 < 48.0


def test_clip_stays_out_of_non_play_and_respects_bounds():
    times, _s, _p, _b, segment, period = _base()
    period[: int(50 * FPS)] = "non_play"
    cuts = _true_cuts(segment, set())
    c0, c1 = clip_window("pass_attempt", 51.0, 60.0, times, cuts, period)
    assert c0 >= 50.0
    assert c1 - c0 <= MAX_CLIP + 1e-6
    # very short action still gets a watchable window
    c0, c1 = clip_window("contact", 80.0, 80.1, times, cuts, period)
    assert c1 - c0 >= 4.0 - 1e-6


def test_moments_only_from_claimed_events_and_candidates_kept_separate():
    times, states, present, boxes, segment, period = _base()
    states[: int(30 * FPS)] = "AMBIGUOUS"
    events = [
        {"type": "contact", "start": 10.0, "end": 10.4, "identityState": "AMBIGUOUS"},      # not the target -> dropped
        {"type": "contact", "start": 40.0, "end": 40.4, "identityState": "CONFIRMED_VISIBLE"},
        {"type": "pass_attempt", "start": 41.0, "end": 43.0, "identityState": "LIKELY_VISIBLE", "outcome": "unknown"},
        {"type": "duel_candidate", "start": 42.0, "end": 42.5, "identityState": "CONFIRMED_VISIBLE"},
    ]
    ms = build_moments(times, states, present, boxes, segment, period, events)
    action = [m for m in ms if m["kind"] != "spell"]
    assert all(10 not in [round(m["start"]) for m in action] for _ in [0])
    merged = next(m for m in action if not m["candidate"])
    assert merged["kind"] == "pass_attempt" and set(merged["kinds"]) == {"pass_attempt", "contact"}
    assert merged["identityState"] == "LIKELY_VISIBLE"  # weakest claimed state of the merged actions
    cand = [m for m in action if m["candidate"]]
    assert len(cand) == 1 and cand[0]["kind"] == "duel_candidate"
    assert all(m["indicator"] and 0 <= m["indicator"][0][1] <= 1 for m in action)


def test_spells_fill_in_when_no_ball_events_and_report_invariants_hold():
    times, states, present, boxes, segment, period = _base()
    states[: int(60 * FPS)] = "AMBIGUOUS"
    states[int(20 * FPS): int(26 * FPS)] = "LIKELY_VISIBLE"
    states[int(40 * FPS): int(42 * FPS)] = "LIKELY_VISIBLE"  # too short to be a moment
    ms = build_moments(times, states, present, boxes, segment, period, [])
    assert ms and all(m["kind"] == "spell" for m in ms)
    likely = [m for m in ms if m["identityState"] == "LIKELY_VISIBLE"]
    assert len(likely) == 1 and 19.0 <= likely[0]["start"] <= 21.0
    assert all(m["clipStart"] >= 60.0 for m in ms if m["identityState"] == "CONFIRMED_VISIBLE")
    report = {"coverage": {}, "events": [], "moments": ms}
    assert check(report) == []
    bad = {"coverage": {}, "events": [], "moments": [{**ms[0], "kind": "contact", "eventIndices": []}]}
    assert "moments: action moment without a measured event" in check(bad)


def test_thumbnail_only_from_crop_inside_clip():
    times, states, present, boxes, segment, period = _base()
    events = [{"type": "contact", "start": 40.0, "end": 40.4, "identityState": "CONFIRMED_VISIBLE"}]
    ms = build_moments(times, states, present, boxes, segment, period, events,
                       crop_times=[(5.0, "/far.jpg"), (39.5, "/near.jpg")])
    first = next(m for m in ms if m["kind"] == "contact")
    assert first["thumbCrop"] == "/near.jpg"
    ms = build_moments(times, states, present, boxes, segment, period, events, crop_times=[(5.0, "/far.jpg")])
    assert next(m for m in ms if m["kind"] == "contact")["thumbCrop"] is None


def test_target_only_moments_strip_crop_paths_and_cap_thumbnails():
    from app.tracking_v3 import MAX_MOMENT_THUMBS, target_only

    ms = [{"id": f"m_{i}", "kind": "spell", "kinds": ["spell"], "start": i, "end": i + 6, "clipStart": i,
           "clipEnd": i + 6, "identityState": "CONFIRMED_VISIBLE", "candidate": False, "eventIndices": [],
           "indicator": [], "thumbCrop": "/secret/path/crops/000001_7.jpg", "tid": 7}
          for i in range(MAX_MOMENT_THUMBS + 3)]
    out = target_only({"schema": "x", "moments": ms, "analysedRange": {"startSec": 0, "endSec": 300, "parts": 1}})
    text = str(out["moments"])
    assert "secret" not in text and "thumbCrop" not in text and "'tid'" not in text and "eventIndices" not in text
    assert len(out["moments"]) == MAX_MOMENT_THUMBS + 3
    assert all(m["imageJpegBase64"] is None for m in out["moments"])  # unreadable crops -> no image
    assert out["analysedRange"]["endSec"] == 300
