"""Known identity failures at IMG_4809 225-255 s, as numeric regression replays (5.3).

P and E4 are repaired at publication. E3 is repaired at selection: the piece that hands off into
the verified number read is kept, and the distant look-alike is not. SCOUTX_RESUME_SPLIT and
SCOUTX_DETOUR_SPLIT stay off.

Both run with SCOUTX_EXCHANGE_SPLIT off and on: the exchange-split candidate (93258f7) does not touch these
mechanisms.

Replays are bench/results/5.3/wrong-player-20261102/replays/{default,reference}_i0225 (bench/regression_replay.py):
stage-1 detections, OCR crop names and the reads the original run obtained, and discovery sightings. The real
stage 2 runs from an empty cache. Window frame w = source frame - 2250.

P - pause-and-resume transfer (DEFAULT decoder), recovered and then followed:
  #20's rows from w194 sit on player A, so they are not published. Another track keeps
  #20's body size on those frames and is published there. The same track is followed
  while each step still continues the previous box, and the walk stops before the step
  that jumps away. w193 stays unclaimed. w185-191 stay on #20.
  SCOUTX_RESUME_SPLIT remains off.

E4 - one-frame confirmed jump (REFERENCE rendering, w211), repaired at publication:
  The number tracklet's row at w211 continues neither neighbour (IoU 0.37 then 0.00), so that
  row is not published and cannot inherit CONFIRMED. w212 stays on the returning box.
  SCOUTX_DETOUR_SPLIT remains off: enabling it rewrote 222 frames of this window.

E3 - appearance-only choice of a distant player (REFERENCE rendering, w133-153), repaired at selection:
  The colour score still prefers the distant look-alike, but the piece that ends in a clean hand-off
  into the verified number read is that read's player. Those frames are LIKELY / anchored on T.
  SCOUTX_DETOUR_SPLIT stays off.

E4 - one-frame claim on another player after a second crossing (REFERENCE rendering, w211):
  Repaired without DETOUR_SPLIT. The opt-in below still isolates the row inside the chain; the
  publication rule drops it even when that split is off. The opt-in is not the release default,
  because on this window it also rewrote 222 other frames.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bench"))
from pp_bench import iou  # noqa: E402

EV = ROOT / "bench" / "results" / "5.3" / "wrong-player-20261102"
GT = ROOT / "bench" / "results" / "5.1" / "gt_img4809_intervals.json"
pytestmark = pytest.mark.skipif(not (EV / "replays").exists(), reason="regression replay artifacts not present")
_CACHE: dict = {}


def _replay(name: str, flag: str, tmp_path_factory, detour: str = "0"):
    """`detour` is explicit. The release default is off; pass \"1\" only for the experimental repair."""
    if (name, flag, detour) not in _CACHE:
        out = tmp_path_factory.mktemp(f"{name}_x{flag}_d{detour}") / "run"
        env = {**os.environ, "SCOUTX_EXCHANGE_SPLIT": flag, "SCOUTX_RESUME_SPLIT": "0", "SCOUTX_DETOUR_SPLIT": detour,
               "SCOUTX_OCR_CONSULTED_ONLY": "0", "SCOUTX_APPEARANCE_ONLY_LIKELY": "1", "PYTHONHASHSEED": "0"}
        subprocess.run([sys.executable, str(ROOT / "bench" / "regression_replay.py"), "run", "--replay",
                        str(EV / "replays" / name), "--out", str(out)], env=env, cwd=ROOT, check=True, capture_output=True)
        with np.load(out / "automatic" / "timeline.npz") as z:
            _CACHE[(name, flag, detour)] = {k: z[k].copy() for k in ("present", "states", "evidence", "boxes")}
    return _CACHE[(name, flag, detour)]


def _labels(w: int):
    return json.loads(GT.read_text())["frames"][str(2250 + w)]


def _piece_box(w: int, piece: int):
    return next(lab["box"] for lab in _labels(w) if lab.get("piece") == piece)


def _claim(tl, w):
    return (str(tl["states"][w]), str(tl["evidence"][w]), tl["boxes"][w]) if tl["present"][w] else None


PLAYER_A_PIECE = 38            # w195-197: player A (labelled T in the original file; corrections C1/C3/C5 propose N)


# ---- P: default decoder, pause-and-resume transfer ---------------------------------------------------------------
@pytest.mark.parametrize("flag", ["0", "1"])
def test_P_pre_gap_target_claims_stay(flag, tmp_path_factory):
    """The pause is at w192-193. Frames before it stay the anchored target; the repair must not move them."""
    tl = _replay("default_i0225", flag, tmp_path_factory)
    for w in range(185, 192):
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and iou(c[2], _piece_box(w, PLAYER_A_PIECE)) >= 0.75


@pytest.mark.parametrize("flag", ["0", "1"])
def test_P_desired_no_claim_on_player_a(flag, tmp_path_factory):
    """After the hole, the refused rows sit on player A. The published boxes are the other
    track, on #20 (piece 39). The steal frame w193 is not one of the refused frames, so it
    stays unclaimed."""
    tl = _replay("default_i0225", flag, tmp_path_factory)
    for w in (195, 196, 197):
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and c[1] == "anchored"
        assert iou(c[2], _piece_box(w, 39)) >= 0.8
        assert iou(c[2], _piece_box(w, PLAYER_A_PIECE)) < 0.3
    c = _claim(tl, 193)
    assert not (c and c[0] in ("LIKELY_VISIBLE", "CONFIRMED_VISIBLE") and iou(c[2], _piece_box(193, PLAYER_A_PIECE)) >= 0.5)
    c = _claim(tl, 194)
    assert c and c[0] == "LIKELY_VISIBLE" and iou(c[2], _piece_box(194, PLAYER_A_PIECE)) >= 0.75
    # The same other track continues while each step still overlaps the previous box.
    # Piece 39 is that player. The walk stops before the step that leaves the box.
    for w in range(198, 208):
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and c[1] == "reacquired"
        assert iou(c[2], _piece_box(w, 39)) >= 0.75
    assert _claim(tl, 208) is None
    assert _claim(tl, 192) is None and _claim(tl, 193) is None


# ---- E3: reference rendering, appearance-only choice of a distant player -----------------------------------------
E3_FRAMES = (136, 137, 138, 145, 146, 147, 148, 149)


def _on_n_label(c, w, thr):
    return any(lab["label"] == "N" and iou(c[2], lab["box"]) >= thr for lab in _labels(w))


def _on_t_label(c, w, thr):
    return any(lab["label"] == "T" and iou(c[2], lab["box"]) >= thr for lab in _labels(w))


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E3_handoff_recovers_the_target(flag, tmp_path_factory):
    """The piece that hands off into the number read is published on T, not on the distant look-alike."""
    tl = _replay("reference_i0225", flag, tmp_path_factory)
    for w in E3_FRAMES:
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and c[1] == "anchored"
        assert _on_t_label(c, w, 0.7) and not _on_n_label(c, w, 0.5)


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E3_desired_no_claim_on_n_labelled_player(flag, tmp_path_factory):
    tl = _replay("reference_i0225", flag, tmp_path_factory)
    assert not any((c := _claim(tl, w)) and _on_n_label(c, w, 0.5) for w in E3_FRAMES)


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E3_detour_opt_in_claims_the_target(flag, tmp_path_factory):
    """SCOUTX_DETOUR_SPLIT=1 only. Not a replacement for the strict xfail above."""
    tl = _replay("reference_i0225", flag, tmp_path_factory, "1")
    for w in E3_FRAMES:
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and _on_t_label(c, w, 0.7)
        assert not _on_n_label(c, w, 0.5)


# ---- E4: reference rendering, one-frame confirmed claim on another player after a second crossing ------------------
@pytest.mark.parametrize("flag", ["0", "1"])
def test_E4_neighbours_of_the_detour_stay_off_the_other_player(flag, tmp_path_factory):
    tl = _replay("reference_i0225", flag, tmp_path_factory)
    nxt = _claim(tl, 212)
    assert nxt and not _on_n_label(nxt, 212, 0.3)


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E4_desired_no_confirmed_claim_on_other_player(flag, tmp_path_factory):
    """w211 continues neither neighbour (IoU 0.37 and 0.00). It is not published, so the number
    evidence on the rest of the tracklet cannot confirm the other player for that frame."""
    tl = _replay("reference_i0225", flag, tmp_path_factory)
    c = _claim(tl, 211)
    assert not (c and _on_n_label(c, 211, 0.5))


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E4_detour_opt_in_no_confirmed_claim_on_other_player(flag, tmp_path_factory):
    """SCOUTX_DETOUR_SPLIT=1 only. Not a replacement for the strict xfail above."""
    tl = _replay("reference_i0225", flag, tmp_path_factory, "1")
    c = _claim(tl, 211)
    assert not (c and c[0] == "CONFIRMED_VISIBLE" and _on_n_label(c, 211, 0.5))
    assert not (c and _on_n_label(c, 211, 0.5))
    nxt = _claim(tl, 212)
    assert nxt and not _on_n_label(nxt, 212, 0.3)
