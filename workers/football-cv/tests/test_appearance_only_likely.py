"""5.3 candidate D (SCOUTX_APPEARANCE_ONLY_LIKELY=0, off by default): appearance alone never yields LIKELY.

Measured on IMG_4809 (all labelled frames of the default full match and the default + HLG-reference interval runs):
appearance-only LIKELY claims were 0 correct, 19 wrong-player, 12 unmatched; every correct claim came from number,
anchored or interpolated evidence. Identity resolution is untouched (states only), so the effect is local: only
frames whose evidence is "appearance" change, from LIKELY to AMBIGUOUS."""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
REP = ROOT / "bench" / "results" / "5.3" / "wrong-player-20261102" / "replays"
E3 = (136, 137, 138, 145, 146, 147, 148, 149)


def _replay(tmp_path, name, d_on):
    env = {**os.environ, "SCOUTX_EXCHANGE_SPLIT": "0", "SCOUTX_RESUME_SPLIT": "0", "SCOUTX_OCR_CONSULTED_ONLY": "0",
           "SCOUTX_APPEARANCE_ONLY_LIKELY": "0" if d_on else "1", "PYTHONHASHSEED": "0"}
    out = tmp_path / f"{name}_{int(d_on)}"
    subprocess.run([sys.executable, str(ROOT / "bench" / "regression_replay.py"), "run", "--replay", str(REP / name),
                    "--out", str(out)], env=env, cwd=ROOT, check=True, capture_output=True)
    with np.load(out / "automatic" / "timeline.npz") as z:
        return {k: z[k].copy() for k in ("present", "states", "evidence", "boxes")}


def test_frame_states_unit(monkeypatch):
    from types import SimpleNamespace

    from scoutx_tracker import states as st
    T = SimpleNamespace(rows=np.zeros((0, 9)), by_tid={}, summary=[])
    res = SimpleNamespace(chosen=[], score={})
    tl = SimpleNamespace(times=np.arange(4) / 10, conf=[0.9, 0.9, 0.9, 0.99], present=[True] * 4,
                         evidence=["appearance", "anchored", "interpolated", "number"])
    pk = np.array(["match"] * 4, dtype=object)
    monkeypatch.setattr(st, "APPEARANCE_ONLY_LIKELY", True)
    a, _ = st.frame_states(T, res, tl, pk)
    monkeypatch.setattr(st, "APPEARANCE_ONLY_LIKELY", False)
    b, _ = st.frame_states(T, res, tl, pk)
    assert list(a[:3]) == ["LIKELY_VISIBLE"] * 3 and a[3] == "CONFIRMED_VISIBLE"
    assert list(b) == ["AMBIGUOUS", "LIKELY_VISIBLE", "LIKELY_VISIBLE", "CONFIRMED_VISIBLE"]


@pytest.mark.skipif(not REP.exists(), reason="regression replay artifacts not present")
def test_E3_appearance_claims_become_ambiguous_and_nothing_else_changes(tmp_path):
    base, cand = _replay(tmp_path, "reference_i0225", False), _replay(tmp_path, "reference_i0225", True)
    assert all(str(base["states"][w]) == "LIKELY_VISIBLE" for w in E3)
    assert all(str(cand["states"][w]) == "AMBIGUOUS" for w in E3)
    changed = np.flatnonzero(base["states"] != cand["states"])
    assert all(str(base["evidence"][i]) == "appearance" for i in changed)
    assert np.array_equal(base["present"], cand["present"]) and np.array_equal(base["evidence"], cand["evidence"])
    # number-confirmed acquisition (the single correct '20' read at w194, and frames before E1) is untouched
    assert str(cand["states"][194]) == "CONFIRMED_VISIBLE"


@pytest.mark.skipif(not REP.exists(), reason="regression replay artifacts not present")
def test_default_decoder_interval_unchanged(tmp_path):
    base, cand = _replay(tmp_path, "default_i0225", False), _replay(tmp_path, "default_i0225", True)
    assert np.array_equal(base["states"], cand["states"])                 # no appearance-only claims there
