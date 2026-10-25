"""Offline, bounded match-scoped evidence experiment, not person re-identification.

No persistence, embeddings, runtime integration or probabilistic identity scores.
Times are exact source timestamps; intervals are half-open. Manual corrections are
supplied as a replacement request, never accumulated in hidden resolver state.
"""
from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Id = Annotated[str, Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_-]+$")]
Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Time = Annotated[float, Field(ge=0, le=14400)]
Frame = Annotated[int, Field(ge=0, le=1728000)]
Unit = Annotated[float, Field(ge=0, le=1)]
Jersey = Annotated[str, Field(pattern=r"^[0-9]{1,2}$")]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False, frozen=True)


class NormalizedBox(StrictModel):
    x: Unit
    y: Unit
    width: Annotated[float, Field(gt=0, le=1)]
    height: Annotated[float, Field(gt=0, le=1)]

    @model_validator(mode="after")
    def contained(self):
        if self.x + self.width > 1 or self.y + self.height > 1:
            raise ValueError("box must fit within the normalized image")
        return self


class MatchScope(StrictModel):
    jobId: Id
    sourceSha256: Digest
    generation: Annotated[int, Field(ge=0, le=1000000)]
    modelSetDigest: Digest


class Interval(StrictModel):
    startSec: Time
    endSec: Time

    @model_validator(mode="after")
    def ordered(self):
        if self.endSec <= self.startSec:
            raise ValueError("interval must have positive duration")
        return self


class UserAnchor(StrictModel):
    anchorId: Id
    scope: MatchScope
    frameIndex: Frame
    timestampSec: Time
    box: NormalizedBox
    evidenceHash: Digest


class Observation(StrictModel):
    observationId: Id
    frameIndex: Frame
    timestampSec: Time
    box: NormalizedBox
    evidenceHash: Digest
    # A supplied readable number is contradictory evidence, never identity proof.
    readableJersey: Jersey | None = None
    appearanceScore: Unit | None = None


class LocalTracklet(StrictModel):
    trackletId: Id
    observations: Annotated[list[Observation], Field(min_length=1, max_length=32)]


class Segment(StrictModel):
    segmentId: Id
    scope: MatchScope
    context: Interval
    owned: Interval
    tracklets: Annotated[list[LocalTracklet], Field(max_length=16)]

    @model_validator(mode="after")
    def bounded(self):
        if (self.context.endSec - self.context.startSec > 120
                or not self.context.startSec <= self.owned.startSec < self.owned.endSec <= self.context.endSec):
            raise ValueError("owned interval must lie within at most 120 seconds of context")
        for track in self.tracklets:
            times = [o.timestampSec for o in track.observations]
            frames = [o.frameIndex for o in track.observations]
            if any(b <= a for a, b in zip(times, times[1:])) or any(b <= a for a, b in zip(frames, frames[1:])):
                raise ValueError("tracklet frames and times must strictly increase")
            if any(not self.context.startSec <= t < self.context.endSec for t in times):
                raise ValueError("observation outside context")
        return self


class ResolverRequest(StrictModel):
    scope: MatchScope
    targetJersey: Jersey | None = None
    anchors: Annotated[list[UserAnchor], Field(max_length=16)]
    segments: Annotated[list[Segment], Field(min_length=1, max_length=8)]

    @model_validator(mode="after")
    def consistent(self):
        ids = [a.anchorId for a in self.anchors]
        segment_ids = [s.segmentId for s in self.segments]
        track_ids = [t.trackletId for s in self.segments for t in s.tracklets]
        observation_ids = [o.observationId for s in self.segments for t in s.tracklets for o in t.observations]
        for group in (ids, segment_ids, track_ids, observation_ids):
            if len(set(group)) != len(group):
                raise ValueError("duplicate IDs within an entity kind")
        if len(observation_ids) > 512:
            raise ValueError("at most 512 observations per request")
        if any(a.scope != self.scope for a in self.anchors) or any(s.scope != self.scope for s in self.segments):
            raise ValueError("scope mismatch")
        frame_times = {}
        time_frames = {}
        for s in self.segments:
            for t in s.tracklets:
                for o in t.observations:
                    if (frame_times.setdefault(o.frameIndex, o.timestampSec) != o.timestampSec
                            or time_frames.setdefault(o.timestampSec, o.frameIndex) != o.frameIndex):
                        raise ValueError("inconsistent source frame/time mapping")
        return self


class ObservationDecision(StrictModel):
    observationId: Id
    state: Literal["CONFIRMED_OBSERVATION", "UNKNOWN", "AMBIGUOUS", "CONFLICT"]


class AnchorDecision(StrictModel):
    anchorId: Id
    state: Literal["BOUND", "UNMATCHED", "AMBIGUOUS", "CONFLICT"]


class ReviewInterval(Interval):
    state: Literal["UNKNOWN"] = "UNKNOWN"
    reason: Literal["point_evidence_only"] = "point_evidence_only"


class ExperimentalResolverOutput(StrictModel):
    scope: MatchScope
    experimental: Literal[True] = True
    observations: Annotated[list[ObservationDecision], Field(max_length=512)]
    anchors: Annotated[list[AnchorDecision], Field(max_length=16)]
    uncertainWindows: Annotated[list[ReviewInterval], Field(max_length=8)]
    ownedCoverageSec: Annotated[float, Field(ge=0, le=960)]
    confirmedCoverageSec: Literal[0.0] = 0.0


def _overlaps(a: NormalizedBox, b: NormalizedBox) -> bool:
    """IoU >= 0.5; touching boundaries are not overlapping evidence."""
    intersection = max(0.0, min(a.x + a.width, b.x + b.width) - max(a.x, b.x)) * max(
        0.0, min(a.y + a.height, b.y + b.height) - max(a.y, b.y))
    return intersection >= 0.5 * (a.width * a.height + b.width * b.height - intersection)


def resolve(request: ResolverRequest) -> ExperimentalResolverOutput:
    """Revalidate even model_construct/mutated input; return deterministic point evidence.

    Cross-segment copies require reciprocal unique overlap, identical evidence hash,
    and consistent readable jerseys. Any competing overlap blocks the whole point;
    there is no temporal propagation, including along a local tracker ID.
    """
    request = ResolverRequest.model_validate(request.model_dump())
    rows = sorted(((s.segmentId, o) for s in request.segments for t in s.tracklets
                   for o in t.observations), key=lambda row: row[1].observationId)
    states = {o.observationId: "UNKNOWN" for _, o in rows}
    anchor_states = []
    for anchor in sorted(request.anchors, key=lambda a: a.anchorId):
        same_time = [(sid, o) for sid, o in rows
                     if o.frameIndex == anchor.frameIndex and o.timestampSec == anchor.timestampSec]
        hits = [(sid, o) for sid, o in same_time if _overlaps(anchor.box, o.box)]
        if not hits:
            anchor_states.append(AnchorDecision(anchorId=anchor.anchorId, state="UNMATCHED"))
            continue
        # Include all competing copies, even ones outside the anchor's smaller box.
        neighbors = [(sid, o) for sid, o in same_time
                     if any(_overlaps(o.box, hit.box) for _, hit in hits)]
        unique = (len({sid for sid, _ in neighbors}) == len(neighbors)
                  and all(_overlaps(a.box, b.box) for _, a in neighbors for _, b in neighbors))
        jerseys = {o.readableJersey for _, o in neighbors if o.readableJersey is not None}
        if request.targetJersey is not None:
            jerseys.add(request.targetJersey)
        conflict = len(jerseys) > 1 or any(o.evidenceHash != anchor.evidenceHash for _, o in neighbors)
        state = "AMBIGUOUS" if not unique else "CONFLICT" if conflict else "BOUND"
        anchor_states.append(AnchorDecision(anchorId=anchor.anchorId, state=state))
        for _, observation in neighbors:
            old = states[observation.observationId]
            new = "CONFIRMED_OBSERVATION" if state == "BOUND" else state
            # Conflicting anchors cannot overwrite earlier uncertainty or vice versa.
            rank = {"UNKNOWN": 0, "CONFIRMED_OBSERVATION": 1, "CONFLICT": 2, "AMBIGUOUS": 3}
            states[observation.observationId] = max((old, new), key=rank.get)
    # Disjoint user anchors at the same instant are competing target claims.
    for _, observation in rows:
        confirmed = [o for _, o in rows if o.frameIndex == observation.frameIndex
                     and states[o.observationId] == "CONFIRMED_OBSERVATION"]
        if any(not _overlaps(a.box, b.box) for a in confirmed for b in confirmed):
            for o in confirmed:
                states[o.observationId] = "AMBIGUOUS"
    # Report final conflicts on the anchor too, including competing manual claims.
    final_anchors = []
    for anchor, decision in zip(sorted(request.anchors, key=lambda a: a.anchorId), anchor_states):
        linked_states = {states[o.observationId] for _, o in rows
                         if o.frameIndex == anchor.frameIndex and o.timestampSec == anchor.timestampSec
                         and _overlaps(anchor.box, o.box)}
        state = ("AMBIGUOUS" if "AMBIGUOUS" in linked_states else
                 "CONFLICT" if "CONFLICT" in linked_states else decision.state)
        final_anchors.append(AnchorDecision(anchorId=anchor.anchorId, state=state))
    intervals: list[list[float]] = []
    for owned in sorted((s.owned for s in request.segments), key=lambda i: (i.startSec, i.endSec)):
        if intervals and owned.startSec <= intervals[-1][1]:
            intervals[-1][1] = max(intervals[-1][1], owned.endSec)
        else:
            intervals.append([owned.startSec, owned.endSec])
    return ExperimentalResolverOutput(
        scope=request.scope,
        observations=[ObservationDecision(observationId=key, state=value) for key, value in sorted(states.items())],
        anchors=final_anchors,
        uncertainWindows=[ReviewInterval(startSec=a, endSec=b) for a, b in intervals],
        ownedCoverageSec=sum(b - a for a, b in intervals),
    )
