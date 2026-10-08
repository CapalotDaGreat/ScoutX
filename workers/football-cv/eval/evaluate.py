"""Scores worker output against human annotations of real footage.

Usage:
    python -m eval.evaluate --manifest data/manifest.json --annotations data/annotations \
        --predictions data/predictions --thresholds eval/thresholds.json --out report.json

Annotations (one JSON per video, see annotation.schema.json) are made by a person watching the
footage. Predictions come from `eval.predict` (segments, provenance and a local identity trace).
The manifest (manifest.schema.json) lists every video with the SHA-256 of the footage so the run
can be repeated by someone else. Every video carries raw counts and every summary metric is a
ratio of their sums, so scripts/lib/cvApproval.mjs can recompute the summary from the report.

The thresholds file is a PROPOSAL until the product owner approves it. This script only reports;
it never changes a production switch.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

EVALUATOR_VERSION = "pitchproof-eval/2"
DIFFICULTY_TAGS = (
    "occlusion",
    "camera_movement",
    "low_light",
    "similar_kits",
    "identical_numbers",
    "substitution",
    "off_camera_periods",
    "re_entry",
)
# Keyframe boxes must overlap this much for "the worker pointed at the right person".
IDENTITY_IOU = 0.5

Interval = tuple[float, float]


def merge(intervals: list[Interval]) -> list[Interval]:
    out: list[Interval] = []
    for start, end in sorted((s, e) for s, e in intervals if e > s):
        if out and start <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], end))
        else:
            out.append((start, end))
    return out


def total(intervals: list[Interval]) -> float:
    return sum(e - s for s, e in merge(intervals))


def overlap(a: list[Interval], b: list[Interval]) -> float:
    a, b = merge(a), merge(b)
    i = j = 0
    shared = 0.0
    while i < len(a) and j < len(b):
        start = max(a[i][0], b[j][0])
        end = min(a[i][1], b[j][1])
        if end > start:
            shared += end - start
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return shared


def ratio(numerator: float, denominator: float) -> float | None:
    return None if denominator <= 0 else numerator / denominator


def iou(a: list[float], b: list[float]) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


@dataclass
class EventMatch:
    true_positive: int
    predicted: int
    actual: int
    timestamp_errors: list[float]


def match_events(predicted: list[dict], actual: list[dict], tolerance_sec: float) -> EventMatch:
    """Greedy one-to-one matching by type within the tolerance, closest first."""
    used: set[int] = set()
    errors: list[float] = []
    for event in sorted(predicted, key=lambda e: e["startSec"]):
        best, best_error = None, None
        for index, truth in enumerate(actual):
            if index in used or truth["type"] != event["type"]:
                continue
            error = abs(truth["timeSec"] - event["startSec"])
            if error <= tolerance_sec and (best_error is None or error < best_error):
                best, best_error = index, error
        if best is not None:
            used.add(best)
            errors.append(best_error)
    return EventMatch(len(used), len(predicted), len(actual), errors)


def identity_counts(truth_boxes: list[dict], trace: list[dict], match_window_sec: float) -> dict:
    """Per annotated keyframe: did the worker point at the target, someone else, or nobody?

    `claimed` counts keyframes where the worker asserted a target box; `correct` those where it
    overlaps the annotated target. A switch is a change between right and wrong person on
    consecutive claimed keyframes. Runs are spans of consecutive correct keyframes."""
    claimed = correct = wrong_person = missed = 0
    switches = 0
    runs: list[float] = []
    previous: bool | None = None
    run_start: float | None = None
    last_correct: float | None = None
    for key in sorted(truth_boxes, key=lambda k: k["timeSec"]):
        time = key["timeSec"]
        nearby = [p for p in trace if abs(p["timeSec"] - time) <= match_window_sec]
        predicted = min(nearby, key=lambda p: abs(p["timeSec"] - time))["box"] if nearby else None
        truth = key.get("box")
        if predicted is None:
            if truth is not None:
                missed += 1
            outcome = None
        else:
            claimed += 1
            outcome = truth is not None and iou(predicted, truth) >= IDENTITY_IOU
            if outcome:
                correct += 1
            else:
                wrong_person += 1
            if previous is not None and outcome != previous:
                switches += 1
            previous = outcome
        if outcome:
            run_start = time if run_start is None else run_start
            last_correct = time
        elif run_start is not None and last_correct is not None:
            runs.append(last_correct - run_start)
            run_start = last_correct = None
    if run_start is not None and last_correct is not None:
        runs.append(last_correct - run_start)
    return {
        "keyframes": len(truth_boxes),
        "claimed": claimed,
        "correct": correct,
        "wrongPerson": wrong_person,
        "missed": missed,
        "switches": switches,
        "correctRunsSec": [round(r, 3) for r in runs],
    }


def evaluate_video(annotation: dict, prediction: dict, tolerance_sec: float, match_window_sec: float = 0.3) -> dict:
    segments = prediction.get("segments", [])
    windows = [w for s in segments for w in s.get("availability", [])]
    visible_pred = [(w["startSec"], w["endSec"]) for w in windows if w["state"] == "CONFIRMED_VISIBLE"]
    off_camera_pred = [(w["startSec"], w["endSec"]) for w in windows if w["state"] == "LIKELY_ACTIVE_OFF_CAMERA"]
    visible_true = [tuple(i) for i in annotation.get("visibleIntervals", [])]
    on_pitch_true = [tuple(i) for i in annotation.get("onPitchIntervals", [])] or [(0.0, float(annotation["durationSec"]))]

    event_stage_complete = bool(segments) and all(s.get("stages", {}).get("events") == "complete" for s in segments)
    if event_stage_complete:
        match = match_events([e for s in segments for e in s.get("events", [])], annotation.get("events", []), tolerance_sec)
        events = {
            "stage": "complete",
            "truePositive": match.true_positive,
            "predicted": match.predicted,
            "actual": match.actual,
            "timestampErrorSumSec": round(sum(match.timestamp_errors), 3),
        }
    else:
        # No event output is scored, and no event claim can come from this video.
        events = {"stage": "not_implemented", "truePositive": 0, "predicted": 0, "actual": len(annotation.get("events", [])), "timestampErrorSumSec": 0.0}

    analysed = sum(float(s.get("coverage", {}).get("analysedSec", 0.0)) for s in segments)
    ok = sum(1 for s in segments if s.get("stages", {}).get("tracking") == "complete")
    return {
        "videoId": annotation["videoId"],
        "annotator": annotation.get("annotator"),
        "difficulty": sorted(set(annotation.get("difficulty", []))),
        "visible": {
            "predSec": round(total(visible_pred), 3),
            "trueSec": round(total(visible_true), 3),
            "overlapSec": round(overlap(visible_pred, visible_true), 3),
        },
        "offCamera": {
            "predSec": round(total(off_camera_pred), 3),
            "onPitchOverlapSec": round(overlap(off_camera_pred, on_pitch_true), 3),
        },
        "identity": identity_counts(annotation.get("targetBoxes", []), prediction.get("trace", []), match_window_sec),
        "coverage": {"analysedSec": round(min(analysed, float(annotation["durationSec"])), 3), "durationSec": float(annotation["durationSec"])},
        # A video without any worker output counts as one failed segment.
        "reliability": {"segments": max(1, len(segments)), "segmentsOk": ok},
        "events": events,
    }


def aggregate(videos: list[dict]) -> dict:
    def s(path: tuple[str, str], subset: list[dict] | None = None) -> float:
        return sum(v[path[0]][path[1]] for v in (videos if subset is None else subset))

    pred = s(("visible", "predSec"))
    shared = s(("visible", "overlapSec"))
    runs = [r for v in videos for r in v["identity"]["correctRunsSec"]]
    analysed = s(("coverage", "analysedSec"))
    event_videos = [v for v in videos if v["events"]["stage"] == "complete"]
    tp = s(("events", "truePositive"), event_videos)
    return {
        "videos": len(videos),
        "annotators": len({v["annotator"] for v in videos if v.get("annotator")}),
        "visiblePrecision": ratio(shared, pred),
        "visibleRecall": ratio(shared, s(("visible", "trueSec"))),
        "likelyOffCameraPrecision": ratio(s(("offCamera", "onPitchOverlapSec")), s(("offCamera", "predSec"))),
        "falseConfirmRate": ratio(pred - shared, pred),
        "identityAccuracy": ratio(s(("identity", "correct")), s(("identity", "claimed"))),
        "identityKeyframes": s(("identity", "keyframes")),
        "switchesPer10Min": ratio(s(("identity", "switches")), analysed / 600.0),
        "meanCorrectRunSec": (sum(runs) / len(runs)) if runs else None,
        "coverage": ratio(analysed, s(("coverage", "durationSec"))),
        "reliability": ratio(s(("reliability", "segmentsOk")), s(("reliability", "segments"))),
        "eventStage": "complete" if event_videos and len(event_videos) == len(videos) else "not_implemented",
        "eventPrecision": ratio(tp, s(("events", "predicted"), event_videos)) if event_videos else None,
        "eventRecall": ratio(tp, s(("events", "actual"), event_videos)) if event_videos else None,
        "meanTimestampErrorSec": ratio(s(("events", "timestampErrorSumSec"), event_videos), tp) if event_videos else None,
    }


def _score(summary: dict, metrics: dict) -> dict:
    results = {}
    for metric, rule in metrics.items():
        value = summary.get(metric)
        if value is None:
            results[metric] = {"value": None, "pass": False, "reason": "not measured"}
        elif "min" in rule:
            results[metric] = {"value": value, "pass": value >= rule["min"], "min": rule["min"]}
        else:
            results[metric] = {"value": value, "pass": value <= rule["max"], "max": rule["max"]}
    return results


def check(summary: dict, thresholds: dict, slices: dict | None = None) -> dict:
    """Every threshold must be met by a measured value; an unmeasured metric fails. Each required
    difficulty slice must hold enough videos and meet the slice metrics on its own."""
    metrics = _score(summary, thresholds.get("metrics", {}))
    problems: list[str] = []
    if summary["videos"] < thresholds.get("minimumVideos", 0):
        problems.append(f"only {summary['videos']} videos, {thresholds.get('minimumVideos')} required")
    if summary.get("annotators", 0) < thresholds.get("minimumAnnotators", 0):
        problems.append(f"only {summary.get('annotators', 0)} annotators, {thresholds.get('minimumAnnotators')} required")
    problems += [f"{name}: {r.get('reason', 'below threshold')}" for name, r in metrics.items() if not r["pass"]]

    slice_results = {}
    slice_metric_names = thresholds.get("sliceMetrics", [])
    for tag, minimum in thresholds.get("requiredSlices", {}).items():
        part = (slices or {}).get(tag)
        count = part["videos"] if part else 0
        scored = _score(part, {m: thresholds["metrics"][m] for m in slice_metric_names if m in thresholds.get("metrics", {})}) if part else {}
        passed = count >= minimum and all(r["pass"] for r in scored.values())
        slice_results[tag] = {"videos": count, "minimumVideos": minimum, "metrics": scored, "pass": passed}
        if not passed:
            problems.append(f"slice {tag}: {count}/{minimum} videos" + ("" if count < minimum else ", metric below threshold"))

    event_metrics = _score(summary, thresholds.get("eventMetrics", {}))
    events_pass = summary.get("eventStage") == "complete" and bool(event_metrics) and all(r["pass"] for r in event_metrics.values())
    status = thresholds.get("status", "proposed")
    passed = bool(metrics) and not problems
    return {
        "thresholdStatus": status,
        "metrics": metrics,
        "slices": slice_results,
        "events": {
            "stage": summary.get("eventStage"),
            "metrics": event_metrics,
            "pass": events_pass,
            "note": None if summary.get("eventStage") == "complete" else "event stage not implemented: no event claims allowed",
        },
        "problems": problems,
        "pass": passed,
        # Passing PROPOSED thresholds is evidence, not approval.
        "approvable": passed and status == "approved",
    }


def slice_summaries(videos: list[dict]) -> dict:
    return {
        tag: aggregate(subset)
        for tag in DIFFICULTY_TAGS
        if (subset := [v for v in videos if tag in v["difficulty"]])
    }


def sha256_file(path: Path) -> str:
    """Line endings are normalised so a git checkout on another OS hashes the same."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def load_prediction(path: Path) -> dict:
    if not path.exists():
        return {"segments": [], "trace": [], "provenance": None}
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return {"segments": data, "trace": [], "provenance": None}
    return {"segments": data.get("segments", []), "trace": data.get("trace", []), "provenance": data.get("provenance")}


def validate_manifest(manifest: dict, annotations: list[dict]) -> list[str]:
    problems = []
    entries = {v.get("videoId"): v for v in manifest.get("videos", [])}
    ids = {a["videoId"] for a in annotations}
    if set(entries) != ids:
        problems.append("manifest and annotations list different videos")
    for annotation in annotations:
        entry = entries.get(annotation["videoId"], {})
        if not isinstance(entry.get("footageSha256"), str) or len(entry["footageSha256"]) != 64:
            problems.append(f"{annotation['videoId']}: footage hash missing")
        if entry.get("consent") != "documented":
            problems.append(f"{annotation['videoId']}: recording permission not documented")
        if abs(float(entry.get("durationSec", -1)) - float(annotation["durationSec"])) > 1:
            problems.append(f"{annotation['videoId']}: duration differs from manifest")
        if not annotation.get("annotator"):
            problems.append(f"{annotation['videoId']}: annotator missing")
        if not annotation.get("targetBoxes"):
            problems.append(f"{annotation['videoId']}: no target keyframes, identity accuracy cannot be measured")
    return problems


def run(
    annotations_dir: Path,
    predictions_dir: Path,
    thresholds: dict,
    tolerance_sec: float,
    manifest: dict | None = None,
    hashes: dict | None = None,
) -> dict:
    annotations = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(annotations_dir.glob("*.json"))]
    videos, workers, model_sets = [], set(), set()
    for annotation in annotations:
        prediction = load_prediction(predictions_dir / f"{annotation['videoId']}.json")
        provenance = prediction["provenance"] or {}
        workers.add(provenance.get("workerVersion"))
        model_sets.add(json.dumps(provenance.get("models") or {}, sort_keys=True))
        videos.append(evaluate_video(annotation, prediction, tolerance_sec))

    summary = aggregate(videos)
    slices = slice_summaries(videos)
    gate = check(summary, thresholds, slices)
    provenance_problems = []
    if manifest is None:
        provenance_problems.append("dataset manifest missing")
    else:
        provenance_problems += validate_manifest(manifest, annotations)
    if None in workers or len(workers) != 1:
        provenance_problems.append("predictions must come from exactly one recorded worker version")
    if len(model_sets) != 1 or model_sets == {"{}"}:
        provenance_problems.append("predictions must come from exactly one recorded model set")
    if provenance_problems:
        gate["problems"] += provenance_problems
        gate["pass"] = gate["approvable"] = False

    return {
        "provenance": {
            "evaluatorVersion": EVALUATOR_VERSION,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "workerVersion": next(iter(workers)) if len(workers) == 1 else None,
            "models": json.loads(next(iter(model_sets))) if len(model_sets) == 1 else None,
            "datasetId": (manifest or {}).get("datasetId"),
            "toleranceSec": tolerance_sec,
            **(hashes or {}),
        },
        "summary": summary,
        "slices": slices,
        "gate": gate,
        "videos": videos,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--thresholds", type=Path, default=Path(__file__).with_name("thresholds.json"))
    parser.add_argument("--tolerance", type=float, default=2.0)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    thresholds = json.loads(args.thresholds.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    hashes = {"manifestSha256": sha256_file(args.manifest), "thresholdsSha256": sha256_file(args.thresholds)}
    report = run(args.annotations, args.predictions, thresholds, args.tolerance, manifest, hashes)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["gate"], indent=2))


if __name__ == "__main__":
    main()
