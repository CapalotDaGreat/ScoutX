import hashlib
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.contract import MatchIdentityEnvelope
from app.main import resolve_identity, set_components
from app.source_pts import enabled


def envelope():
    scope = {"jobId": "job", "sourceSha256": "a" * 64, "generation": 1,
             "modelSetDigest": hashlib.sha256(b"{}").hexdigest()}
    return {"evidence": {"scope": scope, "target": {"jerseyNumber": "8", "kitPrimaryColor": "orange"},
                         "durationSec": 2.0,
                         "references": [{"anchorId": "frame", "scope": scope, "frameIndex": 0,
                                         "timestampSec": 0.0, "evidenceHash": "c" * 64,
                                         "box": {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5}}],
                         "segments": [{"segmentId": "s", "startSec": 0.0, "endSec": 2.0,
                                       "tracklets": [{"trackletId": "SECRET_NON_TARGET", "samples": [
                                           {"timestampSec": 0.0, "jerseyRead": "9", "jerseyConfidence": 0.9,
                                            "teamMatch": 0.9, "box": [0.0, 0.0, 2.0, 2.0]}]}]}]},
            "sourceProof": {"schemaVersion": 1, "scope": scope, "evidenceFormat": "rgb24-sha256", "frames": [
                {"frameId": "frame", "framePts": 0, "timeBaseNumerator": 1, "timeBaseDenominator": 3000,
                 "timestampSec": 0.0, "frameIndex": 0, "evidenceHash": "c" * 64, "width": 4, "height": 4}]}}


@pytest.mark.parametrize("a,b,allowed", [("true", "true", True), ("true", "false", False),
                                          ("false", "true", False), ("TRUE", "true", False)])
def test_both_gates(monkeypatch, a, b, allowed):
    monkeypatch.setenv("EXPERIMENTAL_TARGET_ANCHORS", a)
    monkeypatch.setenv("CV_WORKER_APPROVED", b)
    assert enabled() is allowed
    if not allowed:
        with pytest.raises(HTTPException) as error:
            resolve_identity(MatchIdentityEnvelope.model_validate(envelope()))
        assert error.value.status_code == 404


def test_sanitized_result(monkeypatch):
    monkeypatch.setenv("EXPERIMENTAL_TARGET_ANCHORS", "true")
    monkeypatch.setenv("CV_WORKER_APPROVED", "true")
    set_components(SimpleNamespace(models={}))
    try:
        result = json.loads(resolve_identity(MatchIdentityEnvelope.model_validate(envelope())).body)
        assert "SECRET_NON_TARGET" not in json.dumps(result)
        assert "sightings" not in result["identity"]
        assert result["sourceProofSha256"]
    finally:
        set_components(None)


@pytest.mark.parametrize("case", ["generation", "source", "hash", "time", "index", "missing"])
def test_stale_proof(case):
    raw = envelope()
    proof = raw["sourceProof"]
    proof["scope"] = dict(proof["scope"])
    if case == "generation": proof["scope"]["generation"] = 2
    if case == "source": proof["scope"]["sourceSha256"] = "f" * 64
    if case == "hash": proof["frames"][0]["evidenceHash"] = "f" * 64
    if case == "time": proof["frames"][0]["timestampSec"] = 0.1
    if case == "index": proof["frames"][0]["frameIndex"] = 3
    if case == "missing": proof["frames"] = []
    with pytest.raises(ValueError):
        MatchIdentityEnvelope.model_validate(raw)


def test_http_contract_and_private_validation(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app
    monkeypatch.setenv("EXPERIMENTAL_TARGET_ANCHORS", "true")
    monkeypatch.setenv("CV_WORKER_APPROVED", "true")
    set_components(SimpleNamespace(models={}))
    try:
        with TestClient(app) as client:
            response = client.post("/v2/matches:resolve-identity", json=envelope())
            assert response.status_code == 200
            assert "SECRET_NON_TARGET" not in response.text
            raw = envelope()
            raw["evidence"]["segments"][0]["tracklets"][0]["samples"][0]["box"] = [-1, 0, 2, 2]
            response = client.post("/v2/matches:resolve-identity", json=raw)
            assert response.status_code == 422
            assert response.json() == {"detail": "invalid_request"}
            assert "SECRET_NON_TARGET" not in response.text
            monkeypatch.setenv("CV_WORKER_APPROVED", "false")
            assert client.post("/v2/matches:resolve-identity", json=envelope()).status_code == 404
    finally:
        set_components(None)
