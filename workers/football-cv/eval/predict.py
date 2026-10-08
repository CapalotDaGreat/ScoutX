"""Runs the worker pipeline over local evaluation footage and writes prediction files.

Usage (on the GPU machine that will be approved, with the exact deployed image):
    python -m eval.predict --manifest data/manifest.json --footage data/footage --annotations data/annotations \
        --out data/predictions

Footage stays on that machine; only predictions (segments, provenance and the target trace) are
written. The trace holds the boxes the worker attributed to the target so identity accuracy can be
scored against annotated keyframes; it is never produced by the HTTP service.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterator

import numpy as np

from app.contract import SegmentRequest
from app.pipeline import WORKER_VERSION, Components, FrameSource, analyse_segment

SEGMENT_SEC = 600.0


class LocalFile(FrameSource):
    def __init__(self, inner: FrameSource, path: Path) -> None:
        self._inner = inner
        self._path = str(path)

    def frames(self, url: str, headers: str | None, start_sec: float, end_sec: float, fps: float) -> Iterator[tuple[float, np.ndarray]]:
        return self._inner.frames(self._path, None, start_sec, end_sec, fps)


def predict_video(components: Components, footage: Path, annotation: dict, fps: float) -> dict:
    local = Components(
        source=LocalFile(components.source, footage),
        detector=components.detector,
        tracker_factory=components.tracker_factory,
        jersey_reader=components.jersey_reader,
        models=components.models,
    )
    duration = float(annotation["durationSec"])
    segments, trace = [], []
    index, start = 0, 0.0
    while start < duration:
        end = min(duration, start + SEGMENT_SEC)
        request = SegmentRequest(
            contractVersion=2,
            jobId=annotation["videoId"],
            segmentIndex=index,
            startSec=start,
            endSec=end,
            source={"url": "https://evaluation.invalid/local"},
            target={
                "jerseyNumber": annotation["targetJersey"],
                "kitPrimaryColor": annotation.get("kitPrimaryColor", ""),
                "kitSecondaryColor": annotation.get("kitSecondaryColor", ""),
            },
            sampling={"fps": fps},
            privacy={"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False},
        )
        segments.append(analyse_segment(request, local, trace).model_dump())
        index, start = index + 1, end
    return {
        "provenance": {"workerVersion": WORKER_VERSION, "models": components.models or {}},
        "segments": segments,
        "trace": trace,
    }


def main() -> None:
    from app.backends import default_components  # noqa: PLC0415

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--footage", type=Path, required=True)
    parser.add_argument("--annotations", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--fps", type=float, default=2.0)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    components = default_components(args.fps)
    args.out.mkdir(parents=True, exist_ok=True)
    for entry in manifest["videos"]:
        annotation = json.loads((args.annotations / f"{entry['videoId']}.json").read_text(encoding="utf-8"))
        footage = args.footage / entry["fileName"]
        result = predict_video(components, footage, annotation, args.fps)
        (args.out / f"{entry['videoId']}.json").write_text(json.dumps(result), encoding="utf-8")
        print(f"{entry['videoId']}: {len(result['segments'])} segments")


if __name__ == "__main__":
    main()
