"""2026-11-14 candidate SCOUTX_TELEPORT_SPLIT: a track whose camera-compensated box jumps more than 0.8 box heights in
one frame is cut; ordinary motion, a moving camera that explains the jump, and frames with unreliable warps are not."""
import numpy as np

from scoutx_tracker.tracklets import split_on_teleports


def _warps(n, dx=0.0, q=1.0):
    w = np.zeros((n, 7))
    w[:, 0] = w[:, 4] = 1.0
    w[:, 2] = dx
    w[:, 6] = q
    return w


def _track(boxes, tid=1, f0=0):
    return np.array([[f0 + i, (f0 + i) / 10, tid, *b, 0.9, i] for i, b in enumerate(boxes)], float)


def test_teleport_is_cut_into_a_new_track():
    R = _track([(100, 100, 130, 180), (104, 100, 134, 180), (180, 100, 210, 180), (184, 100, 214, 180)])
    out, cuts = split_on_teleports(R, _warps(10))
    assert cuts == 1
    assert out[:2, 2].tolist() == [1, 1] and len(set(out[2:, 2].tolist())) == 1 and out[2, 2] != 1


def test_ordinary_running_is_not_cut():
    R = _track([(100 + 8 * i, 100, 130 + 8 * i, 180) for i in range(6)])
    assert split_on_teleports(R, _warps(10))[1] == 0


def test_camera_pan_that_explains_the_jump_is_not_cut():
    R = _track([(100, 100, 130, 180), (180, 100, 210, 180)])
    assert split_on_teleports(R, _warps(10, dx=80.0))[1] == 0


def test_unreliable_warp_never_cuts():
    R = _track([(100, 100, 130, 180), (180, 100, 210, 180)])
    assert split_on_teleports(R, _warps(10, q=0.2))[1] == 0


def test_other_tracks_keep_their_ids():
    R = np.vstack([_track([(100, 100, 130, 180), (180, 100, 210, 180)], tid=1),
                   _track([(500, 100, 530, 180), (502, 100, 532, 180)], tid=7)])
    out, cuts = split_on_teleports(R, _warps(10))
    assert cuts == 1 and out[2:, 2].tolist() == [7, 7]
