"""Scores worker output against human annotations of real footage.

Usage:
    python -m eval.evaluate --annotations eval/data/annotations --predictions eval/data/predictions \
        --thresholds eval/thresholds.json --out eval/report.json

Annotations (one JSON per video, see annotation.schema.json) are made by a person watching the
footage. Predictions are the worker's contract-v2 segment results for the same video, stored as
<videoId>.json containing a list. The thresholds file is a PROPOSAL until the product owner
signs it off; this script only reports, it never changes any production switch.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

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


def evaluate_video(annotation: dict, segments: list[dict], tolerance_sec: float) -> dict:
    windows = [w for s in segments for w in s.get("availability", [])]
    visible_pred = [(w["startSec"], w["endSec"]) for w in windows if w["state"] == "CONFIRMED_VISIBLE"]
    off_camera_pred = [(w["startSec"], w["endSec"]) for w in windows if w["state"] == "LIKELY_ACTIVE_OFF_CAMERA"]
    visible_true = [tuple(i) for i in annotation.get("visibleIntervals", [])]
    on_pitch_true = [tuple(i) for i in annotation.get("onPitchIntervals", [])] or [(0.0, float(annotation["durationSec"]))]

    events_pred = [e for s in segments if s.get("stages", {}).get("events") == "complete" for e in s.get("events", [])]
    events = match_events(events_pred, annotation.get("events", []), tolerance_sec)
    identity_states = [s.get("identity", {}).get("state", "UNKNOWN") for s in segments]

    return {
        "videoId": annotation["videoId"],
        "durationSec": annotation["durationSec"],
        "visible": {
            "precision": ratio(overlap(visible_pred, visible_true), total(visible_pred)),
            "recall": ratio(overlap(visible_pred, visible_true), total(visible_true)),
            "predictedSec": total(visible_pred),
            "trueSec": total(visible_true),
        },
        "likelyOffCamera": {
            # Off-camera time must at least be time the player was on the pitch.
            "precision": ratio(overlap(off_camera_pred, on_pitch_true), total(off_camera_pred)),
            "predictedSec": total(off_camera_pred),
        },
        "identity": {
            "confirmedSegments": identity_states.count("CONFIRMED_VISIBLE"),
            "segments": len(identity_states),
            # Confirmed-visible time where the annotator says the target was NOT visible.
            "falseConfirmSec": total(visible_pred) - overlap(visible_pred, visible_true),
        },
        "events": {
            "precision": ratio(events.true_positive, events.predicted),
            "recall": ratio(events.true_positive, events.actual),
            "meanTimestampErrorSec": (sum(events.timestamp_errors) / len(events.timestamp_errors)) if events.timestamp_errors else None,
            "predicted": events.predicted,
            "actual": events.actual,
        },
    }


def aggregate(videos: list[dict]) -> dict:
    def pooled(key: str, field: str) -> float | None:
        values = [v[key][field] for v in videos if v[key][field] is not None]
        return sum(values) / len(values) if values else None

    false_confirm = sum(v["identity"]["falseConfirmSec"] for v in videos)
    predicted_visible = sum(v["visible"]["predictedSec"] for v in videos)
    return {
        "videos": len(videos),
        "visiblePrecision": pooled("visible", "precision"),
        "visibleRecall": pooled("visible", "recall"),
        "likelyOffCameraPrecision": pooled("likelyOffCamera", "precision"),
        "falseConfirmRate": ratio(false_confirm, predicted_visible),
        "eventPrecision": pooled("events", "precision"),
        "eventRecall": pooled("events", "recall"),
        "meanTimestampErrorSec": pooled("events", "meanTimestampErrorSec"),
    }


def check(summary: dict, thresholds: dict) -> dict:
    """Every threshold must be met by a measured value; an unmeasured metric fails."""
    results = {}
    for metric, rule in thresholds.get("metrics", {}).items():
        value = summary.get(metric)
        if value is None:
            results[metric] = {"value": None, "pass": False, "reason": "not measured"}
        elif "min" in rule:
            results[metric] = {"value": value, "pass": value >= rule["min"], "min": rule["min"]}
        else:
            results[metric] = {"value": value, "pass": value <= rule["max"], "max": rule["max"]}
    minimum_videos = thresholds.get("minimumVideos", 0)
    enough = summary["videos"] >= minimum_videos
    return {
        "thresholdStatus": thresholds.get("status", "proposed"),
        "enoughVideos": enough,
        "minimumVideos": minimum_videos,
        "metrics": results,
        "pass": enough and bool(results) and all(r["pass"] for r in results.values()),
    }


def run(annotations_dir: Path, predictions_dir: Path, thresholds: dict, tolerance_sec: float) -> dict:
    videos = []
    for path in sorted(annotations_dir.glob("*.json")):
        annotation = json.loads(path.read_text(encoding="utf-8"))
        prediction_path = predictions_dir / f"{annotation['videoId']}.json"
        segments = json.loads(prediction_path.read_text(encoding="utf-8")) if prediction_path.exists() else []
        videos.append(evaluate_video(annotation, segments, tolerance_sec))
    summary = aggregate(videos)
    return {"summary": summary, "gate": check(summary, thresholds), "videos": videos}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--thresholds", type=Path, default=Path(__file__).with_name("thresholds.json"))
    parser.add_argument("--tolerance", type=float, default=2.0)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    thresholds = json.loads(args.thresholds.read_text(encoding="utf-8"))
    report = run(args.annotations, args.predictions, thresholds, args.tolerance)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report["gate"], indent=2))


if __name__ == "__main__":
    main()
