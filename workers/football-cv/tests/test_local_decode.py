from pathlib import Path
from fractions import Fraction
from types import SimpleNamespace
import sys

import numpy as np
import pytest

from eval.predict import LocalFile


@pytest.mark.parametrize("origin", [0, 3])
def test_local_decode_uses_file_only_and_bounds_sampling(monkeypatch, origin):
    calls = []
    stream = SimpleNamespace(time_base=Fraction(1, 100), start_time=origin * 100,
                             codec_context=SimpleNamespace())

    class Container:
        streams = SimpleNamespace(video=[stream])

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def seek(self, timestamp, **kwargs):
            assert timestamp == (origin + 1) * 100

        def decode(self, selected):
            assert selected is stream
            for timestamp in [0.5, 1.0, 1.2, 1.5, 2.0]:
                yield SimpleNamespace(pts=int(round((timestamp + origin) * 100)),
                                      time_base=Fraction(1, 100),
                                      to_ndarray=lambda **kwargs: np.zeros((2, 2, 3)))

    def open_local(path, **kwargs):
        calls.append((path, kwargs))
        return Container()

    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=open_local))
    frames = list(LocalFile(Path("fixture.mov")).frames("https://ignored.invalid", "ignored", 1, 2, 2))
    assert [timestamp for timestamp, _ in frames] == [1.0, 1.5]
    assert calls == [("fixture.mov", {"options": {"protocol_whitelist": "file"}})]
    assert stream.thread_type == "SLICE"
    assert stream.codec_context.thread_count == 1


@pytest.mark.parametrize("start,end,fps", [(1, 1, 2), (-1, 2, 2), (0, 2, 0), (0, 2, 31)])
def test_local_decode_rejects_invalid_interval(monkeypatch, start, end, fps):
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace())
    with pytest.raises(ValueError):
        list(LocalFile(Path("fixture.mov")).frames("", None, start, end, fps))


def test_missing_metadata_origin_probes_then_resets_decode(monkeypatch):
    stream = SimpleNamespace(time_base=Fraction(1, 100), start_time=None,
                             codec_context=SimpleNamespace())
    events = []
    class Container:
        streams = SimpleNamespace(video=[stream])
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def seek(self, timestamp, **kwargs):
            events.append(("seek", timestamp))
            assert timestamp == 400
        def decode(self, selected):
            events.append("decode")
            for pts in (300, 350, 400, 420, 450, 500):
                yield SimpleNamespace(pts=pts, time_base=Fraction(1, 100),
                                      to_ndarray=lambda **kw: np.zeros((2, 2, 3)))
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=lambda *a, **kw: Container()))
    frames = list(LocalFile(Path("fixture.mov")).frames("", None, 1, 2, 2))
    assert [t for t, _ in frames] == [1.0, 1.5]
    assert events == ["decode", ("seek", 400), "decode"]


def test_missing_first_pts_fails_closed(monkeypatch):
    stream = SimpleNamespace(time_base=Fraction(1, 100), start_time=None,
                             codec_context=SimpleNamespace())
    class Container:
        streams = SimpleNamespace(video=[stream])
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def decode(self, selected):
            yield SimpleNamespace(pts=None, time_base=Fraction(1, 100))
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=lambda *a, **kw: Container()))
    with pytest.raises(ValueError, match="decoded PTS"):
        list(LocalFile(Path("fixture.mov")).frames("", None, 0, 2, 2))
