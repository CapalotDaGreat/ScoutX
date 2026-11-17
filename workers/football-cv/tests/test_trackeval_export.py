"""bench/trackeval_export.py: single-target MOT export keeps abstention, unsure frames and target-absent claims apart."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bench"))
import trackeval_export as te


def test_export_semantics(tmp_path, monkeypatch):
    T = [100, 100, 150, 300]
    gt = {"intervals": [[0, 0.5]], "times": {"a": 0.0, "b": 0.1, "c": 0.2, "d": 0.3, "e": 0.4},
          "frames": {"a": [{"label": "T", "box": T}], "b": [{"label": "T", "box": T}],
                     "c": [{"label": "?", "box": [400, 100, 450, 300]}, {"label": "T", "box": T}],
                     "d": [{"label": "N", "box": [600, 100, 650, 300]}], "e": [{"label": "T", "box": T}]}}
    monkeypatch.setattr(te, "load_labels", lambda stored: gt)
    times = np.round(np.arange(0, 0.5, 0.1), 2)
    boxes = np.array([T, T, [400, 100, 450, 300], [600, 100, 650, 300], T], float)
    states = np.array(["CONFIRMED_VISIBLE", "LIKELY_VISIBLE", "CONFIRMED_VISIBLE", "LIKELY_VISIBLE", "AMBIGUOUS"])
    present = np.array([True, True, True, True, True])
    np.savez(tmp_path / "tl.npz", times=times, boxes=boxes, states=states, present=present)
    m = te.export(tmp_path / "tl.npz", tmp_path / "out", {"CONFIRMED_VISIBLE", "LIKELY_VISIBLE"})
    s = m["sequences"]["img4809-i0"]
    assert s["droppedUnsure"] == 1  # claim on the "?" box: neither scored right nor wrong
    gt_rows = (tmp_path / "out/gt/img4809-i0/gt/gt.txt").read_text().split()
    pr_rows = (tmp_path / "out/trackers/engine/data/img4809-i0.txt").read_text().split()
    assert len(gt_rows) == 3  # frames a, b, e (c dropped)
    assert len(pr_rows) == 3  # a, b and the claim on N at d; e is AMBIGUOUS = abstention (no row)
    assert any(r.startswith("4,1,600.0") for r in pr_rows)  # frame index keeps its position; target absent, claim on N
    conf = te.export(tmp_path / "tl.npz", tmp_path / "out2", {"CONFIRMED_VISIBLE"})
    assert conf["sequences"]["img4809-i0"]["predictionRows"] == 1


def test_missing_prediction_sample_is_an_error(tmp_path, monkeypatch):
    gt = {"intervals": [[0, 1]], "times": {"a": 0.0, "b": 0.7}, "frames": {"a": [], "b": []}}
    monkeypatch.setattr(te, "load_labels", lambda stored: gt)
    np.savez(tmp_path / "tl.npz", times=np.array([0.0]), boxes=np.zeros((1, 4)), states=np.array(["UNKNOWN"]), present=np.array([False]))
    try:
        te.export(tmp_path / "tl.npz", tmp_path / "o", {"CONFIRMED_VISIBLE"})
    except SystemExit as e:
        assert "no prediction sample" in str(e)
    else:
        raise AssertionError("expected an error")
