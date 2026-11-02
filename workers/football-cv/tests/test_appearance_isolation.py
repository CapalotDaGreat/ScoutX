"""5.3 CPU-divergence follow-up: appearance-feature isolation tooling and the contact-link decision it exercises."""
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bench"))
sys.path.insert(0, str(ROOT))
import appearance_features as af  # noqa: E402
from scoutx_tracker import crossings as cr  # noqa: E402
from scoutx_tracker.features import EMB_DIM, SIG_DIM, GridEmbedder, colour_signature  # noqa: E402


def _dets():
    # frame, time, x1, y1, x2, y2, score - frame 1 is odd (no embeddings), small/low-score boxes are skipped
    return np.array([[0, 0.0, 10, 10, 40, 90, 0.9], [0, 0.0, 60, 20, 70, 40, 0.9], [0, 0.0, 100, 10, 130, 90, 0.2],
                     [1, 0.1, 12, 10, 42, 90, 0.9], [2, 0.2, 14.4, 10.6, 44.5, 90.2, 0.8]], float)


def _frames():
    rng = np.random.default_rng(0)
    return [(100 + i, rng.integers(0, 255, (120, 160, 3), dtype=np.uint8)) for i in range(3)]


def test_embedding_selection_is_the_extract_rule():
    assert af.embedding_selection(_dets()).tolist() == [0, 4]


def test_recompute_reproduces_extract_features_for_fixed_boxes():
    dets, frames = _dets(), _frames()
    r = af.recompute(dets, np.array([0, 4]), iter(frames), 100)
    grid = GridEmbedder()
    for j, d in enumerate(dets):
        frame = frames[int(d[0])][1]
        sig, _ = colour_signature(frame, d[2:6].astype(np.float32))
        assert np.array_equal(r["sigs"][j], sig.astype(np.float16))
    for row, j in enumerate([0, 4]):
        frame = frames[int(dets[j, 0])][1]
        assert np.array_equal(r["embs"][row], grid(frame, dets[[j], 2:6].astype(np.float32))[0].astype(np.float16))
    assert r["sigs"].shape == (5, SIG_DIM) and r["embs"].shape == (2, EMB_DIM)
    assert set(r["hashes"]) == {"100", "101", "102"}


def test_recompute_refuses_an_emb_idx_that_is_not_the_extract_selection():
    with pytest.raises(ValueError):
        af.recompute(_dets(), np.array([0, 3]), iter(_frames()), 100)


def test_recompute_refuses_missing_frames():
    with pytest.raises(ValueError):
        af.recompute(_dets(), np.array([0, 4]), iter(_frames()[:2]), 100)


def _chunk(tmp: Path, sigs_value: float) -> Path:
    d = tmp / f"base{sigs_value}"
    d.mkdir()
    dets = _dets()
    np.savez_compressed(d / "detections.npz", dets=dets, sigs=np.full((5, SIG_DIM), sigs_value, np.float16),
                        emb_idx=np.array([0, 4]), embs=np.full((2, EMB_DIM), sigs_value, np.float16),
                        balls=np.zeros((0, 7)), ball_warm=np.zeros(0, np.float32), warps=np.zeros((3, 7)),
                        cuts=np.zeros(0, np.int64), times=np.array([0.0, 0.1, 0.2]), grass=np.ones(3, np.float32),
                        propagated=np.zeros(5, bool))
    (d / "meta.json").write_text("{}")
    return d


def test_build_changes_only_the_requested_field_and_frames(tmp_path):
    base = _chunk(tmp_path, 0.25)
    other = {"sigs": np.full((5, SIG_DIM), 0.5, np.float16), "embs": np.full((2, EMB_DIM), 0.5, np.float16)}
    rec = af.build(base, other, None, tmp_path / "colour_only")
    with np.load(tmp_path / "colour_only" / "detections.npz") as z:
        assert np.all(z["sigs"] == np.float16(0.5)) and np.all(z["embs"] == np.float16(0.25))
    assert "dets" in rec["unchangedFields"] and rec["embs"]["identical"] and not rec["sigs"]["identical"]
    af.build(base, other, None, tmp_path / "frames_1_2", sig_frames=(1, 2))
    with np.load(tmp_path / "frames_1_2" / "detections.npz") as z:
        changed = (z["sigs"] == np.float16(0.5)).all(1)
        assert changed.tolist() == [False, False, False, True, True]
    with pytest.raises(ValueError):          # fresh directories only
        af.build(base, other, None, tmp_path / "colour_only")
    with pytest.raises(ValueError):          # shape must not change
        af.build(base, {"sigs": np.zeros((4, SIG_DIM), np.float16)}, None, tmp_path / "bad")


def _link(cost, small):
    out = cr.ContactSplit(np.zeros((0, 9)))
    cr._link_event(out, [(1, None), (2, None)], [(10, None), (20, None)], np.array(cost), 5.7,
                   succ={1: 10, 2: 20}, small=small)
    return {l.pre: l for l in out.links}


def test_small_player_continuation_with_a_near_equal_competitor_stays_unclear():
    # The 1155.7 s event with Windows-decoded colour: the tracker's continuation is also the best
    # appearance assignment, but a team-mate's piece is almost as close (margin 0.059 < 0.10).
    links = _link([[0.116, 0.12], [0.135, 0.08]], small=True)
    assert links[1].decision == "unclear" and not links[1].clear and links[1].post == 10
    # same costs for players >= 90 px: the tracker continuation is kept
    assert _link([[0.116, 0.12], [0.135, 0.08]], small=False)[1].decision == "same"
    # the Linux-colour event: a clear margin keeps the continuation
    assert _link([[0.13, 0.308], [0.342, 0.069]], small=True)[1].decision == "same"


def test_appearance_disagreement_below_swap_margin_never_moves_identity_to_the_team_mate():
    # wrong-player counterexample: appearance prefers the other player's piece by less than SWAP_MARGIN
    links = _link([[0.15, 0.10], [0.10, 0.15]], small=False)   # margin 0.10 < SWAP_MARGIN 0.20
    assert links[1].decision == "unclear" and not links[1].clear
    assert links[1].post == 10            # never re-pointed to the team-mate's piece
    assert all(l.decision != "swap" for l in links.values())
