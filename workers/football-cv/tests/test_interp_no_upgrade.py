"""Candidate I: an interpolated gap fill is never claimed more strongly than the samples bounding it."""
import numpy as np

from scoutx_tracker import states as S

C, L, A, U = S.CONFIRMED_VISIBLE, S.LIKELY_VISIBLE, S.AMBIGUOUS, S.UNKNOWN


def run(st, ev, present=None):
    st = np.array(st, dtype=object)
    ev = np.array(ev)
    present = np.ones(len(st), bool) if present is None else np.array(present)
    return list(S.cap_interpolated(st, ev, present))


def test_isolated_fill_between_ambiguous_is_not_claimed():
    # IMG_4529 2,040.3 s shape: appearance (AMBIGUOUS under D) | interpolated LIKELY x2 | appearance AMBIGUOUS
    assert run([A, L, L, A], ["appearance", "interpolated", "interpolated", "appearance"]) == [A, A, A, A]


def test_fill_before_a_conflict_is_not_claimed():
    # IMG_4529 1,864.9 s shape: ... | interpolated LIKELY | conflict (read "29")
    assert run([A, L, A], ["appearance", "interpolated", "conflict"]) == [A, A, A]


def test_fill_between_claims_is_kept():
    # legitimate counterexample: a short hole inside a confirmed / anchored stretch stays claimed
    assert run([C, L, C], ["number", "interpolated", "number"]) == [C, L, C]
    assert run([L, L, L, C], ["anchored", "interpolated", "interpolated", "number"]) == [L, L, L, C]


def test_one_sided_claim_is_not_enough():
    assert run([C, L, A], ["number", "interpolated", "appearance"]) == [C, A, A]


def test_never_upgrades_and_ignores_other_evidence():
    st = [A, A, U, L, A]
    ev = ["appearance", "interpolated", "interpolated", "appearance", "appearance"]
    assert run(st, ev) == st  # unclaimed fills untouched; non-interpolated LIKELY untouched


def test_recording_edges():
    assert run([L, C], ["interpolated", "number"]) == [L, C]
    assert run([L, A], ["interpolated", "appearance"]) == [A, A]
    assert run([L], ["interpolated"]) == [A]


def test_flag_is_off_by_default():
    assert S.INTERP_NO_UPGRADE is False
