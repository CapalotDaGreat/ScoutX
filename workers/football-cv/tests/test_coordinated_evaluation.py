import hashlib
import json

import numpy as np
import pytest

from app.experimental_identity import UserAnchor
from app.pipeline import Box, Components
from app.source_pts import SourcePtsProof
from eval import coordinated, match


def setup(tmp_path, monkeypatch):
    monkeypatch.setenv("EXPERIMENTAL_TARGET_ANCHORS", "true")
    monkeypatch.setenv("CV_WORKER_APPROVED", "true")
    video = tmp_path / "video.mp4"
    video.write_bytes(b"synthetic local source")
    models = {"detector": "synthetic"}
    monkeypatch.setattr("app.backends.model_versions", lambda: models)
    scope = {"jobId": "anchor-job", "sourceSha256": hashlib.sha256(video.read_bytes()).hexdigest(),
             "generation": 2, "modelSetDigest": hashlib.sha256(json.dumps(models, sort_keys=True, separators=(",", ":")).encode()).hexdigest()}
    rgb = np.full((100, 100, 3), (240, 130, 30), dtype=np.uint8)
    digest = hashlib.sha256(rgb.tobytes()).hexdigest()
    box = {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.5}
    anchor = UserAnchor(anchorId="frame_1", scope=scope, timestampSec=0.0, frameIndex=0, box=box, evidenceHash=digest)
    proof = SourcePtsProof.model_validate({"schemaVersion": 1, "scope": scope, "frames": [
        {"frameId": "frame_1" if i == 0 else f"sample_{i}", "framePts": i * 15,
         "timeBaseNumerator": 1, "timeBaseDenominator": 30, "timestampSec": i / 2,
         "frameIndex": i, "evidenceHash": digest, "width": 100, "height": 100} for i in range(4)]})
    monkeypatch.setattr(coordinated, "resolve_local_anchors", lambda *a, **kw: ([anchor], proof))
    def frames(*_):
        for i in range(4):
            yield i / 2, rgb
    monkeypatch.setattr(match.LocalFile, "frames", frames)
    manifest = tmp_path / "anchors.json"
    manifest.write_text(json.dumps({"scope": scope, "anchors": [{"anchorId": "frame_1", "frameId": "frame_1",
        "framePts": 0, "timeBaseNumerator": 1, "timeBaseDenominator": 30, "timestampSec": 0.0,
        "box": box, "evidenceHash": digest}]}))
    args = match.parse_args(["--input", str(video), "--out", str(tmp_path / "new"), "--jersey-number", "8",
        "--kit-primary-color", "orange", "--reference-sec", "1", "--authorize-local-evaluation", "--run",
        "--anchor-manifest", str(manifest), "--source-path", "profiles/owner/matchFootage/anchor-job/video.mp4",
        "--anchor-revision", "1"])
    class Detector:
        def people(self, _):
            return [Box(10, 10, 30, 60, 0.9), Box(50, 10, 70, 60, 0.9)]
    class Tracker:
        def update(self, boxes):
            return [(f"t{i}", b) for i, b in enumerate(boxes)]
    class Reader:
        index = 0
        def read(self, _):
            self.index += 1
            return ("8" if ((self.index - 1) // 2) % 2 == 0 else "18", 0.9)
    factory = lambda: Components(None, Detector(), Tracker, Reader(), models)
    return args, factory, rgb, scope


def test_gated_end_to_end_evaluation_persists_only_target(tmp_path, monkeypatch):
    args, factory, _, scope = setup(tmp_path, monkeypatch)
    match.evaluate(args, inspect=lambda _: 2.0, component_factory=factory)
    assert (args.out / "complete.json").exists()
    identity = json.loads((args.out / "identity.json").read_text())
    artifact = json.loads((args.out / "artifact.json").read_text())
    assert identity["identity"]["scope"] == scope
    assert identity["identity"]["calibrated"] is False
    assert "sightings" not in identity["identity"]
    assert artifact["anchorRevision"] == 1
    assert all(o["jerseyRead"] == "8" for s in artifact["evidence"]["segments"]
               for t in s["tracklets"] for o in t["samples"])
    assert len(artifact["evidence"]["segments"][0]["tracklets"]) == 1
    assert json.loads((args.out / "segment-000.json").read_text())["segment"]["identity"]["candidates"] == []


def test_frame_hash_mismatch_blocks_completion(tmp_path, monkeypatch):
    args, factory, rgb, _ = setup(tmp_path, monkeypatch)
    monkeypatch.setattr(match.LocalFile, "frames", lambda *_: iter([(0.0, rgb + 1)]))
    with pytest.raises(RuntimeError):
        match.evaluate(args, inspect=lambda _: 2.0, component_factory=factory)
    assert not (args.out / "complete.json").exists()
    assert not (args.out / "artifact.json").exists()


def test_wrong_model_scope_fails_before_sampling(tmp_path, monkeypatch):
    args, factory, _, _ = setup(tmp_path, monkeypatch)
    parts = factory()
    parts.models = {"detector": "different"}
    with pytest.raises(ValueError, match="model scope"):
        match.evaluate(args, inspect=lambda _: 2.0, component_factory=lambda: parts)
    assert not (args.out / "complete.json").exists()


def test_changed_source_is_rejected_before_coordination(tmp_path, monkeypatch):
    args, factory, _, _ = setup(tmp_path, monkeypatch)
    original = coordinated.resolve_match
    def forbidden(*_):
        pytest.fail("coordinator ran after source changed")
    monkeypatch.setattr(coordinated, "resolve_match", forbidden)
    def analyse(request, local, trace, observer):
        from app.pipeline import analyse_segment
        result = analyse_segment(request, local, trace, observer)
        args.input.write_bytes(b"changed")
        return result
    with pytest.raises(ValueError, match="source changed"):
        match.evaluate(args, inspect=lambda _: 2.0, component_factory=factory, analyse=analyse)
    assert not (args.out / "complete.json").exists()


@pytest.mark.parametrize("gate", ["EXPERIMENTAL_TARGET_ANCHORS", "CV_WORKER_APPROVED"])
def test_coordinator_cannot_run_after_gate_withdrawal(tmp_path, monkeypatch, gate):
    args, factory, _, _ = setup(tmp_path, monkeypatch)
    monkeypatch.delenv(gate)
    with pytest.raises(ValueError, match="gates"):
        match.evaluate(args, inspect=lambda _: 2.0, component_factory=factory)
    assert not (args.out / "complete.json").exists()


@pytest.mark.parametrize("failure", ["hash", "duration", "models", "unverified", "job"])
@pytest.mark.parametrize("run", [False, True])
def test_preflight_rejects_before_output_or_models(tmp_path, monkeypatch, failure, run):
    args, _, _, _ = setup(tmp_path, monkeypatch)
    args.run = run
    raw = json.loads(args.anchor_manifest.read_text())
    if failure == "hash":
        raw["scope"]["sourceSha256"] = "0" * 64
    elif failure == "duration":
        raw["anchors"][0].update(framePts=60, timestampSec=2.0)
    elif failure == "models":
        monkeypatch.setattr("app.backends.model_versions", lambda: {"detector": "other"})
    elif failure == "job":
        raw["scope"]["jobId"] = "other-job"
    else:
        def reject(*a, **kw):
            raise ValueError("frame hash mismatch")
        monkeypatch.setattr(coordinated, "resolve_local_anchors", reject)
    args.anchor_manifest.write_text(json.dumps(raw))
    with pytest.raises(ValueError):
        match.evaluate(args, inspect=lambda _: 2.0,
                       component_factory=lambda: pytest.fail("models loaded before preflight"))
    assert not args.out.exists()


@pytest.mark.parametrize("field", ["target", "durationSec", "anchorsReviewed", "anchors"])
def test_review_contradictions_rejected_before_decode(tmp_path, monkeypatch, field):
    args, _, _, _ = setup(tmp_path, monkeypatch)
    manifest = json.loads(args.anchor_manifest.read_text())
    review = dict(schemaVersion=1, sourceSha256=manifest["scope"]["sourceSha256"],
                  durationSec=2.0, target={"jerseyNumber": "8", "kitPrimaryColor": "orange"},
                  anchors=manifest, anchorReviewer="anchor-reviewer", evaluator="reviewer",
                  producer="producer", anchorsReviewed=True, blindedBeforePredictions=True,
                  authorizedLocalEvaluation=True,
                  labels=[dict(timeSec=0.0, state="unreviewed", box=None, tags=[])])
    if field == "target":
        args.jersey_number = "20"
    elif field == "durationSec":
        review[field] = 3.0
    elif field == "anchorsReviewed":
        review[field] = False
    else:
        review["anchors"]["scope"]["generation"] += 1
    args.preflight_review = tmp_path / "review.json"
    args.preflight_review.write_text(json.dumps(review))
    monkeypatch.setattr(coordinated, "resolve_local_anchors",
                        lambda *a, **kw: pytest.fail("decoded contradictory review"))
    with pytest.raises(ValueError):
        match.evaluate(args, inspect=lambda _: 2.0,
                       component_factory=lambda: pytest.fail("loaded models"))
    assert not args.out.exists()


def test_anchor_plan_verifies_frames_without_loading_models(tmp_path, monkeypatch):
    args, _, _, scope = setup(tmp_path, monkeypatch)
    args.run = False
    plan = match.evaluate(args, inspect=lambda _: 2.0,
                          component_factory=lambda: pytest.fail("plan loaded models"))
    assert plan["anchorFramesVerified"] is True
    assert plan["anchorScope"] == scope
    assert list(args.out.iterdir()) == [args.out / "plan.json"]
