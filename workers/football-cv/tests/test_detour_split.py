"""5.3 one-frame detour through a detector merge (crossings.detour_rows, SCOUTX_DETOUR_SPLIT).

Faithful synthetic of IMG_4809 reference_i0225 E4: track A briefly lands on paused same-kit track B,
then returns to A's path while B resumes on the detour box. Contact/steal miss the jump when B's
pause-edge kit dips below MATE_KIT.
"""
import numpy as np
import pytest

from scoutx_tracker import crossings
from scoutx_tracker.crossings import detour_rows, split_at_contacts, steal_rows


def _rows(tracks):
    out = []
    for tid, rs in tracks.items():
        for f, *b in rs:
            out.append([f, f / 10.0, tid, *b, 0.9, 0])
    R = np.array(out, float)
    R[:, 8] = np.arange(len(R))
    return R


def _e4_scene():
    """A runs left; at frame 21 jumps onto B's box; at 22 returns left. B pauses 21 and resumes on A's detour."""
    # A frames 18-20 moving left; 21 = B's location; 22 back on A's path (no overlap with 21).
    A = [
        (18, 200, 100, 260, 300),
        (19, 180, 100, 240, 300),
        (20, 160, 100, 220, 300),   # own at 20
        (21, 300, 100, 360, 300),   # detour onto B
        (22, 140, 100, 200, 300),   # return (IoU with 21 ~ 0)
        (23, 120, 100, 180, 300),
    ]
    B = [
        (18, 320, 100, 380, 300),
        (19, 310, 100, 370, 300),
        (20, 300, 100, 360, 300),   # last before pause
        # no row at 21
        (22, 305, 100, 365, 300),   # resume on detour box
        (23, 310, 100, 370, 300),
    ]
    return _rows({1: A, 2: B})


def test_detour_detected_when_steal_misses_low_kit_pause_edge():
    R = _e4_scene()
    kit = np.full(len(R), 0.8)
    # Pause-edge kit for B@20 dips below MATE_KIT so steal_rows cannot use q.
    kit[R[:, 2] == 2] = 0.8
    kit[(R[:, 2] == 2) & (R[:, 0] == 20)] = 0.2
    assert steal_rows(R, kit) == []
    hits = detour_rows(R, kit)
    assert len(hits) == 1
    mid, q, nxt = hits[0]
    assert int(R[mid, 0]) == 21 and int(R[mid, 2]) == 1
    assert int(R[q, 0]) == 20 and int(R[q, 2]) == 2
    assert int(R[nxt, 0]) == 22 and int(R[nxt, 2]) == 1


def test_no_detour_for_valid_continuation_or_other_kit():
    kit = lambda R: np.full(len(R), 0.8)  # noqa: E731
    # Continuous own path: mid continues to nxt
    R = _rows({1: [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(10)],
               2: [(f, 500, 100, 560, 300) for f in range(10)]})
    assert detour_rows(R, kit(R)) == []
    # Opponent kit never qualifies via median
    R = _e4_scene()
    k = np.where(R[:, 2] == 2, 0.0, 0.8)
    assert detour_rows(R, k) == []


def test_split_isolates_detour_row(monkeypatch):
    monkeypatch.setattr(crossings, "DETOUR_SPLIT", True)
    monkeypatch.setattr(crossings, "STEAL_SPLIT", True)
    monkeypatch.setattr(crossings, "EXCHANGE_SPLIT", False)
    monkeypatch.setattr(crossings, "RESUME_SPLIT", False)
    R = _e4_scene()
    kit = np.full(len(R), 0.8)
    kit[(R[:, 2] == 2) & (R[:, 0] == 20)] = 0.2
    sigs = np.zeros((len(R), 80), np.float32)
    sigs[:, 0] = 1.0
    cs = split_at_contacts(R, kit, sigs, R[:, 1], 10.0)
    # The row that was originally track 1 at frame 21 is now a singleton tid.
    orig_mid = next(i for i in range(len(R)) if int(R[i, 0]) == 21 and int(R[i, 2]) == 1)
    orphan_tid = int(cs.rows[orig_mid, 2])
    assert int(np.sum(cs.rows[:, 2] == orphan_tid)) == 1
    # Pre (frame <= 20) and post (frame >= 22) of origin-1 are different tids, neither the orphan.
    pre = {int(cs.rows[i, 2]) for i in range(len(R)) if int(R[i, 2]) == 1 and int(R[i, 0]) <= 20}
    post = {int(cs.rows[i, 2]) for i in range(len(R)) if int(R[i, 2]) == 1 and int(R[i, 0]) >= 22}
    assert len(pre) == 1 and len(post) == 1
    assert orphan_tid not in pre and orphan_tid not in post
    assert pre != post


def test_flag_off_keeps_baseline(monkeypatch):
    monkeypatch.setattr(crossings, "DETOUR_SPLIT", False)
    R = _e4_scene()
    kit = np.full(len(R), 0.8)
    kit[(R[:, 2] == 2) & (R[:, 0] == 20)] = 0.2
    sigs = np.zeros((len(R), 80), np.float32)
    sigs[:, 0] = 1.0
    cs = split_at_contacts(R, kit, sigs, R[:, 1], 10.0)
    assert sorted(np.unique(cs.rows[:, 2]).astype(int)) == [1, 2]


def test_release_default_is_off(monkeypatch):
    """Full-match resolve changed claims away from the E4 crossing, so DETOUR stays opt-in."""
    monkeypatch.delenv("SCOUTX_DETOUR_SPLIT", raising=False)
    import importlib
    from scoutx_tracker import crossings as crossings_mod
    assert importlib.reload(crossings_mod).DETOUR_SPLIT is False
    monkeypatch.setenv("SCOUTX_DETOUR_SPLIT", "1")
    assert importlib.reload(crossings_mod).DETOUR_SPLIT is True
    monkeypatch.delenv("SCOUTX_DETOUR_SPLIT")
    importlib.reload(crossings_mod)
