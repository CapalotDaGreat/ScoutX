from __future__ import annotations

import json

from eval.evaluate import aggregate, check, evaluate_video, match_events, merge, overlap, run


def segment(windows, events=None, events_stage="unavailable", identity="CONFIRMED_VISIBLE"):
    return {
        "availability": [{"startSec": s, "endSec": e, "state": st, "confidence": 0.8} for s, e, st in windows],
        "events": events or [],
        "stages": {"events": events_stage},
        "identity": {"state": identity},
    }


def test_interval_helpers():
    assert merge([(5, 10), (0, 6), (20, 25)]) == [(0, 10), (20, 25)]
    assert overlap([(0, 10)], [(5, 15)]) == 5


def test_visibility_precision_recall_and_false_confirms():
    annotation = {"videoId": "v1", "durationSec": 100, "targetJersey": "8", "visibleIntervals": [[0, 40]], "events": []}
    result = evaluate_video(annotation, [segment([(0, 30, "CONFIRMED_VISIBLE"), (50, 60, "CONFIRMED_VISIBLE")])], 2.0)
    assert result["visible"]["precision"] == 0.75
    assert result["visible"]["recall"] == 0.75
    assert result["identity"]["falseConfirmSec"] == 10


def test_events_only_count_from_a_complete_event_stage():
    annotation = {"videoId": "v", "durationSec": 60, "targetJersey": "8", "visibleIntervals": [], "events": [{"type": "pass", "timeSec": 10}]}
    events = [{"type": "pass", "startSec": 11, "endSec": 12, "confidence": 0.9, "frameTimesSec": [11]}]
    ignored = evaluate_video(annotation, [segment([], events, "unavailable")], 2.0)
    assert ignored["events"]["predicted"] == 0
    counted = evaluate_video(annotation, [segment([], events, "complete")], 2.0)
    assert counted["events"]["precision"] == 1.0
    assert counted["events"]["meanTimestampErrorSec"] == 1.0


def test_event_matching_respects_type_and_tolerance():
    match = match_events(
        [{"type": "shot", "startSec": 10}, {"type": "pass", "startSec": 50}],
        [{"type": "pass", "timeSec": 10}, {"type": "pass", "timeSec": 55}],
        2.0,
    )
    assert match.true_positive == 0


def test_gate_fails_unmeasured_metrics_and_too_few_videos():
    summary = aggregate([evaluate_video({"videoId": "v", "durationSec": 10, "targetJersey": "8", "visibleIntervals": [[0, 5]], "events": []}, [segment([(0, 5, "CONFIRMED_VISIBLE")])], 2.0)])
    gate = check(summary, {"status": "proposed", "minimumVideos": 20, "metrics": {"visiblePrecision": {"min": 0.9}, "eventRecall": {"min": 0.6}}})
    assert gate["enoughVideos"] is False
    assert gate["metrics"]["visiblePrecision"]["pass"] is True
    assert gate["metrics"]["eventRecall"]["pass"] is False
    assert gate["pass"] is False


def test_run_reads_annotation_and_prediction_files(tmp_path):
    annotations, predictions = tmp_path / "a", tmp_path / "p"
    annotations.mkdir()
    predictions.mkdir()
    (annotations / "v1.json").write_text(json.dumps({"videoId": "v1", "durationSec": 60, "targetJersey": "8", "visibleIntervals": [[0, 30]], "events": []}))
    (predictions / "v1.json").write_text(json.dumps([segment([(0, 30, "CONFIRMED_VISIBLE")])]))
    report = run(annotations, predictions, {"minimumVideos": 1, "metrics": {"visiblePrecision": {"min": 0.9}}}, 2.0)
    assert report["summary"]["visiblePrecision"] == 1.0
    assert report["gate"]["pass"] is True
