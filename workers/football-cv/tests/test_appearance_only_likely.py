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


def _result(tmp_path, name, d_on):
    _replay(tmp_path, name, d_on)
    return json.loads((tmp_path / f"{name}_{int(d_on)}" / "automatic" / "result.json").read_text()), \
        np.load(tmp_path / f"{name}_{int(d_on)}" / "automatic" / "timeline.npz")


@pytest.mark.skipif(not REP.exists(), reason="regression replay artifacts not present")
def test_attribution_boundary_under_D_ambiguous_frames_never_reach_attributing_outputs(tmp_path):
    """Contract (docs/video/identity-contracts-C-D-2026-11-04.md): with D, appearance-only frames are AMBIGUOUS and
    no attributing output (moments + their indicators, events, physical/coverage claimed time) uses them; owner-review
    candidates stay available; the API payload never carries chain tracklets, scores or evidence."""
    sys.path.insert(0, str(ROOT))
    from app.tracking_v3 import target_only  # noqa: PLC0415

    r1, z1 = _result(tmp_path, "reference_i0225", False)
    r0, z0 = _result(tmp_path, "reference_i0225", True)
    states, times = z0["states"].astype(str), z0["times"]
    claimed_t = {round(float(t), 1) for t, s in zip(times, states) if s in ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")}
    for m in r0["moments"]:
        assert m["identityState"] in ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")
        assert all(round(p[0], 1) in claimed_t for p in m.get("indicator", []))
    for e in r0["events"]:
        if e["identityState"] in ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE"):
            assert any(e["start"] - 0.05 <= t <= e["end"] + 0.05 for t in claimed_t)
    assert r0["coverage"]["likelyVisibleSec"] < r1["coverage"]["likelyVisibleSec"]        # E3 no longer counted
    assert len(r0["reviewQuestions"]) == len(r1["reviewQuestions"])                     # candidates still askable
    assert not any(str(e) == "anchor" for e in z0["evidence"])                           # no owner answer was given
    api = target_only(r0)
    assert not {"tracklets", "excluded", "numberReads"} & set(api)
