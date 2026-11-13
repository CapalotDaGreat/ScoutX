"""2026-11-14: a "this is me" tap resolves to exactly one player or is reported as unresolved; it never picks the
nearer of two overlapping players, and results stay aligned with the input points."""

from __future__ import annotations

import numpy as np

from scoutx_tracker.identity import locate, locate_points


def _setup(boxes_by_tid: dict[int, tuple[float, float, float, float]], t: float = 10.0):
    rows, summary, by_tid = [], [], {}
    for tid, (x1, y1, x2, y2) in boxes_by_tid.items():
        by_tid[tid] = []
        for dt in (-0.1, 0.0, 0.1):
            by_tid[tid].append(len(rows))
            rows.append([0, t + dt, tid, x1, y1, x2, y2])
        summary.append({"tid": tid, "t0": t - 0.1, "t1": t + 0.1})
    by_tid = {k: np.array(v) for k, v in by_tid.items()}
    return summary, np.array(rows, dtype=float), by_tid


def test_tap_inside_one_player_resolves():
    summary, rows, by_tid = _setup({1: (100, 100, 150, 250), 2: (400, 100, 450, 250)})
    assert locate_points(summary, rows, by_tid, [(10.0, 120, 150)]) == [(0, "inside")]


def test_tap_between_two_overlapping_players_is_ambiguous_not_the_nearer_one():
    summary, rows, by_tid = _setup({1: (100, 100, 160, 250), 2: (130, 110, 190, 260)})
    # inside both boxes, only slightly closer to player 1's centre: the old locator chose player 1
    (k, why), = locate_points(summary, rows, by_tid, [(10.0, 142, 180)])
    assert k is None and why.startswith("ambiguous")
    assert locate(summary, rows, by_tid, [(10.0, 142, 180)]) == []


def test_answer_at_the_centre_of_an_overlapping_box_still_resolves():
    # a review answer points at the centre of the box it asked about
    summary, rows, by_tid = _setup({1: (100, 100, 160, 250), 2: (130, 110, 190, 260)})
    (k, why), = locate_points(summary, rows, by_tid, [(10.0, 160, 185)])
    assert k == 1 and "nearest of overlapping" in why


def test_inner_box_wins_over_a_padded_neighbour():
    # tap inside player 2's own box and only inside player 1's padded margin
    summary, rows, by_tid = _setup({1: (100, 100, 150, 250), 2: (155, 100, 205, 250)})
    assert locate_points(summary, rows, by_tid, [(10.0, 160, 150)]) == [(1, "inside")]


def test_padded_only_tap_resolves_when_unique():
    summary, rows, by_tid = _setup({1: (100, 100, 150, 250)})
    assert locate_points(summary, rows, by_tid, [(10.0, 155, 150)]) == [(0, "near")]


def test_results_stay_aligned_with_points():
    summary, rows, by_tid = _setup({1: (100, 100, 150, 250), 2: (400, 100, 450, 250)})
    pts = [(10.0, 700, 700), (10.0, 420, 150), (99.0, 120, 150)]
    assert locate_points(summary, rows, by_tid, pts) == [(None, "no player at the tap"), (1, "inside"),
                                                           (None, "no player at the tap")]
    assert locate(summary, rows, by_tid, pts) == [1]
