"""Decoder lifecycle regressions: chunks must not leak captures or hide read failures."""

import threading

import pytest

from scoutx_tracker.frame_reader import CaptureReader


class Capture:
    def __init__(self, count=20, fail_at=None):
        self.count, self.fail_at = count, fail_at
        self.index = 0
        self.releases = 0
        self.owner = None

    def read(self):
        self.owner = threading.get_ident()
        if self.index == self.fail_at:
            raise ValueError("broken decoder")
        if self.index >= self.count:
            return False, None
        frame = self.index
        self.index += 1
        return True, frame

    def release(self):
        assert self.owner in (None, threading.get_ident())
        self.releases += 1


@pytest.mark.parametrize("prefetch", [0, 1, 4])
def test_frame_order_and_eof(prefetch):
    cap = Capture()
    frames = []
    with CaptureReader(cap, prefetch) as reader:
        while True:
            ok, frame = reader.read()
            if not ok:
                break
            frames.append(frame)
    assert frames == list(range(20))
    assert cap.releases == 1
    assert reader.thread is None or not reader.thread.is_alive()


def test_chunk_boundary_stops_full_prefetch_queue():
    cap = Capture(count=1_000_000)
    with CaptureReader(cap, 1) as reader:
        assert reader.read() == (True, 0)
    assert not reader.thread.is_alive()
    assert reader.queue.empty()
    assert cap.releases == 1
    assert cap.index < cap.count


@pytest.mark.parametrize("prefetch", [0, 1, 4])
def test_decoder_error_reaches_caller_and_releases_capture(prefetch):
    cap = Capture(fail_at=2)
    with pytest.raises(ValueError, match="broken decoder"):
        with CaptureReader(cap, prefetch) as reader:
            assert reader.read() == (True, 0)
            assert reader.read() == (True, 1)
            reader.read()
    assert cap.releases == 1
    assert reader.thread is None or not reader.thread.is_alive()


def test_consumer_error_stops_decoder():
    cap = Capture(count=1_000_000)
    with pytest.raises(RuntimeError, match="inference failed"):
        with CaptureReader(cap, 1) as reader:
            reader.read()
            raise RuntimeError("inference failed")
    assert cap.releases == 1
    assert not reader.thread.is_alive()


def test_extract_chunk_prefetch_matches_synchronous_output(tmp_path, monkeypatch):
    import cv2
    import numpy as np

    import scoutx_tracker.extract as extraction

    captures = []

    class Video(Capture):
        def get(self, prop):
            return {cv2.CAP_PROP_FPS: 10, cv2.CAP_PROP_FRAME_WIDTH: 160,
                    cv2.CAP_PROP_FRAME_HEIGHT: 90}.get(prop, 0)

        def read(self):
            ok, index = super().read()
            return ok, np.full((90, 160, 3), index, np.uint8) if ok else None

    def open_video(_):
        cap = Video(count=50)
        captures.append(cap)
        return cap

    class Detector:
        on_gpu = True
        name = "test-empty"

        def __init__(self, **kwargs):
            pass

        def batch(self, frames):
            return [(np.empty((0, 4), np.float32), np.empty(0, np.float32),
                     np.empty((0, 4), np.float32), np.empty(0, np.float32)) for _ in frames]

    monkeypatch.setattr(extraction.cv2, "VideoCapture", open_video)
    monkeypatch.setattr(extraction, "Detector", Detector)
    for prefetch in (0, 4):
        extraction.extract("fake", str(tmp_path / str(prefetch)), end=0.3, batch=2, prefetch=prefetch)
    with np.load(tmp_path / "0" / "detections.npz") as sync, np.load(tmp_path / "4" / "detections.npz") as async_:
        for key in sync.files:
            np.testing.assert_array_equal(sync[key], async_[key])
        np.testing.assert_array_equal(sync["times"], [0, 0.1, 0.2])
    assert all(cap.releases == 1 for cap in captures)
