"""Known, UNREPAIRED identity failures at IMG_4809 225-255 s, as numeric regression replays (5.3).

Each failure has two tests:

* a characterisation test, which PASSES while the faulty behaviour still reproduces. It proves that the replay
  runs the failing runtime logic, so the xfail below fails for the right reason;
* a strict xfail stating the desired behaviour. When a repair makes it pass, pytest reports XPASS as a failure,
  which forces that repair to update this file deliberately.

Both run with SCOUTX_EXCHANGE_SPLIT off and on: the exchange-split candidate (93258f7) does not touch these
mechanisms.

Replays are bench/results/5.3/wrong-player-20261102/replays/{default,reference}_i0225 (bench/regression_replay.py):
stage-1 detections, OCR crop names and the reads the original run obtained, and discovery sightings. The real
stage 2 runs from an empty cache. Window frame w = source frame - 2250.

P - pause-and-resume transfer (DEFAULT decoder, w194-197):
  #20's tracklet 201 has no rows at w192-193 while #20 crosses player A.
  - At w193 A's raw track takes #20's box. The steal rule cuts it there, with an UNCLEAR link.
  - At w194 #20's track resumes on player A's box and stays with A to w197.
  - This is not a mutual exchange, because the two jumps happen on different frames.
  - The identity of 201 ("anchored": joined by clean hand-offs to the tracklet read "20") passes to A: LIKELY
    claims on A at w194-197.
  - Under the original labels these frames count as correct, because the piece-based labels make the same swap
    (label_corrections_i0225.json C1-C6, proposed).

E3 - appearance-only choice of a distant player (REFERENCE rendering, w133-153):
  Unrepaired: the classifier ranked tracklet 78 (distant N) above #20's tracklet 188, so LIKELY / appearance
  claims landed on N at w136-139 and w145-149.
  Repair side-effect of DETOUR_SPLIT (E4): isolating the w211 detour on the number track changes chain/evidence
  assembly so those frames claim T (anchored) instead. Characterisation below asserts the repaired state.

E4 - one-frame claim on another player after a second crossing (REFERENCE rendering, w211):
  - At source 2460 (w210) #20 crosses another orange player.
  - Unrepaired: at w211 the CONFIRMED / number claim sat on that other player (N box, review 2026-11-03).
  - Mechanism: number tracklet 205 took a merged two-player box at w210 and the other player's box at w211 (no
    clean #20 detection there), then returned to #20 at w212. That one-frame detour was never cut.
  - Repair (SCOUTX_DETOUR_SPLIT=1, experimental, off by default): isolate the one-frame detour row when the two-sided resume signature
    fires; gap-fill at w211 is non-CONFIRMED and not on N. Characterisation below asserts the repaired state.
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
@pytest.mark.parametrize("detour", ["0", "1"])
def test_P_characterisation_default_claims_player_a_after_pause_and_resume(flag, detour, tmp_path_factory):
    tl = _replay("default_i0225", flag, tmp_path_factory, detour)
    for w in (195, 196, 197):
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and iou(c[2], _piece_box(w, PLAYER_A_PIECE)) >= 0.75


@pytest.mark.xfail(strict=True, reason="P unrepaired: identity passes to player A when #20's paused track resumes on A")
@pytest.mark.parametrize("flag", ["0", "1"])
@pytest.mark.parametrize("detour", ["0", "1"])
def test_P_desired_no_claim_on_player_a(flag, detour, tmp_path_factory):
    tl = _replay("default_i0225", flag, tmp_path_factory, detour)
    for w in (195, 196, 197):
        c = _claim(tl, w)
        assert not (c and c[0] in ("LIKELY_VISIBLE", "CONFIRMED_VISIBLE") and iou(c[2], _piece_box(w, PLAYER_A_PIECE)) >= 0.5)


# ---- E3: reference rendering, appearance-only choice of a distant player -----------------------------------------
E3_FRAMES = (136, 137, 138, 145, 146, 147, 148, 149)


def _on_n_label(c, w, thr):
    return any(lab["label"] == "N" and iou(c[2], lab["box"]) >= thr for lab in _labels(w))


def _on_t_label(c, w, thr):
    return any(lab["label"] == "T" and iou(c[2], lab["box"]) >= thr for lab in _labels(w))


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E3_characterisation_reference_claims_target_after_detour_split(flag, tmp_path_factory):
    tl = _replay("reference_i0225", flag, tmp_path_factory, "1")
    for w in E3_FRAMES:
        c = _claim(tl, w)
        assert c and c[0] == "LIKELY_VISIBLE" and _on_t_label(c, w, 0.7)
        assert not _on_n_label(c, w, 0.5)


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E3_desired_no_claim_on_n_labelled_player(flag, tmp_path_factory):
    tl = _replay("reference_i0225", flag, tmp_path_factory, "1")
    assert not any((c := _claim(tl, w)) and _on_n_label(c, w, 0.5) for w in E3_FRAMES)


# ---- E4: reference rendering, one-frame detour (repaired by DETOUR_SPLIT) ------------------------------------------
@pytest.mark.parametrize("flag", ["0", "1"])
def test_E4_characterisation_detour_isolated_no_confirmed_on_other_player(flag, tmp_path_factory):
    """Experimental repair, pinned on: w211 is not a CONFIRMED claim on N; w212 stays off N."""
    tl = _replay("reference_i0225", flag, tmp_path_factory, "1")
    c = _claim(tl, 211)
    assert not (c and c[0] == "CONFIRMED_VISIBLE" and _on_n_label(c, 211, 0.5))
    assert not (c and _on_n_label(c, 211, 0.5))
    nxt = _claim(tl, 212)
    assert nxt and not _on_n_label(nxt, 212, 0.3)


@pytest.mark.parametrize("flag", ["0", "1"])
def test_E4_desired_no_confirmed_claim_on_other_player(flag, tmp_path_factory):
    tl = _replay("reference_i0225", flag, tmp_path_factory, "1")
    c = _claim(tl, 211)
    assert not (c and _on_n_label(c, 211, 0.5))
