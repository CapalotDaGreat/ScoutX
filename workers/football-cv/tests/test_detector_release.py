"""Stage-1 sessions must be droppable. The full-match resolve died while OCR models were still
resident beside discovery and per-chunk ONNX sessions."""

from pathlib import Path

import pytest

from scoutx_tracker import extract as extract_mod
from scoutx_tracker.extract import Detector
from scoutx_tracker.yolox_net import Detector as TorchDetector
from scoutx_tracker.yolox_net import OnnxDetector


def test_onnx_session_close_drops_the_session():
    det = OnnxDetector.__new__(OnnxDetector)
    det.sess = object()
    det.close()
    assert det.sess is None


def test_detector_close_drops_the_inner_session():
    det = Detector.__new__(Detector)
    inner = OnnxDetector.__new__(OnnxDetector)
    inner.sess = object()
    det.model = inner
    det.close()
    assert det.model is None
    assert inner.sess is None


def test_torch_detector_close_drops_the_module():
    det = TorchDetector.__new__(TorchDetector)
    det.model = object()
    det.on_gpu = False
    det.close()
    assert det.model is None


def test_extract_closes_detector_when_decode_fails(tmp_path, monkeypatch):
    """A mid-chunk failure must still release the session before Stage1Store retries."""

    class FakeCap:
        def get(self, _prop):
            return 10.0

        def set(self, *_args):
            return True

        def release(self):
            return None

    class FakeDet:
        name = "fake"
        on_gpu = False
        closed = False

        def close(self):
            self.closed = True

        def batch(self, _frames):
            raise AssertionError("detect must not run after decode fails")

    fake = FakeDet()
    monkeypatch.setattr(extract_mod.cv2, "VideoCapture", lambda _path: FakeCap())
    monkeypatch.setattr(extract_mod, "Detector", lambda **_kwargs: fake)

    class BoomReader:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def read(self):
            raise RuntimeError("decode failed")

    monkeypatch.setattr(extract_mod, "CaptureReader", lambda *_args, **_kwargs: BoomReader())

    with pytest.raises(RuntimeError, match="decode failed"):
        extract_mod.extract("video.mp4", str(tmp_path / "chunk"), end=1.0)
    assert fake.closed is True
    assert not (tmp_path / "chunk" / "detections.npz").exists()
