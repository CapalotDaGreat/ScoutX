"""Tracking v3: engine modules (no models/video) and the worker HTTP endpoints (fake engine)."""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest

pytest.importorskip("cv2")

from scoutx_tracker import invariants  # noqa: E402
from scoutx_tracker.calibration import LANDMARKS, fit_manual, observed_heatmap, pitch_positions, project  # noqa: E402
from scoutx_tracker.metrics import Thresholds, physical_metrics  # noqa: E402
from scoutx_tracker.periods import NON_FOOTBALL, PLAY_VIEW, apply_corrections, detect_periods  # noqa: E402
from scoutx_tracker.states import coverage, frame_states  # noqa: E402
from scoutx_tracker.stats import Timeline  # noqa: E402
from scoutx_tracker.tracklets import compatible, split_on_number_conflicts  # noqa: E402

FPS = 10.0


def timeline(n=200, px=6.0, h=180.0, evidence="number"):
    t = np.arange(n) / FPS
    x = 500 + px * np.arange(n)
    boxes = np.stack([x - 30, np.full(n, 400.0), x + 30, np.full(n, 400.0 + h)], 1)
    pano = np.stack([x, np.full(n, 400.0 + h), np.full(n, h)], 1)
    return Timeline(np.arange(n), t, np.ones(n, bool), boxes, pano, np.ones(n, int), np.full(n, 0.99),
                    np.array([evidence] * n, dtype=object), np.zeros(n, bool))


# --------------------------------------------------------------------------- states / coverage
def test_states_partition_and_competitor_makes_ambiguous():
    tl = timeline(n=100, evidence="appearance")
    tl.conf[:] = 0.9
    T = SimpleNamespace(rows=np.array([[f, f / FPS, 7, 0, 0, 1, 1, 0.9, 0] for f in range(50, 60)], float),
                        by_tid={7: np.arange(10)}, summary=[{"tid": 7}])
    res = SimpleNamespace(chosen=[], score={0: 0.6})
    kinds = np.array(["play"] * 100, dtype=object)
    states, _ = frame_states(T, res, tl, kinds)
    assert (states[:50] == "LIKELY_VISIBLE").all()
    assert (states[50:60] == "AMBIGUOUS").all(), "a plausible look-alike in view makes it ambiguous"
    cov = coverage(tl.times, states, kinds, None)
    assert cov["likelyVisibleSec"] + cov["ambiguousSec"] + cov["confirmedVisibleSec"] + cov["notIdentifiedSec"] == pytest.approx(cov["analysedSec"])
    kinds[80:] = "non_play"
    states, _ = frame_states(T, res, tl, kinds)
    assert (states[80:] == "NON_MATCH_PERIOD").all()
    cov = coverage(tl.times, states, kinds, None)
    assert cov["nonMatchSec"] == pytest.approx(2.0)


# --------------------------------------------------------------------------- physical metrics
def test_metrics_single_estimator_consistency_and_gates():
    tl = timeline(n=300, px=14.0)
    states = np.array(["CONFIRMED_VISIBLE"] * 300, dtype=object)
    kinds = np.array(["play"] * 300, dtype=object)
    q = np.ones(300)
    phys, v = physical_metrics(tl, FPS, states, None, q, kinds)
    peak = phys["values"]["peakSpeed"]["value"]
    assert all(s["peakKmh"] <= peak + 1e-6 for s in phys["sprints"] + phys["highSpeedRuns"])
    assert phys["provenance"] == "estimate_experimental" and phys["productionVisible"] is False
    assert phys["values"]["workRate"]["denominator"] == "metres per validly observed minute"
    # Unreliable camera motion -> no valid observations -> unavailable, not a guess.
    phys2, _ = physical_metrics(tl, FPS, states, None, np.zeros(300), kinds)
    assert phys2["status"] == "unavailable"


def test_age_group_thresholds():
    assert Thresholds.for_age_group("u13").sprint_kmh < Thresholds().sprint_kmh < Thresholds.for_age_group("pro").sprint_kmh


def test_invariants_detect_inconsistent_peaks_and_unverified_passes():
    rep = {"coverage": {"recordingSec": 10, "nonMatchSec": 0, "offPitchSec": 0, "matchSec": 10, "unobservedSec": 0,
                        "analysedSec": 10, "confirmedVisibleSec": 5, "likelyVisibleSec": 0, "ambiguousSec": 0,
                        "notIdentifiedSec": 5},
           "physical": {"values": {"peakSpeed": {"value": 21.6}, "sprintCount": {"value": 1}},
                        "sprints": [{"start": 1, "end": 2, "peakKmh": 31.9}], "thresholds": {"sprint_kmh": 19.8},
                        "highSpeedRuns": [], "productionVisible": False, "provenance": "estimate_experimental"},
           "events": [{"type": "pass_attempt", "start": 1, "end": 2, "outcome": "completed", "outcomeEvidence": "guess"}],
           "excluded": [{"tid": 3}], "tracklets": [{"tid": 3}]}
    v = invariants.check(rep)
    assert any("peak" in x for x in v)
    assert any("completed outcome" in x for x in v)
    assert any("rejected" in x for x in v)


# --------------------------------------------------------------------------- periods
def test_periods_absorb_stoppages_and_respect_user_boundaries():
    t = np.arange(0, 600, 1.0)
    states = np.array([PLAY_VIEW] * 600, dtype=object)
    states[300:330] = NON_FOOTBALL                       # 30 s camera on the floor
    activity = np.full(600, 0.4)
    activity[100:200] = 0.0                              # 100 s idle: a stoppage, stays play
    tl = detect_periods(t, states, activity)
    kinds = [p.kind for p in tl.periods]
    assert kinds == ["play", "unobserved", "play"]
    fixed = apply_corrections(tl, {"kickoff": 50, "fulltime": 550}, 0, 600)
    assert fixed.periods[0].label == "pre_match" and fixed.periods[-1].label == "post_match"
    assert any(p.kind == "unobserved" for p in fixed.periods), "camera interruption kept inside user play time"


# --------------------------------------------------------------------------- calibration
def test_manual_calibration_validates_and_maps_feet():
    names = ["corner_bl", "halfway_bottom", "halfway_top", "corner_tl"]
    world = np.array([LANDMARKS[n] for n in names])
    H_true = np.array([[0.05, 0.01, 0.0], [0.002, 0.08, 0.0], [0.0, 0.0002, 1.0]])
    img = project(np.linalg.inv(H_true), world)
    cal = fit_manual("c1", 0, [tuple(p) for p in img], names)
    assert cal.status == "valid" and cal.reprojection_m < 1e-3
    bad = fit_manual("c2", 0, [tuple(p) for p in img[:3]], names[:3])
    assert bad.status == "invalid"
    foot = project(np.linalg.inv(H_true), np.array([[30.0, 20.0]]))[0]
    boxes = np.array([[foot[0] - 5, foot[1] - 40, foot[0] + 5, foot[1]]])
    pos, prov = pitch_positions(boxes, np.array([True]), {0: cal.H}, {0: "c1"})
    assert pos[0] == pytest.approx([30.0, 20.0], abs=1e-3) and prov[0] == "c1"
    assert observed_heatmap(pos)["status"] == "observed_only"
    assert observed_heatmap(np.full((3, 2), np.nan))["status"] == "unavailable"


# --------------------------------------------------------------------------- number conflicts
def test_number_conflict_splits_same_team_swap():
    rows = [[f, f / FPS, 5, 0, 0, 10, 20, 0.9, f] for f in range(30)]
    sigs = np.zeros((30, 80), np.float32)
    sigs[:, 25] = 1.0
    sigs[15:, 26] = 0.6          # subtle change at the swap
    R, n = split_on_number_conflicts(np.array(rows, float), sigs, {2: "24", 5: "24", 25: "20"})
    assert n == 1
    assert len(set(R[:10, 2])) == 1 and R[0, 2] != R[-1, 2]
    _, n2 = split_on_number_conflicts(np.array(rows, float), sigs, {2: "4", 25: "20"})
    assert n2 == 0, "one single-digit read is not enough evidence to split"
    assert compatible("2", "20") and not compatible("17", "20")


# --------------------------------------------------------------------------- HTTP endpoints
def test_v3_endpoints_flag_privacy_and_target_only(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app import tracking_v3
    from app.main import app

    body = {"contractVersion": 3, "jobId": "job_1",
            "privacy": {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False},
            "target": {"jerseyNumber": "20", "kitPrimaryColor": "orange"}, "feedback": {"yes": [[1, 2, 3]], "no": []}}
    with TestClient(app) as client:
        monkeypatch.delenv("TRACKING_V3_ENABLED", raising=False)
        assert client.post("/v3/tracking:resolve", json=body).status_code == 404
        monkeypatch.setenv("TRACKING_V3_ENABLED", "true")
        monkeypatch.setenv("TRACKING_ARTIFACT_ROOT", str(tmp_path))
        bad = {**body, "privacy": {**body["privacy"], "faceRecognition": True}}
        assert client.post("/v3/tracking:resolve", json=bad).status_code == 422
        assert client.post("/v3/tracking:resolve", json=body).status_code == 409   # no artifacts yet
        part = tmp_path / "job_1" / "stage1" / "c_00000"
        part.mkdir(parents=True)
        (part / "detections.npz").write_bytes(b"x")
        seen = {}

        def fake_analyze(runs, out, number, kit, kit2, anchors, log=None, rejects=None, feedback=None, position=None):
            seen.update(runs=runs, anchors=anchors, number=number)
            return {"schema": "pitchproof.tracking.v3", "coverage": {}, "invariants": {"ok": True},
                    "excluded": [{"tid": 9, "why": "shows #17"}], "numberReads": {"9": [[1, "17", 0.9, "s"]]},
                    "identity": {"iterations": [1], "numberSightings": 1},
                    "reviewQuestions": [{"tid": 9, "t": 1.0, "box": [1, 2, 3, 4], "affectedSec": 5, "score": 0.5,
                                         "currentlyTarget": False, "from": 0, "to": 9}]}

        tracking_v3.set_engine(analyze=fake_analyze)
        try:
            r = client.post("/v3/tracking:resolve", json=body)
        finally:
            tracking_v3.set_engine()
        assert r.status_code == 200
        data = r.json()
        text = str(data["report"])
        assert "shows #17" not in text and "numberReads" not in data["report"] and "iterations" not in text
        assert "tid" not in data["report"]["reviewQuestions"][0]
        assert seen["anchors"] == [(1.0, 2.0, 3.0)] and seen["number"] == "20"
