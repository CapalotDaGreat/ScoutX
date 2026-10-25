"""Prepare a local frame and incomplete anchor draft for authorized human review."""
from __future__ import annotations

import argparse
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile

from app.backends import model_versions
from app.experimental_identity import MatchScope
from app.source_pts import FramePts, decoded_pts, recording_origin, source_sha256


def _local_path(value: str | Path) -> Path:
    text = str(value)
    if (not text or len(text) > 4096 or "://" in text or "\x00" in text
            or text.startswith(("\\\\", "//"))):
        raise ValueError("a bounded local filesystem path is required")
    path = Path(text)
    # Reject alternate data streams and URL schemes, permitting only a drive colon.
    if ":" in text[len(path.drive):]:
        raise ValueError("a local filesystem path is required")
    return path


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--reference-sec", required=True, type=float)
    parser.add_argument("--job-id", required=True)
    parser.add_argument("--generation", required=True, type=int)
    parser.add_argument("--frame-id", default="frame_0")
    parser.add_argument("--authorize-local-evaluation", action="store_true", required=True)
    return parser.parse_args(argv)


def _publish(directory: Path, name: str, writer) -> None:
    """Publish a complete file atomically without replacing an existing file."""
    fd, temporary = tempfile.mkstemp(prefix=".pending-", dir=directory)
    try:
        with os.fdopen(fd, "wb") as output:
            writer(output)
            output.flush()
            os.fsync(output.fileno())
        if os.name == "nt":
            os.rename(temporary, directory / name)
        else:
            os.link(temporary, directory / name)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _signature(stat):
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns


def prepare(args) -> dict:
    if args.authorize_local_evaluation is not True:
        raise ValueError("explicit local evaluation authorization is required")
    if not math.isfinite(args.reference_sec) or args.reference_sec < 0:
        raise ValueError("reference must be finite and nonnegative")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", args.frame_id):
        raise ValueError("invalid frame ID")
    source = _local_path(args.input).resolve(strict=True)
    output = _local_path(args.out)
    if output.exists() or output.is_symlink():
        raise ValueError("output directory must be new")
    output = output.resolve()
    _local_path(source)
    _local_path(output)
    if (not source.is_file() or output == source or output in source.parents
            or not output.parent.is_dir()):
        raise ValueError("supply a local file and a new directory with an existing parent")
    before = source.stat()
    source_hash = source_sha256(source)
    versions = model_versions()  # Metadata only: never initialize a model backend.
    model_digest = hashlib.sha256(json.dumps(versions, sort_keys=True,
                                            separators=(",", ":"), allow_nan=False).encode()).hexdigest()
    scope = MatchScope(jobId=args.job_id, sourceSha256=source_hash,
                       generation=args.generation, modelSetDigest=model_digest)
    import av

    selected = None
    with av.open(str(source), options={"protocol_whitelist": "file"}) as container:
        if not container.streams.video:
            raise ValueError("video stream required")
        stream = container.streams.video[0]
        stream.thread_type = "SLICE"
        stream.codec_context.thread_count = 1
        if stream.duration is not None and stream.time_base is not None:
            duration = float(stream.duration * stream.time_base)
        elif container.duration is not None:
            duration = float(container.duration / av.time_base)
        else:
            raise ValueError("video duration metadata required")
        if not math.isfinite(duration) or not 0 < duration <= 9000:
            raise ValueError("duration must be finite, positive and at most 9000 seconds")
        if args.reference_sec >= duration:
            raise ValueError("reference outside source duration")
        previous = None
        origin = recording_origin(stream)
        for frame in container.decode(video=0):
            time_base = Fraction(frame.time_base)
            pts = decoded_pts(frame)
            if origin is None:
                origin = pts
            if previous is not None and pts <= previous:
                raise ValueError("source PTS must strictly increase")
            previous = pts
            timestamp = pts - origin
            if timestamp < 0 or float(timestamp) < args.reference_sec:
                continue
            if timestamp >= duration:
                raise ValueError("selected frame outside source duration")
            point = FramePts(frameId=args.frame_id, framePts=frame.pts,
                             timeBaseNumerator=time_base.numerator,
                             timeBaseDenominator=time_base.denominator,
                             originNumerator=origin.numerator, originDenominator=origin.denominator,
                             timestampSec=float(timestamp))
            rgb = frame.to_ndarray(format="rgb24")
            selected = {"anchorId": args.frame_id, **point.model_dump(),
                        "evidenceHash": hashlib.sha256(rgb.tobytes(order="C")).hexdigest()}
            image = frame.to_image()
            break
    if selected is None:
        raise ValueError("no decoded frame at or after reference")
    if _signature(before) != _signature(source.stat()) or source_sha256(source) != source_hash:
        raise ValueError("source changed")
    draft = {"scope": scope.model_dump(), "anchors": [selected]}
    data = json.dumps(draft, allow_nan=False, indent=2).encode("utf-8")
    output.mkdir(exist_ok=False)
    _publish(output, "frame.png", lambda destination: image.save(destination, format="PNG"))
    _publish(output, "manifest.draft.json", lambda destination: destination.write(data))
    return draft


def main(argv=None) -> int:
    try:
        prepare(parse_args(argv))
    except Exception:
        # Decoder errors can contain local paths or credentials; do not echo them.
        print("Anchor preparation failed; no usable anchor manifest is claimed.", file=sys.stderr)
        return 1
    print("Draft is not usable until a human reviews frame.png and adds a normalized box to manifest.draft.json.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
