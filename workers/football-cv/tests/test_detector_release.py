"""Stage-1 sessions must be droppable. The full-match resolve died while OCR models were still
resident beside discovery and per-chunk ONNX sessions."""

from scoutx_tracker.extract import Detector
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
