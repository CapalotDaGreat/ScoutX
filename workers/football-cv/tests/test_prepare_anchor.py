import hashlib
import json
from fractions import Fraction
from types import SimpleNamespace
import sys

import numpy as np
from PIL import Image
import pytest

from app.source_pts import AnchorManifest
from eval import prepare_anchor as bootstrap


def setup(tmp_path, monkeypatch, pts=(-100, 9000, 10001, 15007), duration=30000, start_time=9000):
    source = tmp_path / "authorized.mp4"
    source.write_bytes(b"synthetic source only")
    args = SimpleNamespace(input=source, out=tmp_path / "new", reference_sec=0.1,
                           job_id="job_1", generation=2, frame_id="frame_0",
                           authorize_local_evaluation=True)
    rgb = np.arange(72, dtype=np.uint8).reshape(4, 6, 3)
    calls = []
    stream = SimpleNamespace(duration=duration, time_base=Fraction(1, 3000), start_time=start_time,
                             codec_context=SimpleNamespace())
    class Container:
        streams = SimpleNamespace(video=[stream])
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def decode(self, **kwargs):
            for p in pts:
                yield SimpleNamespace(pts=p, time_base=Fraction(1, 3000),
                                      to_ndarray=lambda **kw: rgb,
                                      to_image=lambda: Image.fromarray(rgb))
    def opened(path, **kwargs):
        calls.append((path, kwargs))
        return Container()
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=opened, time_base=1000000))
    monkeypatch.setattr(bootstrap, "model_versions", lambda: {"tracker": "test", "decoder": "fake"})
    return args, rgb, calls, stream


def test_exact_vfr_nonzero_origin_draft_and_png(tmp_path, monkeypatch):
    args, rgb, calls, stream = setup(tmp_path, monkeypatch)
    args.frame_id = "existing_app_frame"
    draft = bootstrap.prepare(args)
    anchor = draft["anchors"][0]
    assert anchor["framePts"] == 10001
    assert anchor["timestampSec"] == float(Fraction(1001, 3000))
    assert anchor["originNumerator"] == 3 and anchor["originDenominator"] == 1
    assert anchor["timeBaseNumerator"] == 1
    assert anchor["timeBaseDenominator"] == 3000
    assert anchor["anchorId"] == anchor["frameId"] == args.frame_id
    assert anchor["evidenceHash"] == hashlib.sha256(rgb.tobytes()).hexdigest()
    assert "box" not in anchor
    with pytest.raises(ValueError):
        AnchorManifest.model_validate(draft)
    assert json.loads((args.out / "manifest.draft.json").read_text()) == draft
    with Image.open(args.out / "frame.png") as image:
        assert np.array_equal(np.asarray(image), rgb)
    assert calls == [(str(args.input), {"options": {"protocol_whitelist": "file"}})]
    assert stream.thread_type == "SLICE" and stream.codec_context.thread_count == 1
    assert draft["scope"] == {"jobId": args.job_id, "generation": 2,
        "sourceSha256": hashlib.sha256(args.input.read_bytes()).hexdigest(),
        "modelSetDigest": hashlib.sha256(b'{"decoder":"fake","tracker":"test"}').hexdigest()}


def test_exact_reference_includes_equal_frame(tmp_path, monkeypatch):
    args, _, _, _ = setup(tmp_path, monkeypatch)
    args.reference_sec = 0.0
    assert bootstrap.prepare(args)["anchors"][0]["framePts"] == 9000


@pytest.mark.parametrize("reference", [-1, float("nan"), float("inf"), 10, 11])
def test_bad_reference(tmp_path, monkeypatch, reference):
    args, _, _, _ = setup(tmp_path, monkeypatch)
    args.reference_sec = reference
    with pytest.raises(ValueError): bootstrap.prepare(args)
    assert not args.out.exists()


@pytest.mark.parametrize("duration", [0, -1, 27000001, float("nan"), float("inf")])
def test_bad_duration(tmp_path, monkeypatch, duration):
    args, _, _, _ = setup(tmp_path, monkeypatch, duration=duration)
    with pytest.raises(ValueError): bootstrap.prepare(args)
    assert not args.out.exists()


def test_no_frame_after_reference(tmp_path, monkeypatch):
    args, _, _, _ = setup(tmp_path, monkeypatch, pts=(9000,))
    with pytest.raises(ValueError, match="no decoded frame"): bootstrap.prepare(args)
    assert not args.out.exists()


def test_authorization_required_for_helper_and_cli(tmp_path, monkeypatch):
    args, _, calls, _ = setup(tmp_path, monkeypatch)
    args.authorize_local_evaluation = False
    with pytest.raises(ValueError, match="authorization"): bootstrap.prepare(args)
    assert calls == []
    with pytest.raises(SystemExit):
        bootstrap.parse_args(["--input", str(args.input), "--out", str(args.out),
                              "--reference-sec", "3", "--job-id", "job", "--generation", "1"])


@pytest.mark.parametrize("existing", ["dir", "video", "annotation"])
def test_overwrite_preserves_existing(tmp_path, monkeypatch, existing):
    args, _, calls, _ = setup(tmp_path, monkeypatch)
    if existing == "dir":
        args.out.mkdir()
        marker = args.out / "annotation.json"
    elif existing == "video":
        args.out = args.input
        marker = args.input
    else:
        args.out = tmp_path / "annotation.json"
        marker = args.out
    if existing != "video": marker.write_bytes(b"keep")
    before = marker.read_bytes()
    with pytest.raises(ValueError): bootstrap.prepare(args)
    assert marker.read_bytes() == before
    assert calls == []


def test_source_change_rejected_before_output(tmp_path, monkeypatch):
    args, _, _, _ = setup(tmp_path, monkeypatch)
    original = sys.modules["av"].open
    def changed(*a, **kw):
        result = original(*a, **kw)
        args.input.write_bytes(b"changed source")
        return result
    monkeypatch.setattr(sys.modules["av"], "open", changed)
    with pytest.raises(ValueError, match="source changed"): bootstrap.prepare(args)
    assert not args.out.exists()


@pytest.mark.parametrize("path", ["https://example.test/video.mp4", "//server/share/v.mp4", r"\\server\share\v.mp4"])
def test_network_paths_rejected(tmp_path, monkeypatch, path):
    args, _, calls, _ = setup(tmp_path, monkeypatch)
    args.input = path
    with pytest.raises(ValueError): bootstrap.prepare(args)
    assert not calls


def test_no_model_initialization(tmp_path, monkeypatch):
    from app import backends
    args, _, _, _ = setup(tmp_path, monkeypatch)
    def forbidden(*a, **kw): raise AssertionError("model initialization forbidden")
    for name in ("default_components", "RtDetrDetector", "ByteTrackTracker", "EasyOcrJerseyReader"):
        monkeypatch.setattr(backends, name, forbidden)
    monkeypatch.setattr(bootstrap, "model_versions", backends.model_versions)
    assert bootstrap.prepare(args)["scope"]["modelSetDigest"]


def test_cli_success_explains_review_required(tmp_path, monkeypatch, capsys):
    args, _, _, _ = setup(tmp_path, monkeypatch)
    assert bootstrap.main(["--input", str(args.input), "--out", str(args.out), "--reference-sec", "0.1",
                           "--job-id", "job", "--generation", "1", "--authorize-local-evaluation"]) == 0
    assert "not usable until a human reviews" in capsys.readouterr().out


def test_atomic_publication_never_replaces(tmp_path):
    destination = tmp_path / "frame.png"
    destination.write_bytes(b"original")
    with pytest.raises(FileExistsError):
        bootstrap._publish(tmp_path, "frame.png", lambda output: output.write(b"replacement"))
    assert destination.read_bytes() == b"original"
    assert list(tmp_path.iterdir()) == [destination]


@pytest.mark.parametrize("field,value", [("frame_id", "../bad"), ("job_id", "bad/job"),
                                         ("generation", -1), ("generation", 1000001)])
def test_scope_and_frame_id_validation(tmp_path, monkeypatch, field, value):
    args, _, calls, _ = setup(tmp_path, monkeypatch)
    setattr(args, field, value)
    with pytest.raises(ValueError): bootstrap.prepare(args)
    assert not calls
    assert not args.out.exists()


def test_prepare_falls_back_to_first_actual_frame_origin(tmp_path, monkeypatch):
    args, _, _, _ = setup(tmp_path, monkeypatch, pts=(9000, 10001, 15007), start_time=None)
    anchor = bootstrap.prepare(args)["anchors"][0]
    assert anchor["framePts"] == 10001
    assert anchor["originNumerator"] == 3 and anchor["originDenominator"] == 1
    assert anchor["timestampSec"] == 1001 / 3000


def test_prepare_preserves_fractional_origin(tmp_path, monkeypatch):
    args, _, _, _ = setup(tmp_path, monkeypatch, pts=(9001, 10001, 15007), start_time=9001)
    anchor = bootstrap.prepare(args)["anchors"][0]
    assert anchor["framePts"] == 10001
    assert anchor["originNumerator"] == 9001 and anchor["originDenominator"] == 3000
    assert anchor["timestampSec"] == 1000 / 3000
