"""Publication guard for rows that are already inside a chosen tracklet but are not that player.

Image overlap is not used on its own: a pan drives it to zero. E4 is a frame that misses the
return while its neighbours still overlap. P is a short panorama tail after a hole that also
shrinks. A longer tail is kept.
"""
import numpy as np

from scoutx_tracker.stats import keep_continuous_observations


def _track(specs):
    """(frame, x, w, h) image box and a panorama point at the same x, with height h."""
    frames, boxes, pano = [], [], []
    for f, x, w, h in specs:
        frames.append(f)
        boxes.append([x, 100, x + w, 100 + h])
        pano.append([x + w / 2, 400, h])
    return np.array(frames), np.array(boxes, float), np.array(pano, float)


def test_pause_resume_tail_is_not_published_and_the_approach_is():
    frames, boxes, pano = _track(
        [(f, 100 + 8 * f, 80, 160) for f in range(0, 8)]
        + [(f, 400, 40, 90) for f in range(10, 14)]
    )
    keep = keep_continuous_observations(frames, boxes, pano)
    assert keep[:8].all()
    assert not keep[8:].any()


def test_resume_that_keeps_its_size_is_kept():
    frames, boxes, pano = _track(
        [(0, 100, 80, 160), (1, 108, 80, 160), (4, 400, 80, 160), (5, 408, 80, 160)]
    )
    assert keep_continuous_observations(frames, boxes, pano).all()


def test_long_discontinuous_tail_is_not_cut():
    frames, boxes, pano = _track([(f, 100, 80, 160) for f in range(0, 6)] + [(f, 500, 40, 80) for f in range(8, 14)])
    assert keep_continuous_observations(frames, boxes, pano).all()


def test_one_frame_that_misses_the_return_is_dropped():
    frames, boxes, pano = _track([(0, 100, 80, 160), (1, 108, 80, 160), (2, 500, 40, 90), (3, 124, 80, 160), (4, 132, 80, 160)])
    keep = keep_continuous_observations(frames, boxes, pano)
    assert list(keep) == [True, True, False, True, True]


def test_a_shorter_box_that_still_overlaps_the_player_is_kept():
    frames, boxes, pano = _track([(0, 100, 80, 160), (1, 108, 80, 160), (3, 112, 70, 100), (4, 118, 70, 100)])
    # Force a panorama spike on the resumed row without leaving the image box.
    pano[2] = [900, 400, 100]
    assert keep_continuous_observations(frames, boxes, pano).all()


def test_a_pan_with_no_image_overlap_is_kept():
    """Each image box misses the next one, and the panorama walk is smooth. That is a pan, not a swap."""
    frames, boxes, pano = [], [], []
    for f in range(8):
        frames.append(f)
        boxes.append([f * 200, 100, f * 200 + 80, 260])
        pano.append([1000 + 4 * f, 400, 160])
    assert keep_continuous_observations(np.array(frames), np.array(boxes, float), np.array(pano, float)).all()


def test_reacquire_uses_the_other_track_only_on_the_refused_frames():
    """The refused tail is a short box. Another track keeps the body size on those same frames.
    A row of that track during the hole is not one of the refused frames, so it stays out."""
    from scoutx_tracker.stats import reacquire_interrupted_rows

    def row(frame, tid, x, h, t=None):
        t = frame / 10 if t is None else t
        return [frame, t, tid, x, 100, x + 40, 100 + h, 0.9, 0]

    rows, pano = [], []
    for f in range(0, 6):
        rows.append(row(f, 1, 100 + 4 * f, 160))
        pano.append([100 + 4 * f, 400, 160])
    for f in range(8, 12):
        rows.append(row(f, 1, 400, 90))
        pano.append([400, 400, 90])
    for f in range(7, 12):
        rows.append(row(f, 2, 120 + 4 * f, 155))
        pano.append([120 + 4 * f, 400, 155])
    for f in range(8, 12):
        rows.append(row(f, 3, 2000, 160))
        pano.append([2000, 400, 160])
    rows, pano = np.array(rows, float), np.array(pano, float)
    kept = 5
    dropped = np.arange(6, 10)
    got = reacquire_interrupted_rows(rows, pano, kept, dropped, fps=10.0, segments=np.zeros(12, int))
    assert [int(rows[r, 2]) for r in got] == [2, 2, 2, 2]
    assert [int(rows[r, 0]) for r in got] == [8, 9, 10, 11]


def _row(frame, tid, x, h, w=40):
    return [frame, frame / 10, tid, x, 100, x + w, 100 + h, 0.9, 0]


def test_continuation_follows_a_smooth_track_and_stops_at_a_jump():
    from scoutx_tracker.stats import extend_recovered_track

    rows, pano = [], []
    for f in range(8, 14):
        rows.append(_row(f, 2, 120 + 4 * f, 155))
        pano.append([120 + 4 * f, 400, 155])
    # A jump that also misses the previous image box. The walk must not publish it or anything after it.
    rows.append(_row(14, 2, 800, 155))
    pano.append([800, 400, 155])
    rows.append(_row(15, 2, 808, 155))
    pano.append([808, 400, 155])
    rows, pano = np.array(rows, float), np.array(pano, float)
    got = extend_recovered_track(rows, pano, [0], segments=np.zeros(20, int))
    assert [int(rows[r, 0]) for r in got] == [9, 10, 11, 12, 13]


def test_continuation_stops_before_a_teammate_contact_and_keeps_a_pan():
    from scoutx_tracker.stats import extend_recovered_track

    rows, pano = [], []
    for f, x in ((8, 100), (9, 900), (10, 920)):
        rows.append(_row(f, 2, x, 160))
        pano.append([100 + 4 * f, 400, 160])
    rows, pano = np.array(rows, float), np.array(pano, float)
    # Image boxes 8 and 9 do not overlap, but the panorama step is a pan.
    got = extend_recovered_track(rows, pano, [0], segments=np.zeros(20, int))
    assert [int(rows[r, 0]) for r in got] == [9, 10]
    occ = np.zeros(len(rows), bool)
    occ[1] = True
    got = extend_recovered_track(rows, pano, [0], segments=np.zeros(20, int), occluded=occ)
    assert got == []
    got = extend_recovered_track(rows, pano, [0], segments=np.zeros(20, int), blocked_frames={9})
    assert got == []
