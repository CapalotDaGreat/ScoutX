"""Contract v2 between PitchProof Cloud Functions and this worker.

Mirrors functions/src/analysis/cvContract.ts. The Functions side re-validates every response,
so this module only guarantees the worker never emits something outside the contract.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

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
        return self
