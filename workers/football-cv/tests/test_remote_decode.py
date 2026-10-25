from fractions import Fraction
from types import SimpleNamespace
import sys

import numpy as np

from app.backends import PyAvFrameSource


def test_remote_decode_uses_recording_clock_without_relaxing_network_policy(monkeypatch):
    stream = SimpleNamespace(start_time=300, time_base=Fraction(1, 100), codec_context=SimpleNamespace())
    calls = []
    class Container:
        streams = SimpleNamespace(video=[stream])
        def __enter__(self): return self
        def __exit__(self, *_): pass
        def seek(self, timestamp, **kwargs):
            assert timestamp == 400
        def decode(self, _):
            for pts in (350, 400, 420, 450, 500):
                yield SimpleNamespace(pts=pts, time_base=Fraction(1, 100),
                    to_ndarray=lambda **kw: np.zeros((2, 2, 3), dtype=np.uint8))
    def opened(url, **kwargs):
        calls.append((url, kwargs))
        return Container()
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=opened))
    frames = list(PyAvFrameSource().frames("https://media.invalid/signed", None, 1, 2, 2))
    assert [t for t, _ in frames] == [1, 1.5]
    assert calls[0][1]["options"]["protocol_whitelist"] == "http,https,tcp,tls"
    assert "file" not in calls[0][1]["options"]["protocol_whitelist"]
    assert calls[0][1]["timeout"] == 60
