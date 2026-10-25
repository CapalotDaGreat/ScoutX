"""Contract v2 between PitchProof Cloud Functions and this worker.

Mirrors functions/src/analysis/cvContract.ts. The Functions side re-validates every response,
so this module only guarantees the worker never emits something outside the contract.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from .experimental_identity import StrictModel
from .match_identity import MatchIdentityRequest
from .source_pts import SourcePtsProof

CONTRACT_VERSION = 2

AvailabilityState = Literal["CONFIRMED_VISIBLE", "LIKELY_ACTIVE_OFF_CAMERA", "CONFIRMED_OFF_PITCH", "UNKNOWN"]
IdentityState = Literal["CONFIRMED_VISIBLE", "CANDIDATE", "UNKNOWN"]
StageState = Literal["complete", "failed", "unavailable"]
EventType = Literal["shot", "pass", "dribble", "tackle", "save", "duel", "other"]
CameraView = Literal["wide", "medium", "close", "replay", "non_play", "unclear"]


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=8, max_length=4096)
    headers: str | None = None

    @field_validator("url")
    @classmethod
    def network_only(cls, value: str) -> str:
        if not value.startswith(("https://", "http://")):
            raise ValueError("source must be an http(s) URL")
        return value


class Target(BaseModel):
    model_config = ConfigDict(extra="forbid")
    jerseyNumber: str = Field(default="", max_length=3)
    kitPrimaryColor: str = Field(default="", max_length=40)
    kitSecondaryColor: str = Field(default="", max_length=40)
    teamSide: str = Field(default="unknown", max_length=10)
    position: str = Field(default="unknown", max_length=12)


class Sampling(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fps: float = Field(gt=0, le=5)


class Privacy(BaseModel):
    """The caller must ask for the privacy-preserving behaviour explicitly; anything else is refused."""

    model_config = ConfigDict(extra="forbid")
    retainNonTargetIdentities: Literal[False]
    faceRecognition: Literal[False]
    persistMedia: Literal[False]


class SegmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contractVersion: Literal[2]
    jobId: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")
    segmentIndex: int = Field(ge=0, le=50)
    startSec: float = Field(ge=0)
    endSec: float = Field(gt=0)
    source: Source
    target: Target
    sampling: Sampling
    privacy: Privacy

    @model_validator(mode="after")
    def bounded_window(self) -> "SegmentRequest":
        if self.endSec <= self.startSec or self.endSec - self.startSec > 900:
            raise ValueError("segment must be 0-900 seconds long")
        return self


class Stages(BaseModel):
    tracking: StageState
    identity: StageState
    events: StageState
    pitch: StageState


class Candidate(BaseModel):
    trackId: str
    jerseyRead: str | None
    jerseyConfidence: float = Field(ge=0, le=1)
    teamMatch: float = Field(ge=0, le=1)
    firstSec: float
    lastSec: float


class Identity(BaseModel):
    state: IdentityState
    candidates: list[Candidate]


class Window(BaseModel):
    startSec: float
    endSec: float
    state: AvailabilityState
    confidence: float = Field(ge=0, le=1)


class Coverage(BaseModel):
    analysedSec: float = Field(ge=0)
    targetVisibleSec: float = Field(ge=0)
    framesDecoded: int = Field(ge=0)


class Event(BaseModel):
    type: EventType
    startSec: float
    endSec: float
    confidence: float = Field(ge=0, le=1)
    frameTimesSec: list[float]


class SegmentResult(BaseModel):
    contractVersion: Literal[2] = CONTRACT_VERSION
    workerVersion: str
    models: dict[str, str] = Field(default_factory=dict)
    segmentIndex: int
    stages: Stages
    cameraView: CameraView
    identity: Identity
    availability: list[Window]
    coverage: Coverage
    events: list[Event]

    @model_validator(mode="after")
    def consistent(self) -> "SegmentResult":
        if self.coverage.targetVisibleSec > self.coverage.analysedSec + 1e-6:
            raise ValueError("visible time cannot exceed analysed time")
        ordered = sorted(self.availability, key=lambda window: window.startSec)
        for previous, current in zip(ordered, ordered[1:]):
            if current.startSec < previous.endSec:
                raise ValueError("availability windows overlap")
        if self.stages.events != "complete" and self.events:
            raise ValueError("events reported without a complete event stage")
        if len(self.models) > 8 or any(len(k) > 40 or len(v) > 120 for k, v in self.models.items()):
            raise ValueError("model identifiers out of bounds")
        return self


# Private IAM/server-artifact wire contract; never accept end-user supplied proofs.
class MatchIdentityEnvelope(StrictModel):
    evidence: MatchIdentityRequest
    sourceProof: SourcePtsProof

    @field_validator("evidence", mode="before")
    @classmethod
    def json_evidence(cls, value):
        # JSON arrays represent MatchSample's strict tuple on the HTTP wire.
        if isinstance(value, dict):
            import json
            return MatchIdentityRequest.model_validate_json(json.dumps(value, allow_nan=False))
        return value

    @model_validator(mode="after")
    def bound_source(self):
        evidence, proof = self.evidence, self.sourceProof
        if evidence.scope != proof.scope or not 1 <= len(evidence.references) <= 8:
            raise ValueError("source scope or reference count mismatch")
        frames = {f.timestampSec: f for f in proof.frames}
        used = set()
        claims = set()
        for anchor in evidence.references:
            frame = frames.get(anchor.timestampSec)
            if (frame is None or frame.frameIndex != anchor.frameIndex
                    or frame.frameId != anchor.anchorId
                    or frame.evidenceHash != anchor.evidenceHash or anchor.frameIndex in claims):
                raise ValueError("reference proof mismatch")
            claims.add(anchor.frameIndex)
            used.add(anchor.timestampSec)
        for segment in evidence.segments:
            for track in segment.tracklets:
                for sample in track.samples:
                    frame = frames.get(sample.timestampSec)
                    if frame is None:
                        raise ValueError("observation proof missing")
                    if sample.box[2] > frame.width or sample.box[3] > frame.height:
                        raise ValueError("observation exceeds source dimensions")
                    used.add(sample.timestampSec)
        if used != set(frames):
            raise ValueError("unbound proof rows")
        return self
