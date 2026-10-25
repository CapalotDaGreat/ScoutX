"""Offline match-scoped association. Fresh local OCR is required after every break.

This joins independently supported samples under one explicit target description,
not biometric re-identification. Reference points are retained for review, never
used to silently label a whole tracker ID or an unseen interval.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator

from .experimental_identity import Id, Interval, MatchScope, StrictModel, UserAnchor
from .identity import Track, TrackObservation, associate, availability_windows
from .teams import kit_rgb

Time = Annotated[float, Field(ge=0, le=9000)]
Unit = Annotated[float, Field(ge=0, le=1)]


class MatchTarget(StrictModel):
    jerseyNumber: Annotated[str, Field(pattern=r"^[0-9]{1,2}$")]
    kitPrimaryColor: Annotated[str, Field(min_length=1, max_length=40)]
    kitSecondaryColor: Annotated[str, Field(max_length=40)] = ""

    @field_validator("kitPrimaryColor", "kitSecondaryColor")
    @classmethod
    def supported_kit(cls, value: str) -> str:
        if value and kit_rgb(value) is None:
            raise ValueError("unsupported kit colour")
        return value.strip().lower()

    @model_validator(mode="after")
    def primary_required(self):
        if not self.kitPrimaryColor:
            raise ValueError("primary kit colour is required")
        return self


class MatchSample(StrictModel):
    timestampSec: Time
    jerseyRead: Annotated[str, Field(pattern=r"^[0-9]{1,2}$")] | None = None
    jerseyConfidence: Unit
    teamMatch: Unit
    box: tuple[float, float, float, float]

    @model_validator(mode="after")
    def valid_box(self):
        x1, y1, x2, y2 = self.box
        if not 0 <= x1 < x2 or not 0 <= y1 < y2:
            raise ValueError("invalid pixel box")
        return self


class MatchTracklet(StrictModel):
    trackletId: Id
    samples: Annotated[list[MatchSample], Field(min_length=1, max_length=3600)]


class MatchSegment(StrictModel):
    segmentId: Id
    startSec: Time
    endSec: Time
    tracklets: Annotated[list[MatchTracklet], Field(max_length=64)]

    @model_validator(mode="after")
    def bounded(self):
        if not 0 < self.endSec - self.startSec <= 600:
            raise ValueError("segments must be positive and at most ten minutes")
        if len({t.trackletId for t in self.tracklets}) != len(self.tracklets):
            raise ValueError("duplicate local tracklet IDs")
        for track in self.tracklets:
            times = [s.timestampSec for s in track.samples]
            if any(not self.startSec <= t < self.endSec for t in times):
                raise ValueError("sample outside source interval")
            if any(b <= a for a, b in zip(times, times[1:])):
                raise ValueError("sample timestamps must strictly increase")
        return self


class MatchBreak(StrictModel):
    timestampSec: Time
    reason: Literal["halftime", "camera_cut", "non_play", "manual_reset"]


class MatchIdentityRequest(StrictModel):
    scope: MatchScope
    target: MatchTarget
    durationSec: Annotated[float, Field(gt=0, le=9000)]
    sampleStepSec: Annotated[float, Field(ge=0.2, le=1)] = 0.5
    references: Annotated[list[UserAnchor], Field(max_length=16)] = Field(default_factory=list)
    breaks: Annotated[list[MatchBreak], Field(max_length=256)] = Field(default_factory=list)
    nonPlayIntervals: Annotated[list[Interval], Field(max_length=32)] = Field(default_factory=list)
    segments: Annotated[list[MatchSegment], Field(min_length=1, max_length=32)]

    @model_validator(mode="after")
    def match_scope(self):
        ordered = sorted(self.segments, key=lambda s: s.startSec)
        if any(b.startSec < a.endSec for a, b in zip(ordered, ordered[1:])):
            raise ValueError("owned segments must not overlap")
        if any(s.endSec > self.durationSec for s in ordered):
            raise ValueError("segment outside match")
        if len({s.segmentId for s in ordered}) != len(ordered):
            raise ValueError("duplicate segment IDs")
        if any(a.scope != self.scope or a.timestampSec >= self.durationSec for a in self.references):
            raise ValueError("reference scope or timestamp mismatch")
        if len({a.anchorId for a in self.references}) != len(self.references):
            raise ValueError("duplicate reference IDs")
        if any(b.timestampSec >= self.durationSec for b in self.breaks):
            raise ValueError("break outside match")
        excluded = sorted(self.nonPlayIntervals, key=lambda i: i.startSec)
        if (any(i.endSec > self.durationSec for i in excluded)
                or any(b.startSec < a.endSec for a, b in zip(excluded, excluded[1:]))):
            raise ValueError("non-play intervals overlap or exceed match")
        if sum(len(t.samples) for s in ordered for t in s.tracklets) > 100000:
            raise ValueError("too many observations")
        return self


class MatchWindow(StrictModel):
    startSec: Time
    endSec: Time
    state: Literal["CONFIRMED_VISIBLE", "UNKNOWN"]
    confidence: Unit


class MatchSighting(StrictModel):
    segmentId: Id
    trackletId: Id
    sample: MatchSample


class MatchIdentityResult(StrictModel):
    scope: MatchScope
    targetId: Id
    target: MatchTarget
    references: list[UserAnchor]
    breaks: list[MatchBreak]
    nonPlayIntervals: list[Interval]
    windows: list[MatchWindow]
    sightings: list[MatchSighting]
    associationMethod: Literal["fresh_local_jersey_and_kit"] = "fresh_local_jersey_and_kit"
    calibrated: Literal[False] = False
    continuousIdentityValidated: Literal[False] = False


def resolve_match(request: MatchIdentityRequest) -> MatchIdentityResult:
    request = MatchIdentityRequest.model_validate(request.model_dump())
    windows: list[MatchWindow] = []
    sightings: list[MatchSighting] = []
    cursor = 0.0
    for segment in sorted(request.segments, key=lambda s: s.startSec):
        if segment.startSec > cursor:
            windows.append(MatchWindow(startSec=cursor, endSec=segment.startSec, state="UNKNOWN", confidence=0.0))
        boundaries = sorted({segment.startSec, segment.endSec} | {
            b.timestampSec for b in request.breaks if segment.startSec < b.timestampSec < segment.endSec}
            | {t for i in request.nonPlayIntervals for t in (i.startSec, i.endSec)
               if segment.startSec < t < segment.endSec})
        for start, end in zip(boundaries, boundaries[1:]):
            if any(i.startSec <= start < i.endSec for i in request.nonPlayIntervals):
                windows.append(MatchWindow(startSec=start, endSec=end, state="UNKNOWN", confidence=0.0))
                continue
            tracks = [Track(t.trackletId, [TrackObservation(s.timestampSec, s.jerseyRead,
                        s.jerseyConfidence, s.teamMatch, s.box) for s in t.samples
                        if start <= s.timestampSec < end]) for t in segment.tracklets]
            association = associate(tracks, request.target.jerseyNumber, kit_known=True)
            windows.extend(MatchWindow(**w) for w in availability_windows(
                association, start, end, request.sampleStepSec, False))
            confirmed = {(t.track_id, o.time_sec) for t in association.target_tracks for o in t.observations}
            sightings.extend(MatchSighting(segmentId=segment.segmentId, trackletId=t.trackletId, sample=s)
                             for t in segment.tracklets for s in t.samples
                             if (t.trackletId, s.timestampSec) in confirmed)
        cursor = segment.endSec
    if cursor < request.durationSec:
        windows.append(MatchWindow(startSec=cursor, endSec=request.durationSec, state="UNKNOWN", confidence=0.0))
    return MatchIdentityResult(scope=request.scope, targetId=request.scope.jobId,
                               target=request.target, references=request.references, breaks=request.breaks,
                               nonPlayIntervals=request.nonPlayIntervals,
                               windows=windows, sightings=sightings)
