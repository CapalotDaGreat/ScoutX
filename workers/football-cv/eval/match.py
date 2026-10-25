"""Authorized, local-only full-match evaluation. Planning is the default."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
from urllib.parse import urlsplit

from app.contract import SegmentRequest
from app.pipeline import Components, WORKER_VERSION, analyse_segment
from app.teams import KIT_COLOURS
from eval.predict import LocalFile, target_only_segment
from eval.full_match_preflight import preflight


def inspect_duration(path: Path) -> float:
    import av

    with av.open(str(path), options={"protocol_whitelist": "file"}) as container:
        if not container.streams.video:
            raise ValueError("A video stream is required")
        stream = container.streams.video[0]
        if stream.duration is not None and stream.time_base is not None:
            return float(stream.duration * stream.time_base)
        if container.duration is not None:
            return float(container.duration / av.time_base)
    raise ValueError("Video duration metadata is required")


def schedule(duration: float, target: dict) -> list[SegmentRequest]:
    if not math.isfinite(duration) or not 0 < duration <= 9000:
        raise ValueError("Duration must be positive and at most 150 minutes")
    return [SegmentRequest(
        contractVersion=2, jobId="local-match", segmentIndex=index,
        startSec=float(start), endSec=min(start + 600.0, duration),
        source={"url": "https://evaluation.invalid/local"}, target=target,
        sampling={"fps": 2},
        privacy={"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False},
    ) for index, start in enumerate(range(0, math.ceil(duration), 600))]


def local_video_path(value: str) -> Path:
    if "://" in value:
        if urlsplit(value).hostname == "app.veo.co":
            raise argparse.ArgumentTypeError(
                "Veo viewing links require an authorized provider integration or club export. "
                "They are not supported media sources; no sign-in or stream extraction is attempted.")
        raise argparse.ArgumentTypeError("Use an authorized local MP4 path, not a web or media URL")
    return Path(value)


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=local_video_path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--jersey-number", required=True)
    parser.add_argument("--kit-primary-color", required=True, choices=sorted(KIT_COLOURS))
    parser.add_argument('--kit-secondary-color', default='', choices=['', *sorted(KIT_COLOURS)])
    parser.add_argument("--reference-sec", required=True, type=float)
    parser.add_argument("--authorize-local-evaluation", action="store_true", required=True)
    parser.add_argument("--anchor-manifest", type=local_video_path)
    parser.add_argument("--preflight-review", type=local_video_path,
                        help="Bind source, duration, target and anchors to independent review metadata")
    parser.add_argument("--source-path")
    parser.add_argument("--anchor-revision", type=int)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--run", action="store_true")
    mode.add_argument("--plan-only", action="store_true")
    args = parser.parse_args(argv)
    if args.anchor_manifest is not None:
        from app.source_pts import enabled
        if not enabled():
            parser.error("Experimental target anchors and CV worker approval gates must both be enabled")
    if (args.source_path is None) != (args.anchor_revision is None):
        parser.error("Source path and anchor revision must be supplied together")
    if args.source_path is not None:
        if (args.anchor_manifest is None or args.anchor_revision < 1
                or not re.fullmatch(r"profiles/[A-Za-z0-9_-]{1,128}/matchFootage/[A-Za-z0-9_-]{6,80}/video\.mp4", args.source_path)):
            parser.error("A verified manifest, positive revision and canonical owned source path are required")
    if not re.fullmatch(r"[0-9]{1,2}", args.jersey_number):
        parser.error("Jersey must contain one or two ASCII digits")
    if not math.isfinite(args.reference_sec) or args.reference_sec < 0:
        parser.error("Reference timestamp must be finite and nonnegative")
    # Refuse UNC/network shares as well as URL-like paths on every platform.
    for path in (args.input, args.out):
        if str(path).startswith(("\\\\", "//")) or "://" in str(path):
            parser.error("Only local filesystem paths are supported")
    args.input = args.input.resolve(strict=True)
    args.out = args.out.absolute()
    resolved_out = args.out.resolve()
    if any(str(path).startswith(("\\\\", "//")) for path in (args.input, resolved_out)):
        parser.error("Network shares are not supported")
    if (not args.input.is_file() or args.out.exists() or args.out.is_symlink()
            or resolved_out == args.input or resolved_out in args.input.parents
            or not args.out.parent.is_dir()):
        parser.error("Supply a local file and a new output directory with an existing parent")
    args.out = resolved_out
    return args


def load_components() -> Components:
    """Use only installed packages and cached weights, always on CPU."""
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TRANSFORMERS_OFFLINE"] = "1"
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    import torch
    from app.backends import default_components

    torch.set_num_threads(2)
    return default_components(2, local_only=True, cpu=True)


def write_exclusive(directory: Path, name: str, payload: dict) -> None:
    """Publish a complete JSON file without ever replacing an existing result."""
    if not re.fullmatch(r"(?:plan|complete|identity|artifact|segment-[0-9]{3})\.json", name):
        raise ValueError("Invalid result filename")
    data = json.dumps(payload, allow_nan=False, indent=2).encode("utf-8")
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
        if os.name == "nt":
            # Windows rename refuses an existing destination (unlike POSIX rename).
            os.rename(temporary, directory / name)
        else:
            os.link(temporary, directory / name)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class AuditedLocalFile(LocalFile):
    """Record sampled source PTS, independently of the model's stage statuses."""

    def __init__(self, path: Path, verify_frame=None) -> None:
        super().__init__(path)
        self.timestamps: list[float] = []
        self.verify_frame = verify_frame

    def frames(self, url, headers, start_sec, end_sec, fps):
        self.timestamps.clear()
        for timestamp, frame in super().frames(url, headers, start_sec, end_sec, fps):
            if self.verify_frame is not None:
                timestamp = self.verify_frame(timestamp, frame)
            self.timestamps.append(timestamp)
            yield timestamp, frame


def decoded_coverage(timestamps: list[float], request: SegmentRequest) -> dict:
    """Sampled intervals, not full-frame decoding or identity coverage.

    Half a sample step allows ordinary frame-time quantization, not multi-second
    missing regions. Prefix, internal and tail holes larger than that are failures.
    """
    start, end = request.startSec, request.endSec
    step = 1 / request.sampling.fps
    tolerance = step * 0.5 + 1e-6
    intervals: list[list[float]] = []
    valid = all(math.isfinite(t) and start <= t < end for t in timestamps)
    valid = valid and all(b > a for a, b in zip(timestamps, timestamps[1:]))
    if valid:
        for t in timestamps:
            stop = min(t + step, end)
            if intervals and t <= intervals[-1][1] + 1e-6:
                intervals[-1][1] = max(intervals[-1][1], stop)
            else:
                intervals.append([t, stop])
    missing: list[list[float]] = []
    cursor = start
    for a, b in intervals:
        if a - cursor > tolerance:
            missing.append([cursor, a])
        cursor = b
    if end - cursor > tolerance:
        missing.append([cursor, end])
    return {"requestedStartSec": start, "requestedEndSec": end,
            "sampleStepSec": step, "timestampToleranceSec": tolerance,
            "sampledSourceIntervals": intervals, "missingIntervals": missing,
            "framesDecoded": len(timestamps), "timestampsValid": valid,
            "complete": bool(timestamps) and valid and not missing}


def private_segment_payload(result, trace: list[dict], audit: dict) -> dict:
    # Candidates can be teammates/opponents: never persist their track IDs,
    # jersey reads, confidence or timestamps, including in failed-run diagnostics.
    return {"segment": target_only_segment(result), "targetTrace": trace, "decodeAudit": audit}


def evaluate(args, *, inspect=inspect_duration, component_factory=load_components,
             analyse=analyse_segment, model_inventory=None) -> dict:
    if not args.authorize_local_evaluation:
        raise ValueError("Explicit local evaluation authorization is required")
    duration = inspect(args.input)
    target = {"jerseyNumber": args.jersey_number, "kitPrimaryColor": args.kit_primary_color}
    if getattr(args, 'kit_secondary_color', ''):
        target['kitSecondaryColor'] = args.kit_secondary_color
    requests = schedule(duration, target)
    if not math.isfinite(args.reference_sec) or not 0 <= args.reference_sec < duration:
        raise ValueError("Reference must be within the metadata duration")
    digest, manifest, models = preflight(args, duration, target, model_inventory=model_inventory)
    coordinator = None
    if manifest is not None:
        from eval.coordinated import LocalIdentityRun
        # Exact PTS/RGB verification requires decoding, but never inference or output.
        coordinator = LocalIdentityRun(args.input, manifest, models, duration, target)
        for request in requests:
            request.jobId = manifest.scope.jobId
    plan = {
        "mode": "run" if args.run else "plan-only", "workerVersion": WORKER_VERSION,
        "sourceSha256": digest, "durationSec": duration,
        "referenceSec": args.reference_sec, "referenceRole": "provenance-only; not identity confirmation",
        "target": target, "fps": 2, "authorizedLocalEvaluation": True,
        "cloudUpload": False, "modelTraining": False,
        "scope": "Independent segments; no cross-segment identity interpolation or accuracy claim",
        "segments": [{"segmentIndex": r.segmentIndex, "startSec": r.startSec, "endSec": r.endSec}
                     for r in requests],
    }
    if manifest is not None:
        plan["anchorScope"] = manifest.scope.model_dump()
        plan["models"] = models
        plan["anchorFramesVerified"] = True
    args.out.mkdir(exist_ok=False)
    write_exclusive(args.out, "plan.json", plan)
    if args.run:
        components = component_factory()
        if coordinator and components.models != models:
            raise ValueError("loaded model scope differs from preflight")
        source = AuditedLocalFile(args.input, coordinator.verify_frame if coordinator else None)
        local = Components(source, components.detector, components.tracker_factory,
                           components.jersey_reader, components.models)
        for request in requests:
            source.timestamps.clear()
            trace = []
            if coordinator:
                result = analyse(request, local, trace, observer=lambda tracks: coordinator.observe(request, tracks))
            else:
                result = analyse(request, local, trace)
            audit = decoded_coverage(source.timestamps, request)
            failed = any(value == "failed" for value in result.stages.model_dump().values())
            write_exclusive(args.out, f"segment-{request.segmentIndex:03d}.json",
                            private_segment_payload(result, trace, audit))
            if failed or not audit["complete"]:
                raise RuntimeError("Segment evaluation failed; no completion record written")
        if coordinator:
            identity, artifact = coordinator.finish(source_path=args.source_path, anchor_revision=args.anchor_revision)
            write_exclusive(args.out, "identity.json", identity)
            if artifact is not None:
                write_exclusive(args.out, "artifact.json", artifact)
        write_exclusive(args.out, "complete.json", {"status": "complete", "segments": len(requests)})
    return plan


def main(argv=None) -> int:
    try:
        evaluate(parse_args(argv))
    except Exception:
        # Decoder/model exceptions may contain paths, credentials or URLs.
        print("Local evaluation failed; no successful completion is claimed.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
