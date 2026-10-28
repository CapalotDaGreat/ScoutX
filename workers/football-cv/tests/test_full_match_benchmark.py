"""Full-match GPU benchmark helpers: cost model and the accuracy gate (pure functions, no GPU)."""

import importlib.util
from pathlib import Path

import pytest

_spec = importlib.util.spec_from_file_location("full_match_benchmark",
                                               Path(__file__).resolve().parents[1] / "bench" / "full_match_benchmark.py")
fmb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fmb)


def test_cost_is_measured_runtime_times_rate_and_lists_exclusions():
    c = fmb.price_breakdown(1800.0, 2.0, 60.0)
    assert c["computeUsd_estimate"] == pytest.approx(1860 * 2.0 / 3600, abs=1e-5)
    assert "Cloud Tasks/queue" in c["excluded"] and c["status"] == "estimated_from_measured_runtime"
    assert fmb.price_breakdown(10.0, None, 0.0)["status"] == "not_calculated"
    with pytest.raises(ValueError):
        fmb.price_breakdown(10.0, -1.0, 0.0)


def _gt():
    # 4 labelled frames at 10 fps: target at x=100, another player at x=500
    frames, times = {}, {}
    for i in range(4):
        frames[str(i)] = [{"box": [100, 100, 150, 250], "label": "T"}, {"box": [500, 100, 550, 250], "label": "N"}]
        times[str(i)] = i / 10
    return {"fps": 10.0, "frames": frames, "times": times}


def test_accuracy_gate_counts_false_attribution_and_rescales_boxes():
    g = _gt()
    # run at 3840x2160: boxes are twice the ground-truth coordinates
    right = [[i / 10, "LIKELY_VISIBLE", [200, 200, 300, 500]] for i in range(4)]
    a = fmb.accuracy_vs_ground_truth(right, g, (3840, 2160))
    assert a["claimedCorrectSec"] == 0.4 and a["falseAttributionSec"] == 0 and a["IDF1"] == 1.0
    wrong = [[0.0, "CONFIRMED_VISIBLE", [1000, 200, 1100, 500]], [0.1, "AMBIGUOUS", [200, 200, 300, 500]]]
    b = fmb.accuracy_vs_ground_truth(wrong, g, (3840, 2160))
    assert b["falseAttributionSec"] == 0.1 and b["confirmedWrongSec"] == 0.1 and b["claimedCorrectSec"] == 0.0
    assert b["claimedRecall"] == 0.0 and b["falseAttributionWhileOverlappingTargetSec"] == 0.0
