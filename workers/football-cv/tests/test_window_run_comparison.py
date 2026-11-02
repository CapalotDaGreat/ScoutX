"""5.3 CPU-divergence tooling: layer-by-layer run comparison and decode-path probe comparison."""
import sys
from pathlib import Path

import numpy as np

BENCH = Path(__file__).resolve().parents[1] / "bench"
sys.path.insert(0, str(BENCH))
import compare_window_runs as cw  # noqa: E402
import decode_probe  # noqa: E402


def test_detection_matching_is_one_to_one_and_reports_missed_and_extra_boxes():
    a = np.array([[0, 0, 10, 20], [100, 0, 110, 20]], float)
    # two near-duplicates of the first box: only one may match it, the other is an extra box
    b = np.array([[0, 0, 10, 20], [0.5, 0, 10.5, 20], [300, 0, 310, 20]], float)
    m, only_a, only_b = cw.match(a, b)
    assert [(i, j) for i, j, _ in m] == [(0, 0)]
    assert only_a == [1]
    assert sorted(only_b) == [1, 2]


def _run(states, evidence):
    n = len(states)
    return {"timeline": {"times": np.arange(n) / 10, "present": np.array([s != "UNKNOWN" for s in states]),
                         "boxes": np.zeros((n, 4)), "states": np.array(states), "evidence": np.array(evidence)},
            "result": {"tracklets": []}}


def test_identity_intervals_keep_abstentions_as_abstentions():
    a = _run(["LIKELY_VISIBLE"] * 3 + ["AMBIGUOUS"], ["anchored"] * 3 + ["conflict"])
    b = _run(["AMBIGUOUS"] * 3 + ["AMBIGUOUS"], ["conflict"] * 4)
    r = cw.identity_layer(a, b)
    assert r["claimIntervals"] == [{"kind": "onlyA", "t0": 0.0, "t1": 0.2, "frames": 3,
                                    "evidenceA": {"anchored": 3}, "evidenceB": {"conflict": 3}}]
    assert r["stateAgreement"] == 0.25


def test_decode_compare_detects_frame_offset_hidden_behind_pixel_differences():
    a = {"backend": "FFMPEG", "cv2": "4", "hashes": {str(k): f"h{k}" for k in range(10, 20)}, "stats": {}}
    shifted = {"backend": "FFMPEG", "cv2": "5", "hashes": {str(k): f"h{k + 1}" for k in range(9, 19)}, "stats": {}}
    r = decode_probe.compare(a, shifted)
    assert r["identicalFrames"] == 0
    assert r["identicalAtOffset"]["-1"] == 9
