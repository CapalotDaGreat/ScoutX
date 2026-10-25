"""Local-only exact source PTS adapter and trusted-server metadata proof contract."""
from __future__ import annotations

from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .experimental_identity import Digest, Id, MatchScope, NormalizedBox, StrictModel, UserAnchor


def enabled() -> bool:
    return all(os.environ.get(k) == "true" for k in ("EXPERIMENTAL_TARGET_ANCHORS", "CV_WORKER_APPROVED"))


class FramePts(StrictModel):
    frameId: Id
    framePts: int
    timeBaseNumerator: Annotated[int, Field(gt=0)]
    timeBaseDenominator: Annotated[int, Field(gt=0)]
    originNumerator: int = 0
    originDenominator: Annotated[int, Field(gt=0)] = 1
    timestampSec: Annotated[float, Field(ge=0, le=9000)]

    def rational(self) -> Fraction:
        return self.framePts * Fraction(self.timeBaseNumerator, self.timeBaseDenominator)

    def origin(self) -> Fraction:
        return Fraction(self.originNumerator, self.originDenominator)

    @model_validator(mode="after")
    def exact_time(self):
        if abs(float(self.rational() - self.origin()) - self.timestampSec) > 1e-9:
            raise ValueError("timestamp does not match source PTS")
        return self


class ReviewedAnchor(FramePts):
    anchorId: Id
    box: NormalizedBox
    evidenceHash: Digest


class AnchorManifest(StrictModel):
    scope: MatchScope
    anchors: Annotated[list[ReviewedAnchor], Field(min_length=1, max_length=8)]

    @model_validator(mode="after")
    def reviewed_ids(self):
        if any(a.anchorId != a.frameId for a in self.anchors):
            raise ValueError("anchorId must match reviewed frameId")
        return self


class DecodedFrameProof(FramePts):
    frameIndex: Annotated[int, Field(ge=0, le=1728000)]
    evidenceHash: Digest
    width: Annotated[int, Field(gt=0, le=32768)]
    height: Annotated[int, Field(gt=0, le=32768)]


class SourcePtsProof(StrictModel):
    schemaVersion: Literal[1]
    scope: MatchScope
    evidenceFormat: Literal["rgb24-sha256"] = "rgb24-sha256"
    frames: Annotated[list[DecodedFrameProof], Field(min_length=1, max_length=100008)]

    @model_validator(mode="after")
    def unique(self):
        if len({f.origin() for f in self.frames}) != 1:
            raise ValueError("inconsistent recording origin")
        for values in ([f.frameId for f in self.frames], [f.frameIndex for f in self.frames],
                       [f.rational() for f in self.frames], [f.timestampSec for f in self.frames]):
            if len(set(values)) != len(values):
                raise ValueError("duplicate frame claim")
        return self

    def digest(self) -> str:
        return hashlib.sha256(json.dumps(self.model_dump(), sort_keys=True,
                                        separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def source_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decoded_pts(frame) -> Fraction:
    """Require actual decoded PTS; never synthesize a timestamp from nominal FPS."""
    if frame.pts is None or frame.time_base is None or Fraction(frame.time_base) <= 0:
        raise ValueError("missing or invalid decoded PTS")
    return frame.pts * Fraction(frame.time_base)


def recording_origin(stream) -> Fraction | None:
    """None means the caller must use the first original decoded frame's PTS."""
    if getattr(stream, "start_time", None) is None:
        return None
    if stream.time_base is None or Fraction(stream.time_base) <= 0:
        raise ValueError("invalid source origin time base")
    return stream.start_time * Fraction(stream.time_base)


def validate_recording_interval(start_sec: float, end_sec: float, fps: float) -> None:
    if (not all(math.isfinite(t) for t in (fps, start_sec, end_sec))
            or not 0 < fps <= 30 or not 0 <= start_sec < end_sec):
        raise ValueError("invalid recording sampling interval")


def sample_recording_frames(container, stream, start_sec: float, end_sec: float, fps: float):
    """Shared clock mapping; callers keep file/network protocol policies separate."""
    validate_recording_interval(start_sec, end_sec, fps)
    stream.thread_type = "SLICE"
    stream.codec_context.thread_count = 1
    origin = recording_origin(stream)
    if origin is None:
        probe = iter(container.decode(stream))
        try:
            origin = decoded_pts(next(probe))
        except StopIteration:
            raise ValueError("cannot establish recording origin") from None
        finally:
            if hasattr(probe, "close"):
                probe.close()
    if stream.time_base is None or Fraction(stream.time_base) <= 0:
        raise ValueError("source time base required for exact seek")
    seek_pts = (origin + Fraction(start_sec)) / Fraction(stream.time_base)
    container.seek(math.floor(seek_pts), stream=stream, any_frame=False, backward=True)
    next_time = start_sec
    previous_pts = None
    for frame in container.decode(stream):
        pts = decoded_pts(frame)
        if previous_pts is not None and pts <= previous_pts:
            raise ValueError("source PTS must strictly increase")
        previous_pts = pts
        time_sec = float(pts - origin)
        if time_sec < next_time:
            continue
        if time_sec >= end_sec:
            break
        next_time = time_sec + 1.0 / fps
        yield time_sec, frame.to_ndarray(format="rgb24")


def load_anchor_manifest(path: Path) -> AnchorManifest:
    """Bounded strict JSON, with duplicate object keys rejected before validation."""
    if "://" in str(path) or str(path).startswith(("\\\\", "//")):
        raise ValueError("local manifest required")
    path = path.resolve(strict=True)
    if str(path).startswith(("\\\\", "//")):
        raise ValueError("local manifest required")
    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("duplicate JSON key")
            result[key] = value
        return result
    with path.open("rb") as source:
        data = source.read(65537)
    if len(data) > 65536:
        raise ValueError("manifest too large")
    return AnchorManifest.model_validate(json.loads(data, object_pairs_hook=unique_pairs))


def resolve_local_anchors(path: Path, manifest: AnchorManifest, *,
                          sample_fps: float | None = None) -> tuple[list[UserAnchor], SourcePtsProof]:
    """Hash before decoding; enumerate the full source without seeking or FPS inference.

    evidenceHash is SHA256 of contiguous decoded rgb24 bytes, NOT a display JPEG.
    No files are written. Callers must supply a reviewed, server-exported manifest.
    Optional sampling follows LocalFile's t + 1/fps threshold, reset for each
    600-second segment. Proof indices always count every original decoded frame.
    """
    if sample_fps is not None and (isinstance(sample_fps, bool)
            or not isinstance(sample_fps, (int, float))
            or not math.isfinite(sample_fps) or not 0 < sample_fps <= 30):
        raise ValueError("invalid sample fps")
    manifest = AnchorManifest.model_validate(manifest.model_dump())
    if "://" in str(path) or str(path).startswith(("\\\\", "//")):
        raise ValueError("local file required")
    path = path.resolve(strict=True)
    if str(path).startswith(("\\\\", "//")) or not path.is_file():
        raise ValueError("local file required")
    before = path.stat()
    if source_sha256(path) != manifest.scope.sourceSha256:
        raise ValueError("source hash mismatch")
    claims = {a.rational(): a for a in manifest.anchors}
    if (len(claims) != len(manifest.anchors)
            or len({a.anchorId for a in manifest.anchors}) != len(manifest.anchors)
            or len({a.frameId for a in manifest.anchors}) != len(manifest.anchors)):
        raise ValueError("duplicate anchor claim")
    import av

    found = {}
    proof_frames = []
    previous_pts = None
    sample_segment = None
    next_time = 0.0
    with av.open(str(path), options={"protocol_whitelist": "file"}) as container:
        if not container.streams.video:
            raise ValueError("video stream required")
        stream = container.streams.video[0]
        stream.thread_type = "SLICE"
        stream.codec_context.thread_count = 1
        origin = recording_origin(stream)
        for index, frame in enumerate(container.decode(video=0)):
            pts = decoded_pts(frame)
            if origin is None:
                origin = pts
            if any(a.origin() != origin for a in manifest.anchors):
                raise ValueError("anchor recording origin mismatch")
            if previous_pts is not None and pts <= previous_pts:
                raise ValueError("decoded source PTS must strictly increase")
            previous_pts = pts
            relative = pts - origin
            sampled = False
            if sample_fps is not None and relative >= 0:
                segment = relative // 600
                if segment != sample_segment:
                    sample_segment = segment
                    next_time = float(segment * 600)
                time_sec = float(relative)
                if time_sec >= next_time:
                    sampled = True
                    next_time = time_sec + 1.0 / sample_fps
            claim = claims.get(pts)
            if claim is None and not sampled:
                continue
            if len(proof_frames) >= 100008:
                raise ValueError("too many source proof rows")
            rgb = frame.to_ndarray(format="rgb24")
            digest = hashlib.sha256(rgb.tobytes(order="C")).hexdigest()
            if claim is not None and digest != claim.evidenceHash:
                raise ValueError("frame hash mismatch")
            metadata = (claim.model_dump(exclude={"anchorId", "box"}) if claim is not None else {
                "frameId": f"sample_{index}", "framePts": frame.pts,
                "timeBaseNumerator": Fraction(frame.time_base).numerator,
                "timeBaseDenominator": Fraction(frame.time_base).denominator,
                "originNumerator": origin.numerator, "originDenominator": origin.denominator,
                "timestampSec": float(relative), "evidenceHash": digest})
            proof = DecodedFrameProof(**metadata, frameIndex=index,
                                      width=rgb.shape[1], height=rgb.shape[0])
            proof_frames.append(proof)
            if claim is not None:
                found[pts] = proof
    after = path.stat()
    if ((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
            or source_sha256(path) != manifest.scope.sourceSha256):
        raise ValueError("source changed")
    if len(found) != len(claims):
        raise ValueError("source PTS not found")
    anchors = [UserAnchor(anchorId=a.anchorId, scope=manifest.scope, box=a.box,
                          frameIndex=found[a.rational()].frameIndex,
                          timestampSec=a.timestampSec, evidenceHash=a.evidenceHash) for a in manifest.anchors]
    return anchors, SourcePtsProof(schemaVersion=1, scope=manifest.scope, frames=proof_frames)
