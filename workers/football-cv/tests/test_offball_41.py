"""4.1 off-ball observations: measured on confirmed frames only, insufficient below the minimum."""

import numpy as np

from scoutx_tracker.offball import _episodes, offball_observations


def _scene(n=1200, fps=10.0, opp_dx=400.0, state="CONFIRMED_VISIBLE"):
    times = np.arange(n) / fps
    states = np.array([state] * n, dtype=object)
    boxes = np.tile(np.array([1000.0, 400.0, 1050.0, 500.0]), (n, 1))  # 100 px tall target
    present = np.ones(n, bool)
    rows = []
    for f in range(n):
        rows.append([f, f / fps, 1, 1000, 400, 1050, 500])            # the target's own row
        rows.append([f, f / fps, 2, 1000 + opp_dx, 400, 1050 + opp_dx, 500])  # opponent
        rows.append([f, f / fps, 3, 1000 - 150, 400, 1050 - 150, 500])        # team-mate
    return times, states, boxes, present, np.array(rows, float), {1: "team", 2: "opponent", 3: "team"}


def test_measures_free_space_in_body_heights_and_lists_watchable_episodes():
    r = offball_observations(*_scene())
    assert r["status"] == "measured"
    assert r["nearestOpponentBodyHeights"]["median"] == 4.0
    assert r["freeShare"] == 1.0 and r["tightShare"] == 0.0
    assert r["freeEpisodes"] and r["freeEpisodes"][0]["start"] == 0.0
    assert r["nearestTeammateBodyHeights"]["median"] == 1.5


def test_insufficient_without_enough_confirmed_footage():
    r = offball_observations(*_scene(n=300))  # 30 s
    assert r["status"] == "insufficient" and "nearestOpponentBodyHeights" not in r
    r = offball_observations(*_scene(state="LIKELY_VISIBLE"))
    assert r["status"] == "insufficient", "likely identity never feeds observations"


def test_episodes_tolerate_short_gaps_and_need_minimum_length():
    t = np.arange(0, 10, 0.5)
    f = np.array([1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0], bool)
    assert _episodes(t, f, 2.0, 1.0) == [(0.0, 2.0), (5.5, 8.0)]
