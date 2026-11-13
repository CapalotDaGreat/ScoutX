"""2026-11-14: OCR device placement is reported, and a CUDA host whose recognisers stay on the CPU is a recorded
degraded mode (or refused with SCOUTX_REQUIRE_GPU_OCR=1), never a silent fallback."""

from __future__ import annotations

import sys
import types

import pytest

from scoutx_tracker import ocr


class _Param:
    def __init__(self, device: str) -> None:
        self.device = device


class _Net:
    def __init__(self, device: str) -> None:
        self._device = device

    def parameters(self):
        return iter([_Param(self._device)])


class _Predictor:
    def __init__(self, device: str = "cpu", fail_move: bool = False) -> None:
        self.model = _Net(device)
        self.fail_move = fail_move

    def cuda(self):
        if self.fail_move:
            raise RuntimeError("no kernel image is available")
        return _Predictor("cuda:0")


def _install(monkeypatch, *, cuda: bool, fail_move: bool, easy_device: str) -> None:
    import torch

    monkeypatch.setattr(torch.cuda, "is_available", lambda: cuda)
    doctr_models = types.ModuleType("doctr.models")
    doctr_models.recognition_predictor = lambda name, pretrained=True: _Predictor("cpu", fail_move)
    monkeypatch.setitem(sys.modules, "doctr", types.ModuleType("doctr"))
    monkeypatch.setitem(sys.modules, "doctr.models", doctr_models)
    easy = types.ModuleType("easyocr")

    class Reader:
        def __init__(self, langs, gpu=False, verbose=False):
            self.device = easy_device

    easy.Reader = Reader
    monkeypatch.setitem(sys.modules, "easyocr", easy)


def test_cpu_host_reports_cpu_and_is_not_degraded(monkeypatch):
    _install(monkeypatch, cuda=False, fail_move=False, easy_device="cpu")
    r = ocr.NumberReader()
    assert r.device_report == {"cudaAvailable": False, "parseq": "cpu", "easyocr": "cpu", "degraded": []}


def test_cuda_host_with_both_on_gpu_is_clean(monkeypatch):
    _install(monkeypatch, cuda=True, fail_move=False, easy_device="cuda")
    r = ocr.NumberReader()
    assert r.device_report["parseq"] == "cuda:0"
    assert r.device_report["degraded"] == []


def test_failed_move_is_recorded_not_silent(monkeypatch, caplog):
    _install(monkeypatch, cuda=True, fail_move=True, easy_device="cuda")
    monkeypatch.delenv("SCOUTX_REQUIRE_GPU_OCR", raising=False)
    r = ocr.NumberReader()
    assert r.device_report["parseq"] == "cpu"
    assert any("parseq stayed on CPU" in d for d in r.device_report["degraded"])
    assert any("parseq runs on cpu" in d for d in r.device_report["degraded"])
    assert "OCR degraded mode" in caplog.text


def test_failed_move_is_refused_when_gpu_ocr_is_required(monkeypatch):
    _install(monkeypatch, cuda=True, fail_move=True, easy_device="cuda")
    monkeypatch.setenv("SCOUTX_REQUIRE_GPU_OCR", "1")
    with pytest.raises(RuntimeError, match="OCR is not on the GPU"):
        ocr.NumberReader()


def test_easyocr_on_cpu_under_cuda_is_degraded(monkeypatch):
    _install(monkeypatch, cuda=True, fail_move=False, easy_device="cpu")
    r = ocr.NumberReader()
    assert r.device_report["degraded"] == ["easyocr runs on cpu although CUDA is available"]


def test_module_device_handles_predictors_without_parameters():
    assert ocr.module_device(object()) == "unknown"
