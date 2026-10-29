"""A zero-budget correction uses cached evidence without loading OCR models."""

import json

from scoutx_tracker.analyze import crop_key, run_ocr


def test_zero_budget_with_unchanged_clock_keeps_cached_reads(tmp_path, monkeypatch):
    import scoutx_tracker.analyze as analysis
    import scoutx_tracker.ocr as ocr

    monkeypatch.setattr(analysis.time, "time", lambda: 100.0)
    monkeypatch.setattr(analysis.time, "perf_counter", lambda: 10.0)

    def load_reader():
        raise AssertionError("zero-budget correction must not load OCR models")

    monkeypatch.setattr(ocr, "shared_reader", load_reader)
    cached, fresh = "/x/c_00000/crops/000001_1.jpg", "/x/c_00000/crops/000002_2.jpg"
    cache = {crop_key(cached): ["20", 0.97, "shirt:white"]}
    path = tmp_path / "ocr.json"
    path.write_text(json.dumps(cache))
    skipped = []
    result = run_ocr({1: [cached, fresh]}, path, budget_sec=0, skipped=skipped)
    assert result == cache
    assert skipped == [crop_key(fresh)]
    assert json.loads(path.read_text()) == cache
