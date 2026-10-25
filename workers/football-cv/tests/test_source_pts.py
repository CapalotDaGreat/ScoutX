import hashlib
from fractions import Fraction
from types import SimpleNamespace
import sys

import numpy as np
import pytest

from app.source_pts import AnchorManifest, resolve_local_anchors


def fixture(tmp_path, monkeypatch, pts=(9000, 10001, 13007), start_time=0):
    path = tmp_path / "source.mp4"
    path.write_bytes(b"synthetic source, not footage")
    rgb = np.zeros((4, 6, 3), dtype=np.uint8)
    frames = [SimpleNamespace(pts=p, time_base=Fraction(1, 3000),
                              to_ndarray=lambda **kw: rgb) for p in pts]
    stream = SimpleNamespace(start_time=start_time, time_base=Fraction(1, 3000),
                             codec_context=SimpleNamespace(thread_count=0))
    class Container:
        streams = SimpleNamespace(video=[stream])
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def decode(self, **kwargs): return iter(frames)
    calls = []
    def opened(path, **kwargs):
        calls.append(kwargs)
        return Container()
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=opened, frames=frames, stream=stream))
    manifest = {"scope": {"jobId": "job", "sourceSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                           "generation": 2, "modelSetDigest": "b" * 64},
                "anchors": [{"anchorId": "frame", "frameId": "frame", "framePts": 10001,
                             "timeBaseNumerator": 1, "timeBaseDenominator": 3000,
                             "timestampSec": 10001 / 3000,
                             "box": {"x": 0.0, "y": 0.0, "width": 0.5, "height": 0.5},
                             "evidenceHash": hashlib.sha256(rgb.tobytes()).hexdigest()}]}
    return path, manifest, calls


def test_vfr_nonzero_origin_exact_pts(tmp_path, monkeypatch):
    path, manifest, calls = fixture(tmp_path, monkeypatch, start_time=9000)
    manifest["anchors"][0].update(originNumerator=3, originDenominator=1, timestampSec=1001 / 3000)
    anchors, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest))
    assert anchors[0].frameIndex == 1
    assert anchors[0].timestampSec == 1001 / 3000
    assert proof.frames[0].rational() == Fraction(10001, 3000)
    assert proof.frames[0].origin() == 3
    assert proof.frames[0].width == 6
    assert proof.scope == anchors[0].scope
    assert calls == [{"options": {"protocol_whitelist": "file"}}]


def test_hash_checked_before_decode(tmp_path, monkeypatch):
    path, manifest, calls = fixture(tmp_path, monkeypatch)
    manifest["scope"]["sourceSha256"] = "f" * 64
    with pytest.raises(ValueError, match="source hash"):
        resolve_local_anchors(path, AnchorManifest.model_validate(manifest))
    assert not calls


@pytest.mark.parametrize("case", ["hash", "missing", "ambiguous", "duplicate", "rounded", "box"])
def test_bad_claims(tmp_path, monkeypatch, case):
    path, manifest, _ = fixture(tmp_path, monkeypatch, (10001, 10001) if case == "ambiguous" else (9000, 10001))
    anchor = manifest["anchors"][0]
    if case == "hash": anchor["evidenceHash"] = "f" * 64
    if case == "missing": anchor.update(framePts=14000, timestampSec=14000 / 3000)
    if case == "duplicate": manifest["anchors"].append(dict(anchor))
    if case == "rounded": anchor["timestampSec"] = 3.334
    if case == "box": anchor["box"]["width"] = 1.1
    with pytest.raises(ValueError):
        resolve_local_anchors(path, AnchorManifest.model_validate(manifest))


def test_source_changed_during_decode(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch)
    av = sys.modules["av"]
    original = av.open
    def changed(*args, **kwargs):
        container = original(*args, **kwargs)
        path.write_bytes(b"changed")
        return container
    av.open = changed
    with pytest.raises(ValueError, match="source changed"):
        resolve_local_anchors(path, AnchorManifest.model_validate(manifest))


def test_manifest_bounded_and_duplicate_keys(tmp_path):
    from app.source_pts import load_anchor_manifest
    path = tmp_path / "manifest.json"
    for data in (b" " * 65537, b'{"scope":{},"scope":{}}'):
        path.write_bytes(data)
        with pytest.raises(ValueError):
            load_anchor_manifest(path)


def test_vfr_sampling_uses_exact_global_indices_and_anchor_precedence(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch, (-300, 0, 100, 1501, 2000, 3100, 10001, 11000))
    conversions = []
    for index, frame in enumerate(sys.modules["av"].frames):
        original = frame.to_ndarray
        def converted(*, format, index=index, original=original):
            conversions.append(index)
            assert format == "rgb24"
            return original(format=format)
        frame.to_ndarray = converted
    anchors, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=2.0)
    assert [f.frameIndex for f in proof.frames] == [1, 3, 5, 6]
    assert [f.frameId for f in proof.frames] == ["sample_1", "sample_3", "sample_5", "frame"]
    assert [f.framePts for f in proof.frames] == [0, 1501, 3100, 10001]
    assert all(f.rational() == Fraction(f.framePts, 3000) for f in proof.frames)
    assert conversions == [1, 3, 5, 6]
    assert anchors[0].frameIndex == 6
    assert sys.modules["av"].stream.thread_type == "SLICE"
    assert sys.modules["av"].stream.codec_context.thread_count == 1


def test_sampling_resets_at_600_second_boundary(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch, (10001, 1799700, 1800000, 1800300, 1801501))
    _, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=2)
    assert [f.frameIndex for f in proof.frames] == [0, 1, 2, 4]
    assert proof.frames[2].timestampSec == 600.0


@pytest.mark.parametrize("sample_fps", [None, 2.0])
@pytest.mark.parametrize("pts", [(9000, 9000, 10001), (9000, 8000, 10001)])
def test_rejects_duplicate_or_backward_pts_even_outside_anchor(tmp_path, monkeypatch, sample_fps, pts):
    path, manifest, _ = fixture(tmp_path, monkeypatch, pts)
    with pytest.raises(ValueError, match="strictly increase"):
        resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=sample_fps)


@pytest.mark.parametrize("fps", [0, -1, 31, float("nan"), float("inf"), float("-inf"), True, "2"])
def test_invalid_sampling_fps_rejected_before_decode(tmp_path, monkeypatch, fps):
    path, manifest, calls = fixture(tmp_path, monkeypatch)
    with pytest.raises(ValueError, match="invalid sample fps"):
        resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=fps)
    assert calls == []


def test_sampling_nonzero_origin_resets_relative_600_boundary(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch,
        pts=(9000, 10001, 10501, 1808700, 1809000, 1810501), start_time=9000)
    manifest["anchors"][0].update(originNumerator=3, originDenominator=1, timestampSec=1001 / 3000)
    anchors, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=2)
    assert [f.frameIndex for f in proof.frames] == [0, 1, 2, 3, 4, 5]
    assert proof.frames[4].timestampSec == 600.0
    assert anchors[0].frameIndex == 1
    assert all(f.origin() == 3 for f in proof.frames)
    assert proof.frames[1].frameId == "frame"


def test_first_decoded_pts_fallback_origin(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch, start_time=None)
    manifest["anchors"][0].update(originNumerator=3, originDenominator=1, timestampSec=1001 / 3000)
    _, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=2)
    assert proof.frames[0].timestampSec == 0.0
    assert proof.frames[0].frameIndex == 0
    assert proof.frames[0].origin() == 3


def test_manifest_origin_must_match_source(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch, start_time=9000)
    with pytest.raises(ValueError, match="origin mismatch"):
        resolve_local_anchors(path, AnchorManifest.model_validate(manifest))


def test_proof_requires_consistent_origins(tmp_path, monkeypatch):
    from app.source_pts import SourcePtsProof
    path, manifest, _ = fixture(tmp_path, monkeypatch)
    _, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=2)
    raw = proof.model_dump()
    raw["frames"][0].update(originNumerator=1, timestampSec=2.0)
    with pytest.raises(ValueError, match="inconsistent recording origin"):
        SourcePtsProof.model_validate(raw)


def test_fractional_recording_origin_is_not_rounded(tmp_path, monkeypatch):
    path, manifest, _ = fixture(tmp_path, monkeypatch, pts=(9001, 10001, 12003), start_time=9001)
    manifest["anchors"][0].update(originNumerator=9001, originDenominator=3000,
                                   timestampSec=1000 / 3000)
    _, proof = resolve_local_anchors(path, AnchorManifest.model_validate(manifest), sample_fps=2)
    assert all(f.origin() == Fraction(9001, 3000) for f in proof.frames)
    assert proof.frames[0].timestampSec == 0.0
    assert proof.frames[1].rational() == Fraction(10001, 3000)
    assert proof.frames[1].timestampSec == 1000 / 3000
