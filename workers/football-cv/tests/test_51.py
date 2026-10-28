"""5.1: tracklet-first identity (contact pieces, crossing links, anchored continuity) and the
mandatory regression test for the 5.0 wrong-likely interval at 31:44 (IMG_4809)."""

import json
from pathlib import Path

import numpy as np

from scoutx_tracker.crossings import (
    SWAP_MARGIN,
    ContactSplit,
    _link_event,
    contact_rows,
    split_at_contacts,
)
from scoutx_tracker.features import kit_score, kit_scores

FIX = Path(__file__).parent / "fixtures"


def test_kit_scores_vectorised_matches_scalar():
    rng = np.random.default_rng(0)
    S = rng.random((300, 80)).astype(np.float32)
    S /= np.linalg.norm(S, axis=1, keepdims=True)
    assert np.allclose(kit_scores(S, "orange"), [kit_score(x, "orange") for x in S], atol=1e-5)
    assert kit_scores(S, "no such colour").sum() == 0


def _rows(tracks):
    """tracks: {tid: [(frame, x1, y1, x2, y2)]} -> (R, 9) rows with det index = row index."""
    out = []
    for tid, rs in tracks.items():
        for f, *b in rs:
            out.append([f, f / 10.0, tid, *b, 0.9, 0])
    R = np.array(out, float)
    R[:, 8] = np.arange(len(R))
    return R


def test_contact_rows_and_split_into_pre_contact_post():
    # two team-mates: A walks right through B's position (overlap on frames 10-12)
    A = [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(25)]
    B = [(f, 200, 100, 260, 300) for f in range(25)]
    R = _rows({1: A, 2: B})
    kit = np.full(len(R), 0.8)
    occ, partner = contact_rows(R, kit)
    a_rows = np.where(R[:, 2] == 1)[0]
    assert occ[a_rows].sum() >= 3 and (partner[a_rows][occ[a_rows]] >= 0).all()
    sigs = np.zeros((len(R), 80), np.float32)
    sigs[:, 0] = 1.0  # identical appearance: nothing separates them
    cs = split_at_contacts(R, kit, sigs, R[:, 1], 10.0)
    assert len(np.unique(cs.rows[:, 2])) == 6  # 2 tracks x (pre, contact, post)
    assert len(cs.contact_tids) == 2 and cs.events == 1
    # same look, tracker continuation: the appearance assignment cannot beat it -> never a swap
    assert all(lk.decision in ("same", "unclear") for lk in cs.links)
    # an opponent (other kit) overlapping is not a contact
    occ2, _ = contact_rows(R, np.where(R[:, 2] == 2, 0.0, 0.8))
    assert not occ2.any()


def test_link_rule_tracker_prior_swap_only_with_large_margin():
    out = ContactSplit(np.zeros((0, 9)))
    pres = [(1, None), (2, None)]
    posts = [(11, None), (12, None)]
    succ = {1: 11, 2: 12}
    # appearance agrees with the tracker
    _link_event(out, pres, posts, np.array([[0.05, 0.4], [0.4, 0.05]]), 5.0, succ)
    assert [(lk.pre, lk.post, lk.decision) for lk in out.links] == [(1, 11, "same"), (2, 12, "same")]
    # appearance disagrees a little: unclear, identity follows neither
    out.links.clear()
    _link_event(out, pres, posts, np.array([[0.10, 0.08], [0.08, 0.10]]), 5.0, succ)
    assert all(lk.decision == "unclear" and not lk.clear for lk in out.links)
    # appearance disagrees by more than SWAP_MARGIN: a swap
    out.links.clear()
    _link_event(out, pres, posts, np.array([[0.5, 0.02], [0.02, 0.5]]), 5.0, succ)
    assert {(lk.pre, lk.post) for lk in out.links} == {(1, 12), (2, 11)} and all(lk.decision == "swap" for lk in out.links)
    assert 2 * (0.5 - 0.02) >= SWAP_MARGIN
    # small players: agreement with a small margin is not enough
    out.links.clear()
    _link_event(out, pres, posts, np.array([[0.05, 0.09], [0.09, 0.05]]), 5.0, succ, small=True)
    assert all(lk.decision == "unclear" for lk in out.links)


def _slice():
    from scoutx_tracker.tracklets import Detections

    z = np.load(FIX / "img4809_3144_slice.npz")
    meta = json.loads((FIX / "img4809_3144_slice.json").read_text())
    D = Detections(z["dets"], z["sigs"], z["emb_idx"], z["embs"], z["balls"], z["warps"], z["times"], z["segment"],
                   {}, meta["fps"], [("slice", 0, len(z["times"]), 0.0)], meta["width"], meta["height"])
    D.grass = z["grass"]
    return D, meta


def _iou(a, b):
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    i = max(0, x2 - x1) * max(0, y2 - y1)
    return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i)


def _run_slice(contact_split: bool):
    from scoutx_tracker.identity import Target, resolve_identity
    from scoutx_tracker.states import frame_states
    from scoutx_tracker.stats import build_timeline
    from scoutx_tracker.tracklets import assemble, track_rows, tracklet_features

    D, meta = _slice()
    T = assemble(D, track_rows(D), "orange", "white", contact_split=contact_split)
    reads: dict = {}
    for f, box, num, conf in meta["reads"]:
        rows = np.where(T.rows[:, 0] == f)[0]
        best = max(rows, key=lambda r: _iou(T.rows[r, 3:7], box))
        if _iou(T.rows[best, 3:7], box) >= 0.5:
            reads.setdefault(int(T.rows[best, 2]), []).append((f, num, conf, "fixture"))
    row_kit = kit_scores(D.sigs[T.rows[:, 8].astype(int)], "orange")
    res = resolve_identity(T.summary, reads, Target(number="20", kit_primary="orange", kit_secondary="white"), D.fps, T.rows,
                           T.by_tid, tracklet_features(D, T), row_kit=row_kit, links=T.links, contact_pre=T.contact_pre)
    tl = build_timeline(D, T, res, row_kit=row_kit)
    states, _ = frame_states(T, res, tl, np.full(len(D.times), "play"))
    return D, meta, tl, states


def test_regression_3144_wrong_player_never_claimed_and_target_kept():
    """5.0 showed an orange team-mate (knee supports) as 'likely #20' at 31:43.8-31:46: the
    tracker followed #20 (number read at 31:42.7) through a crossing onto him. Fixed by cutting
    tracks at team-mate contacts, an unclear crossing carrying no identity, and anchored parts of a
    tracklet using appearance without the hard-evidence boost. Not a timestamp rule: the same
    code runs on the whole match (see docs/video/intelligence-5.1-report)."""
    D, meta, tl, states = _run_slice(contact_split=True)
    claim = np.isin(states, ["CONFIRMED_VISIBLE", "LIKELY_VISIBLE"]) & tl.present
    wrong = right = target_frames = 0
    for f, box, lab in meta["groundTruth"]:
        on = claim[f] and _iou(tl.boxes[f], box) >= 0.5
        wrong += on and lab == "N"
        right += on and lab == "T"
        target_frames += lab == "T"
    assert wrong == 0, "a labelled non-target was attributed to #20"
    assert right >= 0.5 * target_frames, (right, target_frames)
    # the number read itself stays confirmed
    t_read = 1902.7 - 1880.0
    f_read = int(np.argmin(np.abs(D.times - D.times[0] - t_read)))
    assert states[f_read] == "CONFIRMED_VISIBLE"
