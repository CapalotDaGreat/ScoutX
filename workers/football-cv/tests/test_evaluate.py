from __future__ import annotations

import json

from eval.evaluate import aggregate, check, evaluate_video, identity_counts, match_events, merge, overlap, run, slice_summaries


def segment(windows, events=None, events_stage="unavailable", identity="CONFIRMED_VISIBLE", tracking="complete", analysed=None):
    return {
        "availability": [{"startSec": s, "endSec": e, "state": st, "confidence": 0.8} for s, e, st in windows],
        "events": events or [],
        "stages": {"events": events_stage, "tracking": tracking},
        "identity": {"state": identity},
        "coverage": {"analysedSec": analysed if analysed is not None else (max((e for _, e, _ in windows), default=0))},
    }


def prediction(segments, trace=None):
    return {"segments": segments, "trace": trace or [], "provenance": {"workerVersion": "football-cv/0.2.0", "models": {"detector": "x"}}}


def annotation(video_id="v", duration=100, visible=None, boxes=None, events=None, difficulty=None, annotator="a1"):
    return {
        "videoId": video_id,
        "durationSec": duration,
        "targetJersey": "8",
        "annotator": annotator,
        "difficulty": difficulty or [],
        "visibleIntervals": visible or [],
        "targetBoxes": boxes or [],
        "events": events or [],
    }


BOX = [100, 100, 140, 200]
OTHER = [500, 100, 540, 200]


def test_interval_helpers():
    assert merge([(5, 10), (0, 6), (20, 25)]) == [(0, 10), (20, 25)]
    assert overlap([(0, 10)], [(5, 15)]) == 5


def test_visibility_precision_recall_and_false_confirms():
    result = evaluate_video(annotation(visible=[[0, 40]]), prediction([segment([(0, 30, "CONFIRMED_VISIBLE"), (50, 60, "CONFIRMED_VISIBLE")], analysed=100)]), 2.0)
    summary = aggregate([result])
    assert summary["visiblePrecision"] == 0.75
    assert summary["visibleRecall"] == 0.75
    assert summary["falseConfirmRate"] == 0.25
    assert summary["coverage"] == 1.0


def test_identity_accuracy_switches_and_continuity_from_keyframes():
    truth = [{"timeSec": t, "box": BOX} for t in range(0, 10)]
    trace = [{"timeSec": t, "box": BOX if t < 4 or t >= 7 else OTHER} for t in range(0, 10)]
    counts = identity_counts(truth, trace, 0.3)
    assert counts["claimed"] == 10
    assert counts["correct"] == 7
    assert counts["wrongPerson"] == 3
    assert counts["switches"] == 2, "right -> wrong person -> right"
    assert counts["correctRunsSec"] == [3, 2]
    # Claiming the target while the annotator says it is not visible is a wrong claim.
    phantom = identity_counts([{"timeSec": 0, "box": None}], [{"timeSec": 0, "box": BOX}], 0.3)
    assert phantom["claimed"] == 1 and phantom["correct"] == 0
    missed = identity_counts([{"timeSec": 0, "box": BOX}], [], 0.3)
    assert missed["missed"] == 1 and missed["claimed"] == 0


def test_events_only_count_from_a_complete_event_stage():
    truth = annotation(duration=60, events=[{"type": "pass", "timeSec": 10}])
    events = [{"type": "pass", "startSec": 11, "endSec": 12, "confidence": 0.9, "frameTimesSec": [11]}]
    ignored = aggregate([evaluate_video(truth, prediction([segment([], events, "unavailable")]), 2.0)])
    assert ignored["eventStage"] == "not_implemented"
    assert ignored["eventPrecision"] is None
    counted = aggregate([evaluate_video(truth, prediction([segment([], events, "complete")]), 2.0)])
    assert counted["eventPrecision"] == 1.0
    assert counted["meanTimestampErrorSec"] == 1.0


def test_event_matching_respects_type_and_tolerance():
    match = match_events(
        [{"type": "shot", "startSec": 10}, {"type": "pass", "startSec": 50}],
        [{"type": "pass", "timeSec": 10}, {"type": "pass", "timeSec": 55}],
        2.0,
    )
    assert match.true_positive == 0


def test_missing_worker_output_counts_as_unreliable():
    result = evaluate_video(annotation(), {"segments": [], "trace": []}, 2.0)
    assert aggregate([result])["reliability"] == 0.0
    failed = evaluate_video(annotation(), prediction([segment([], tracking="failed")]), 2.0)
    assert aggregate([failed])["reliability"] == 0.0


THRESHOLDS = {
    "status": "proposed",
    "minimumVideos": 2,
    "minimumAnnotators": 1,
    "metrics": {"identityAccuracy": {"min": 0.9}, "visiblePrecision": {"min": 0.9}},
    "eventMetrics": {"eventPrecision": {"min": 0.85}},
    "requiredSlices": {"identical_numbers": 1},
    "sliceMetrics": ["identityAccuracy"],
}


def good_video(video_id, difficulty=None):
    boxes = [{"timeSec": t, "box": BOX} for t in range(0, 10)]
    return evaluate_video(
        annotation(video_id, visible=[[0, 10]], boxes=boxes, difficulty=difficulty),
        prediction([segment([(0, 10, "CONFIRMED_VISIBLE")], analysed=100)], [{"timeSec": t, "box": BOX} for t in range(0, 10)]),
        2.0,
    )


def test_gate_requires_videos_slices_and_measured_metrics_and_never_approves_proposed_thresholds():
    one = [good_video("v1")]
    gate = check(aggregate(one), THRESHOLDS, slice_summaries(one))
    assert gate["pass"] is False
    assert any("only 1 videos" in p for p in gate["problems"])
    assert gate["slices"]["identical_numbers"]["pass"] is False

    two = [good_video("v1"), good_video("v2", ["identical_numbers"])]
    gate = check(aggregate(two), THRESHOLDS, slice_summaries(two))
    assert gate["pass"] is True
    assert gate["approvable"] is False, "proposed thresholds are evidence, not approval"
    assert gate["events"]["pass"] is False
    assert "no event claims" in gate["events"]["note"]
    assert check(aggregate(two), {**THRESHOLDS, "status": "approved"}, slice_summaries(two))["approvable"] is True


def test_unmeasured_identity_fails_the_gate():
    video = evaluate_video(annotation("v1", visible=[[0, 10]]), prediction([segment([(0, 10, "CONFIRMED_VISIBLE")])]), 2.0)
    gate = check(aggregate([video]), {**THRESHOLDS, "minimumVideos": 1, "requiredSlices": {}})
    assert gate["metrics"]["identityAccuracy"]["reason"] == "not measured"
    assert gate["pass"] is False


def write_dataset(tmp_path, provenance=True):
    annotations, predictions = tmp_path / "a", tmp_path / "p"
    annotations.mkdir()
    predictions.mkdir()
    boxes = [{"timeSec": t, "box": BOX} for t in range(0, 10)]
    (annotations / "v1.json").write_text(json.dumps(annotation("v1", 60, [[0, 30]], boxes, difficulty=["identical_numbers"])))
    body = prediction([segment([(0, 30, "CONFIRMED_VISIBLE")], analysed=60)], [{"timeSec": t, "box": BOX} for t in range(0, 10)])
    if not provenance:
        body = body["segments"]
    (predictions / "v1.json").write_text(json.dumps(body))
    manifest = {"datasetId": "d1", "createdAt": "2026-10-01", "videos": [{"videoId": "v1", "fileName": "v1.mp4", "footageSha256": "a" * 64, "durationSec": 60, "consent": "documented"}]}
    return annotations, predictions, manifest


def test_run_reads_files_and_records_provenance(tmp_path):
    annotations, predictions, manifest = write_dataset(tmp_path)
    report = run(annotations, predictions, {**THRESHOLDS, "minimumVideos": 1}, 2.0, manifest, {"manifestSha256": "m"})
    assert report["summary"]["identityAccuracy"] == 1.0
    assert report["provenance"]["workerVersion"] == "football-cv/0.2.0"
    assert report["provenance"]["manifestSha256"] == "m"
    assert report["gate"]["pass"] is True


def test_run_fails_without_manifest_or_worker_provenance(tmp_path):
    annotations, predictions, manifest = write_dataset(tmp_path, provenance=False)
    report = run(annotations, predictions, {**THRESHOLDS, "minimumVideos": 1}, 2.0, manifest)
    assert report["gate"]["pass"] is False
    assert any("worker version" in p for p in report["gate"]["problems"])
    no_manifest = run(annotations, predictions, {**THRESHOLDS, "minimumVideos": 1}, 2.0, None)
    assert any("manifest missing" in p for p in no_manifest["gate"]["problems"])
    undocumented = {**manifest, "videos": [{**manifest["videos"][0], "consent": "unknown"}]}
    assert any("permission" in p for p in run(annotations, predictions, THRESHOLDS, 2.0, undocumented)["gate"]["problems"])
