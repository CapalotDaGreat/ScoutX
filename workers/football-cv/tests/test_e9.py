"""E9 (2026-11-21): synthetic jersey-number data and the default-off fine-tuned PARSeq override."""

from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np
import pytest

from scoutx_tracker.ocr import apply_parseq_override

FONT_DIRS = [Path("/usr/share/fonts/truetype/dejavu"), Path("/usr/share/fonts/truetype/google-fonts/ofl/anton")]


def _fonts():
    from bench.e9.synth import fonts_in

    fonts = fonts_in([str(d) for d in FONT_DIRS if d.is_dir()])
    if not fonts:
        pytest.skip("no test fonts installed")
    return fonts


def test_synth_is_deterministic_and_labels_are_numbers():
    from bench.e9.synth import make_sample

    fonts = _fonts()
    a = make_sample(np.random.default_rng(7), fonts)
    b = make_sample(np.random.default_rng(7), fonts)
    assert np.array_equal(a.crop, b.crop) and a.label == b.label
    assert a.label.isdigit() and 1 <= int(a.label) <= 99
    x1, y1, x2, y2 = a.digit_box
    assert 0 <= x1 < x2 <= a.crop.shape[1] and 0 <= y1 < y2 <= a.crop.shape[0]


def test_engine_patches_only_keep_boxes_on_the_true_digits():
    from bench.e9.synth import engine_patches, make_sample

    fonts = _fonts()
    rng = np.random.default_rng(3)
    kept = 0
    for _ in range(200):
        s = make_sample(rng, fonts)
        for kind, p in engine_patches(s):
            kept += 1
            assert p.shape[0] == 64 and p.ndim == 3          # exactly the engine's PARSeq input format
            assert kind.split(":")[0] == s.band
        moved = s.__class__(s.crop, s.label, (0, 0, 2, 2), s.band)
        assert engine_patches(moved) == []                    # a box away from the digits is never kept
    assert kept > 20


class _Tiny:
    def __init__(self):
        import torch

        self.net = torch.nn.Linear(2, 2)

    def load_state_dict(self, sd, strict=True):
        return self.net.load_state_dict(sd, strict=strict)

    def eval(self):
        self.net.eval()


def test_override_is_off_by_default(monkeypatch):
    monkeypatch.delenv("SCOUTX_PARSEQ_WEIGHTS", raising=False)
    assert apply_parseq_override(_Tiny()) == "pretrained"


def test_override_requires_matching_sha(tmp_path):
    import torch

    src = torch.nn.Linear(2, 2)
    p = tmp_path / "w.pt"
    torch.save(src.state_dict(), p)
    digest = hashlib.sha256(p.read_bytes()).hexdigest()
    with pytest.raises(RuntimeError):
        apply_parseq_override(_Tiny(), str(p), "")
    with pytest.raises(RuntimeError):
        apply_parseq_override(_Tiny(), str(p), "0" * 64)
    t = _Tiny()
    assert apply_parseq_override(t, str(p), digest) == f"override:{digest}"
    assert torch.equal(t.net.weight, src.weight)


def test_keep_rule_rejects_any_teammate_read_and_needs_a_clear_rise():
    from bench.e9.eval_crops import decide, score

    rows = [{"file": f"t{i}", "target": True, "piece": f"p{i % 4}"} for i in range(8)] + \
           [{"file": f"m{i}", "target": False, "piece": f"q{i}"} for i in range(4)]
    base = score(rows, [None] * 12, "20")
    good = score(rows, ["20"] * 6 + [None] * 6, "20")
    assert decide(base, good)["keep"] is True
    leak = score(rows, ["20"] * 6 + [None] * 2 + ["20"] + [None] * 3, "20")
    assert decide(base, leak)["checks"]["zeroTeammateReadAsNumber"] is False and not decide(base, leak)["keep"]
    small = score(rows, ["20"] * 4 + [None] * 8, "20")
    assert decide(base, small)["keep"] is False
    other = score(rows, ["20"] * 6 + ["17"] + [None] * 5, "20")
    assert decide(base, other)["checks"]["noRiseInOtherNumberOnTarget"] is False


def test_quantised_detector_export_is_labelled(tmp_path):
    from scoutx_tracker.yolox_net import onnx_is_quantised

    fp32 = tmp_path / "a.onnx"
    fp32.write_bytes(b"\x08\x07Conv\x12Sigmoid")
    q = tmp_path / "b.onnx"
    q.write_bytes(b"\x08\x07QuantizeLinear\x12DequantizeLinear Conv")
    assert onnx_is_quantised(fp32) is False
    assert onnx_is_quantised(q) is True


@pytest.mark.parametrize(("content", "name"), [(b"Conv Sigmoid", "yolox_s@1280/onnx"),
                                               (b"QuantizeLinear Conv", "yolox_s@1280/onnx-int8")])
def test_onnx_detector_reports_int8_in_its_name(tmp_path, monkeypatch, content, name):
    import onnxruntime as ort

    from scoutx_tracker.yolox_net import OnnxDetector

    weights = tmp_path / "yolox_s.pth"
    weights.write_bytes(b"x")
    (tmp_path / "yolox_s.1280.onnx").write_bytes(content)

    class _Sess:
        def __init__(self, *a, **k):
            pass

        def get_providers(self):
            return ["CPUExecutionProvider"]

    monkeypatch.setattr(ort, "InferenceSession", _Sess)
    monkeypatch.setattr(ort, "get_available_providers", lambda: ["CPUExecutionProvider"])
    monkeypatch.delenv("SCOUTX_ORT_PROVIDERS", raising=False)
    assert OnnxDetector("yolox_s", weights, 1280).name == name
