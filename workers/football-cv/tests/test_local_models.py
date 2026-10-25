from types import SimpleNamespace
import sys

import pytest

from app import backends


@pytest.mark.parametrize("local_only,cpu", [(False, False), (True, True)])
def test_detector_and_ocr_honor_explicit_local_cpu_policy(monkeypatch, local_only, cpu):
    calls = []

    class Model:
        def to(self, device):
            calls.append(("device", device))
            return self

        def eval(self):
            return self

    class Loader:
        @staticmethod
        def from_pretrained(name, **kwargs):
            calls.append(("weights", kwargs))
            return Model()

    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True)))
    monkeypatch.setitem(sys.modules, "transformers", SimpleNamespace(AutoImageProcessor=Loader, RTDetrForObjectDetection=Loader))
    monkeypatch.setitem(sys.modules, "easyocr", SimpleNamespace(Reader=lambda *args, **kwargs: calls.append(("ocr", kwargs))))
    backends.RtDetrDetector(local_only=local_only, cpu=cpu)
    backends.EasyOcrJerseyReader(local_only=local_only, cpu=cpu)
    assert [value for kind, value in calls if kind == "weights"] == [{"local_files_only": local_only}] * 2
    assert ("device", "cpu" if cpu else "cuda") in calls
    assert ("ocr", {"gpu": not cpu, "download_enabled": not local_only, "verbose": False}) in calls


def test_factory_forwards_policy_without_changing_defaults(monkeypatch):
    calls = []
    monkeypatch.setattr(backends, "RtDetrDetector", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(backends, "EasyOcrJerseyReader", lambda **kwargs: calls.append(kwargs))
    backends.default_components(local_only=True, cpu=True)
    assert calls == [{"local_only": True, "cpu": True}] * 2
    calls.clear()
    backends.default_components()
    assert calls == [{"local_only": False, "cpu": False}] * 2
