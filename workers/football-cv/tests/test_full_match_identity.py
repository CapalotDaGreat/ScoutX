"""5.3 whole-match identity replays (IMG_4809, default decoder): full-match failures F6 (#6) and F17 (#17), legitimate
confirmed #20 evidence at 1161-1163 s, exact reproduction, repeatability and OCR-cache-state sensitivity.

The replay (bench/full_match_replay.py, ~60 MB of stage-1 numeric data) is kept locally, not in git; its file hashes
are in bench/results/5.3/full-match-identity-20261103/full_match_replay_provenance.json. These tests are OPT-IN
(each whole-match replay takes minutes): set SCOUTX_FULL_MATCH_REPLAY=<replay dir>.
"""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
REPLAY = Path(os.environ.get("SCOUTX_FULL_MATCH_REPLAY", "/nonexistent"))
PROV = ROOT / "bench" / "results" / "5.3" / "full-match-identity-20261103" / "full_match_replay_provenance.json"
BASELINE_TIMELINE_SHA = "fad444c127030a41c9e07e1b7bb0fbc25f668a6f6860f65c605c96e8e0277d7c"   # fm/x0 report/timeline.npz
pytestmark = pytest.mark.skipif(not (REPLAY / "provenance.json").exists(), reason="set SCOUTX_FULL_MATCH_REPLAY (opt-in)")
_CACHE: dict = {}
CLAIM = ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")


def _run(tag, tmp_path_factory, warm=False, **flags):
    if tag not in _CACHE:
        out = tmp_path_factory.mktemp(tag) / "run"
        env = {**os.environ, "SCOUTX_EXCHANGE_SPLIT": "0", "SCOUTX_RESUME_SPLIT": "0", "PYTHONHASHSEED": "0", **flags}
        cmd = [sys.executable, str(ROOT / "bench" / "full_match_replay.py"), "run", "--replay", str(REPLAY), "--out", str(out)]
        if warm:
            cmd += ["--warm-cache", str(REPLAY / "ocr_reads.json")]
        subprocess.run(cmd, env=env, cwd=ROOT, check=True, capture_output=True)
        p = out / "report" / "timeline.npz"
        with np.load(p) as z:
            _CACHE[tag] = ({k: z[k].copy() for k in ("times", "present", "states", "evidence", "boxes")},
                           hashlib.sha256(p.read_bytes()).hexdigest())
    return _CACHE[tag]


def _span(tl, a, b):
    return np.where((tl["times"] >= a - 1e-6) & (tl["times"] <= b + 1e-6))[0]


def test_replay_inputs_match_the_committed_provenance():
    assert json.loads((REPLAY / "provenance.json").read_text())["files"] == json.loads(PROV.read_text())["files"]


def test_replay_reproduces_the_full_match_baseline_exactly_and_repeatably(tmp_path_factory):
    _, h1 = _run("base", tmp_path_factory)
    assert h1 == BASELINE_TIMELINE_SHA
    _CACHE.pop("base_again", None)
    _, h2 = _run("base_again", tmp_path_factory)
    assert h2 == h1


def test_legitimate_confirmed_20_evidence_at_1161_is_kept(tmp_path_factory):
    tl, _ = _run("base", tmp_path_factory)
    ix = _span(tl, 1161.1, 1162.8)
    assert sum(str(tl["states"][i]) == "CONFIRMED_VISIBLE" and str(tl["evidence"][i]) == "number" for i in ix) >= 16


def test_F6_characterisation_likely_appearance_claims_on_player_6(tmp_path_factory):
    tl, _ = _run("base", tmp_path_factory)
    ix = _span(tl, 706.4, 708.7)
    assert all(str(tl["states"][i]) == "LIKELY_VISIBLE" and str(tl["evidence"][i]) == "appearance" for i in ix)


@pytest.mark.xfail(strict=True, reason="F6 unrepaired: appearance-only LIKELY on a player whose '6' is legible (lone digits ignored)")
def test_F6_desired_no_claim_on_player_6(tmp_path_factory):
    tl, _ = _run("base", tmp_path_factory)
    assert not any(str(tl["states"][i]) in CLAIM for i in _span(tl, 706.4, 716.4))


def test_F17_characterisation_likely_appearance_claims_on_player_17(tmp_path_factory):
    tl, _ = _run("base", tmp_path_factory)
    ix = _span(tl, 1301.5, 1302.1)                                         # timeline basis (labels are +0.1 s)
    assert all(str(tl["states"][i]) == "LIKELY_VISIBLE" and str(tl["evidence"][i]) == "appearance" for i in ix)


@pytest.mark.xfail(strict=True, reason="F17 unrepaired: OCR reads nothing on a legible '17', so appearance claims him")
def test_F17_desired_no_claim_on_player_17(tmp_path_factory):
    tl, _ = _run("base", tmp_path_factory)
    assert not any(str(tl["states"][i]) in CLAIM for i in _span(tl, 1301.5, 1305.7))


def test_cache_state_characterisation_warm_ocr_cache_changes_identity(tmp_path_factory):
    """Known sensitivity: number-conflict splits use the reads present when tracklets are built; a populated cache
    adds refinement-pass reads, so the same inputs resolve differently (here: the 8 confirmed frames at 1161-1163 s
    weaken and the F6 claims disappear)."""
    tl, _ = _run("base", tmp_path_factory)
    tw, _ = _run("warm", tmp_path_factory, warm=True)
    cold = sum(str(tl["states"][i]) == "CONFIRMED_VISIBLE" for i in _span(tl, 1161.1, 1162.8))
    warm = sum(str(tw["states"][i]) == "CONFIRMED_VISIBLE" for i in _span(tw, 1161.1, 1162.8))
    assert warm < cold


@pytest.mark.xfail(strict=True, reason="unrepaired: identity depends on the OCR cache state (warm vs cold)")
def test_cache_state_desired_same_identity_warm_or_cold(tmp_path_factory):
    tl, _ = _run("base", tmp_path_factory)
    tw, _ = _run("warm", tmp_path_factory, warm=True)
    assert np.array_equal(tl["states"], tw["states"])
