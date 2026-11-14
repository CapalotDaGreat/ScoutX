"""2026-11-14: the experimental reader switch is off by default, fails loudly on unknown values, and never shares a
cache file with the production reader."""
import pytest

from scoutx_tracker import analyze, ocr


def test_default_is_the_production_reader(monkeypatch):
    monkeypatch.delenv("SCOUTX_OCR_VARIANT", raising=False)
    assert ocr.ocr_variant() == "binarised"
    assert analyze.ocr_cache_name() == "ocr_cache.json"


def test_unknown_variant_is_refused(monkeypatch):
    monkeypatch.setenv("SCOUTX_OCR_VARIANT", "colour")
    with pytest.raises(ValueError):
        ocr.ocr_variant()


def test_combined_variant_uses_its_own_cache_and_reader(monkeypatch):
    monkeypatch.setenv("SCOUTX_OCR_VARIANT", "combined")
    assert analyze.ocr_cache_name() == "ocr_cache.combined.json"
    calls = []
    monkeypatch.setattr(ocr, "combined_read", lambda reader, crop: calls.append("combined") or ("20", 0.95, "colour:torso1"))

    class R:
        def read(self, crop):
            calls.append("binarised")
            return (None, 0.0, None)

    assert ocr.pipeline_read(R(), object()) == ("20", 0.95, "colour:torso1")
    assert calls == ["combined"]


class _Reader:
    def __init__(self, base, alt):
        self._base = base
        self.alt = alt

    def read(self, crop):
        return self._base


@pytest.mark.parametrize("base,alt,expected", [
    (("20", 0.99, "shirt:white"), (None, 0.0, None), ("20", 0.99, "shirt:white")),
    ((None, 0.0, None), ("20", 0.96, "colour:torso1"), ("20", 0.96, "colour:torso1")),
    (("20", 0.99, "shirt:white"), ("17", 0.97, "colour:torso0"), (None, 0.0, None)),
    (("20", 0.99, "shirt:white"), ("20", 0.97, "colour:torso0"), ("20", 0.99, "shirt:white")),
])
def test_combined_read_rule(monkeypatch, base, alt, expected):
    r = _Reader(base, alt)
    monkeypatch.setattr(ocr, "colour_agreement_read", lambda reader, crop: reader.alt)
    assert ocr.combined_read(r, object()) == expected
