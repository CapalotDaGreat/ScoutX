"""Sampled trail metrics. No ground truth means unmeasured, never perfect accuracy."""
from __future__ import annotations

import math
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.experimental_identity import Digest, Id, StrictModel
from app.match_identity import MatchTarget
from eval.evaluate import iou, ratio


class TrailLabel(StrictModel):
    timeSec: Annotated[float, Field(ge=0, le=9000)]
    state: Literal['visible', 'off_camera', 'occluded', 'uncertain']
    box: tuple[float, float, float, float] | None = None
    occlusion: Literal['none', 'partial', 'full', 'unknown'] = 'unknown'
    camera: Literal['stable', 'pan', 'zoom', 'cut', 'unknown'] = 'unknown'
    crossing: bool = False

    @model_validator(mode='after')
    def geometry(self):
        if self.state == 'visible':
            if self.box is None or not all(math.isfinite(x) for x in self.box):
                raise ValueError('visible labels need finite source-pixel boxes')
            x1, y1, x2, y2 = self.box
            if not 0 <= x1 < x2 <= 32768 or not 0 <= y1 < y2 <= 32768:
                raise ValueError('invalid source-pixel box')
        elif self.box is not None:
            raise ValueError('non-visible labels cannot carry invented positions')
        return self


class TrailLabels(StrictModel):
    schemaVersion: Literal[1]
    sourceSha256: Digest
    target: MatchTarget
    reviewerId: Id
    reviewed: Literal[True]
    frames: Annotated[list[TrailLabel], Field(min_length=1, max_length=45000)]

    @model_validator(mode='after')
    def ordered(self):
        if any(b.timeSec <= a.timeSec for a, b in zip(self.frames, self.frames[1:])):
            raise ValueError('reviewed samples must strictly increase')
        return self


def trail_metrics(times: list[float], claims: list[dict], labels: TrailLabels | None) -> dict:
    """Labels must match every sampled timestamp. Unknown review states break episodes.

    ID switches compare correctly localized visible claims across misses in one
    visible episode. Fragmentation counts reacquisition after a visible miss,
    not re-entry from off-camera. These are explicit sampled definitions, not HOTA.
    """
    if (not times or any(not math.isfinite(t) for t in times)
            or any(b <= a for a, b in zip(times, times[1:]))):
        raise ValueError('sample times must be finite and strictly increasing')
    by_time = {}
    for claim in claims:
        t = claim['timeSec']
        box = claim['box']
        if (t not in times or t in by_time or len(box) != 4
                or not all(math.isfinite(v) for v in box)
                or not 0 <= box[0] < box[2] or not 0 <= box[1] < box[3]
                or not isinstance(claim.get('trackId'), str) or not claim['trackId']):
            raise ValueError('malformed, duplicate or unsampled claim')
        by_time[t] = claim
    result = {'sampledFrames': len(times), 'claimedFrames': len(claims),
              'sampledAbstentionRate': 1 - len(claims) / len(times),
              'groundTruthAvailable': labels is not None,
              'trailCoverage': None, 'falseClaimRate': None, 'falseClaimsAmongClaims': None,
              'idSwitches': None, 'fragmentations': None, 'detectionRecall': None,
              'scope': 'sampled frames only; no production approval or continuous-frame guarantee'}
    if labels is None:
        return result
    if len(labels.frames) != len(times) or any(abs(a.timeSec-b) > 1e-6 for a, b in zip(labels.frames, times)):
        raise ValueError('review must retain every exact sampled timestamp')
    visible = correct = wrong = scored = switches = fragments = scored_claims = 0
    previous_id = None
    missed_after_correct = False
    for label, actual_time in zip(labels.frames, times):
        claim = by_time.get(actual_time)
        if label.state in ('uncertain', 'occluded'):
            previous_id, missed_after_correct = None, False
            continue
        scored += 1
        scored_claims += claim is not None
        if label.state == 'off_camera':
            wrong += claim is not None
            previous_id, missed_after_correct = None, False
            continue
        visible += 1
        hit = claim is not None and iou(list(label.box), claim['box']) >= .5
        if hit:
            correct += 1
            if previous_id is not None:
                switches += previous_id != claim['trackId']
                fragments += missed_after_correct
            previous_id, missed_after_correct = claim['trackId'], False
        else:
            wrong += claim is not None
            if previous_id is not None:
                missed_after_correct = True
    result.update(reviewedVisibleFrames=visible, scoredFrames=scored,
                  excludedFrames=len(times)-scored, correctlyFollowedFrames=correct,
                  falseClaimFrames=wrong, trailCoverage=ratio(correct, visible),
                  falseClaimRate=ratio(wrong, scored), falseClaimsAmongClaims=ratio(wrong, scored_claims),
                  idSwitches=switches, fragmentations=fragments)
    return result
