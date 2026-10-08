from __future__ import annotations

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.contract import SegmentRequest, SegmentResult
from app.identity import (
    JERSEY_CONFIRM_READS,
    Track,
    TrackObservation,
    associate,
    availability_windows,
    visible_seconds,
)
from app.main import app, set_components
from app.pipeline import Box, Components, analyse_segment, camera_view
from app.teams import team_match


def request_body(**overrides):
    body = {
        "contractVersion": 2,
        "jobId": "job_1",
        "segmentIndex": 0,
        "startSec": 0,
        "endSec": 60,
        "source": {"url": "https://storage.example/signed", "headers": None},
        "target": {"jerseyNumber": "8", "kitPrimaryColor": "red", "kitSecondaryColor": "white", "teamSide": "home", "position": "midfielder"},
        "sampling": {"fps": 2},
        "privacy": {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False},
    }
    body.update(overrides)
    return body


def track(track_id, times, jersey=None, confidence=0.0, team=0.0):
    return Track(track_id, [TrackObservation(t, jersey, confidence, team) for t in times])


# --- contract ---------------------------------------------------------------------------

def test_request_requires_privacy_flags_false():
    SegmentRequest.model_validate(request_body())
    for flag in ("retainNonTargetIdentities", "faceRecognition", "persistMedia"):
        privacy = {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False, flag: True}
        with pytest.raises(ValidationError):
            SegmentRequest.model_validate(request_body(privacy=privacy))


def test_request_rejects_unbounded_or_odd_input():
    with pytest.raises(ValidationError):
        SegmentRequest.model_validate(request_body(endSec=2000))
    with pytest.raises(ValidationError):
        SegmentRequest.model_validate(request_body(source={"url": "file:///etc/passwd", "headers": None}))
    with pytest.raises(ValidationError):
        SegmentRequest.model_validate(request_body(jobId="../x"))
    with pytest.raises(ValidationError):
        SegmentRequest.model_validate(request_body(unexpected=True))


def test_result_rejects_inconsistent_output():
    base = {
        "workerVersion": "w",
        "segmentIndex": 0,
        "stages": {"tracking": "complete", "identity": "complete", "events": "unavailable", "pitch": "unavailable"},
        "cameraView": "wide",
        "identity": {"state": "UNKNOWN", "candidates": []},
        "availability": [],
        "coverage": {"analysedSec": 60, "targetVisibleSec": 10, "framesDecoded": 120},
        "events": [],
    }
    SegmentResult.model_validate(base)
    with pytest.raises(ValidationError):
        SegmentResult.model_validate({**base, "coverage": {"analysedSec": 10, "targetVisibleSec": 20, "framesDecoded": 1}})
    with pytest.raises(ValidationError):
        SegmentResult.model_validate({**base, "events": [{"type": "pass", "startSec": 1, "endSec": 2, "confidence": 0.9, "frameTimesSec": [1]}]})
    with pytest.raises(ValidationError):
        SegmentResult.model_validate({**base, "availability": [
            {"startSec": 0, "endSec": 10, "state": "UNKNOWN", "confidence": 0},
            {"startSec": 5, "endSec": 20, "state": "UNKNOWN", "confidence": 0},
        ]})


# --- identity ---------------------------------------------------------------------------

def test_jersey_reads_confirm_identity_team_colour_alone_does_not():
    confirmed = associate([track("a", range(JERSEY_CONFIRM_READS), "8", 0.9, 0.9)], "8")
    assert confirmed.state == "CONFIRMED_VISIBLE"
    colour_only = associate([track("b", range(10), None, 0.0, 0.95)], "8")
    assert colour_only.state == "CANDIDATE"
    weak_reads = associate([track("c", range(10), "8", 0.3, 0.9)], "8")
    assert weak_reads.state == "CANDIDATE"
    nobody = associate([track("d", range(10), "5", 0.9, 0.1)], "8")
    assert nobody.state == "UNKNOWN"


def test_two_people_with_the_target_number_at_once_are_ambiguous_not_confirmed():
    both = associate([track("a", range(0, 6), "8", 0.9, 0.9), track("b", range(3, 9), "8", 0.9, 0.9)], "8")
    assert both.state == "CANDIDATE"
    assert both.ambiguous is True
    assert both.target_tracks == []
    assert availability_windows(both, 0, 60, 0.5, wide_camera=True)[0]["state"] == "UNKNOWN"
    # The same player re-acquired under a new track id (re-entry) is not two people.
    reentry = associate([track("a", range(0, 5), "8", 0.9, 0.9), track("b", range(30, 35), "8", 0.9, 0.9)], "8")
    assert reentry.state == "CONFIRMED_VISIBLE"


def test_same_number_in_the_wrong_kit_is_not_the_target():
    opponent_and_target = [track("own", range(0, 6), "8", 0.9, 0.9), track("opp", range(0, 6), "8", 0.9, 0.1)]
    with_kit = associate(opponent_and_target, "8", kit_known=True)
    assert with_kit.state == "CONFIRMED_VISIBLE"
    assert [t.track_id for t in with_kit.target_tracks] == ["own"]
    # Without a usable kit description the two cannot be told apart.
    assert associate(opponent_and_target, "8", kit_known=False).state == "CANDIDATE"


def test_unconfirmed_identity_yields_only_unknown_time():
    windows = availability_windows(associate([], "8"), 0, 60, 0.5, wide_camera=True)
    assert windows == [{"startSec": 0, "endSec": 60, "state": "UNKNOWN", "confidence": 0.0}]


def test_short_gaps_on_wide_camera_are_likely_off_camera_long_gaps_unknown():
    seen = [t / 2 for t in range(0, 20)] + [t / 2 for t in range(40, 60)] + [t / 2 for t in range(140, 150)]
    association = associate([track("a", seen, "8", 0.9, 0.9)], "8")
    windows = availability_windows(association, 0, 120, 0.5, wide_camera=True)
    states = [w["state"] for w in windows]
    assert states == ["CONFIRMED_VISIBLE", "LIKELY_ACTIVE_OFF_CAMERA", "CONFIRMED_VISIBLE", "UNKNOWN", "CONFIRMED_VISIBLE", "UNKNOWN"]
    assert "CONFIRMED_OFF_PITCH" not in states
    close_camera = availability_windows(association, 0, 120, 0.5, wide_camera=False)
    assert "LIKELY_ACTIVE_OFF_CAMERA" not in [w["state"] for w in close_camera]
    assert visible_seconds(windows) == pytest.approx(25.0)


# --- teams and camera -------------------------------------------------------------------

def test_kit_colour_matching():
    red = np.full((20, 10, 3), (205, 35, 45), dtype=np.uint8)
    blue = np.full((20, 10, 3), (30, 60, 180), dtype=np.uint8)
    assert team_match(red, "red") > 0.9
    assert team_match(blue, "red") < 0.3
    assert team_match(red, "chartreuse-ish") == 0.0


def test_camera_view_from_person_size():
    assert camera_view([0.05, 0.08]) == "wide"
    assert camera_view([0.2]) == "medium"
    assert camera_view([0.6]) == "close"
    assert camera_view([]) == "non_play"


# --- pipeline with fakes ----------------------------------------------------------------

class FakeSource:
    def __init__(self, count=20, fail=False):
        self.count, self.fail = count, fail

    def frames(self, url, headers, start_sec, end_sec, fps):
        for index in range(self.count):
            if self.fail and index == 3:
                raise RuntimeError("stream broke")
            frame = np.zeros((720, 1280, 3), dtype=np.uint8)
            frame[100:160, 600:630] = (205, 35, 45)
            yield start_sec + index / fps, frame


class FakeDetector:
    def people(self, frame):
        return [Box(600, 80, 630, 160, 0.9), Box(10, 10, 20, 30, 0.2)]


class FakeTracker:
    def update(self, boxes):
        return [("t1", box) for box in boxes]


class FakeJersey:
    def __init__(self, number="8"):
        self.number = number

    def read(self, crop):
        return self.number, 0.9


def components(source=None, number="8"):
    return Components(source=source or FakeSource(), detector=FakeDetector(), tracker_factory=FakeTracker, jersey_reader=FakeJersey(number))


def test_pipeline_confirms_target_and_reports_no_events():
    result = analyse_segment(SegmentRequest.model_validate(request_body()), components())
    assert result.identity.state == "CONFIRMED_VISIBLE"
    assert result.stages.events == "unavailable"
    assert result.stages.pitch == "unavailable"
    assert result.events == []
    assert result.coverage.framesDecoded == 20
    assert result.coverage.targetVisibleSec <= result.coverage.analysedSec
    assert any(window.state == "CONFIRMED_VISIBLE" for window in result.availability)


def test_evaluation_trace_is_local_only_and_models_are_reported():
    parts = components()
    parts.models = {"detector": "fake@1"}
    trace: list[dict] = []
    result = analyse_segment(SegmentRequest.model_validate(request_body()), parts, trace)
    assert len(trace) == 20
    assert trace[0]["box"] == [600, 80, 630, 160]
    assert result.models == {"detector": "fake@1"}
    payload = result.model_dump()
    assert "trace" not in payload
    assert "box" not in str(payload)


def test_pipeline_wrong_jersey_stays_candidate():
    result = analyse_segment(SegmentRequest.model_validate(request_body()), components(number="5"))
    assert result.identity.state in ("CANDIDATE", "UNKNOWN")
    assert all(window.state == "UNKNOWN" for window in result.availability)
    assert result.coverage.targetVisibleSec == 0


def test_pipeline_broken_stream_fails_honestly():
    result = analyse_segment(SegmentRequest.model_validate(request_body()), components(source=FakeSource(fail=True)))
    assert result.stages.tracking == "failed"
    assert result.identity.state == "UNKNOWN"
    assert result.coverage.targetVisibleSec == 0


# --- HTTP -------------------------------------------------------------------------------

def test_http_endpoint_validates_and_answers():
    set_components(components())
    try:
        client = TestClient(app)
        assert client.get("/healthz").json()["ok"] is True
        response = client.post("/v2/segments:analyze", json=request_body())
        assert response.status_code == 200
        assert response.json()["contractVersion"] == 2
        refused = client.post("/v2/segments:analyze", json=request_body(privacy={"retainNonTargetIdentities": True, "faceRecognition": False, "persistMedia": False}))
        assert refused.status_code == 422
        assert client.get("/docs").status_code == 404
    finally:
        set_components(None)
