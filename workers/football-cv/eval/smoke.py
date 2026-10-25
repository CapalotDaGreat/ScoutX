"""Bounded local-only reference-model smoke test; not an accuracy benchmark."""

from __future__ import annotations

import argparse
import json
import math
import re
import time
import os
from pathlib import Path

from app.contract import SegmentRequest
from app.pipeline import Components, WORKER_VERSION, analyse_segment
from eval.predict import LocalFile, target_only_segment
from app.source_pts import source_sha256
from eval.prepare_anchor import _signature


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--start", type=float, required=True)
    parser.add_argument("--end", type=float, required=True)
    parser.add_argument("--cpu-threads", type=int, default=2)
    parser.add_argument("--fps", type=float, default=2.0)
    parser.add_argument("--jersey-number", required=True)
    parser.add_argument("--kit-primary-color", required=True)
    parser.add_argument("--kit-secondary-color", default="")
    parser.add_argument("--authorize-local-evaluation", action="store_true", required=True)
    args = parser.parse_args(argv)
    if (not args.input.is_file() or not math.isfinite(args.start)
            or not math.isfinite(args.end) or not 0 <= args.start < args.end <= args.start + 15):
        parser.error("Supply a local video and an interval no longer than 15 seconds")
    if not 1 <= args.cpu_threads <= 8:
        parser.error("CPU threads must be between 1 and 8")
    if not math.isfinite(args.fps) or not 0 < args.fps <= 5:
        parser.error("Sampling must be finite, positive and at most five frames per second")
    if not re.fullmatch(r"[0-9]{1,2}", args.jersey_number):
        parser.error("Jersey number must contain one or two ASCII digits")
    for field in ("kit_primary_color", "kit_secondary_color"):
        value = getattr(args, field).strip()
        if len(value) > 40 or any(ord(character) < 32 for character in value):
            parser.error("Kit colours must be plain text of at most 40 characters")
        setattr(args, field, value)
    if not args.kit_primary_color:
        parser.error("A primary kit colour is required")
    if args.out.resolve() == args.input.resolve() or args.out.exists() or args.out.is_symlink():
        parser.error("Output must be a new file distinct from the input")
    return args


def main() -> None:
    args = parse_args()
    source_before = args.input.stat()
    source_digest = source_sha256(args.input)
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['CUDA_VISIBLE_DEVICES'] = ''
    import torch  # noqa: PLC0415
    from app.backends import default_components  # noqa: PLC0415

    torch.set_num_threads(args.cpu_threads)
    torch.set_num_interop_threads(1)
    started = time.perf_counter()
    components = default_components(args.fps, local_only=True, cpu=True)
    loaded = time.perf_counter()
    local = Components(
        source=LocalFile(args.input),
        detector=components.detector,
        tracker_factory=components.tracker_factory,
        jersey_reader=components.jersey_reader,
        models=components.models,
    )
    request = SegmentRequest(
        contractVersion=2, jobId="local-anchor-smoke", segmentIndex=0,
        startSec=args.start, endSec=args.end,
        source={"url": "https://evaluation.invalid/local"},
        target={"jerseyNumber": args.jersey_number, "kitPrimaryColor": args.kit_primary_color,
                "kitSecondaryColor": args.kit_secondary_color},
        sampling={"fps": args.fps},
        privacy={"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False},
    )
    trace = []
    result = analyse_segment(request, local, trace)
    if (_signature(args.input.stat()) != _signature(source_before)
            or source_sha256(args.input) != source_digest):
        raise ValueError('Source changed during local evaluation; no result published')
    output = {
        "scope": "local smoke only; no annotated accuracy or full-match continuity claim",
        'sourceSha256': source_digest,
        'authorizedLocalEvaluation': True,
        "workerVersion": WORKER_VERSION, "models": components.models,
        "target": request.target.model_dump(),
        "recordingWindow": {"startSec": args.start, "endSec": args.end},
        "samplingFps": args.fps,
        "modelTraining": False,
        "modelLoadSeconds": loaded - started,
        "inferenceSeconds": time.perf_counter() - loaded,
        "segment": target_only_segment(result), "targetTrace": trace,
        "cloudUpload": False,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("x", encoding="utf-8") as output_file:
        json.dump(output, output_file, indent=2, allow_nan=False)
    print(json.dumps({key: value for key, value in output.items() if key not in {"segment", "targetTrace"}}))


if __name__ == "__main__":
    main()
