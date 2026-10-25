"""Rescore retained, source-bound traces without OCR, inference or training."""
from __future__ import annotations

import json

from app.contract import SegmentResult
from app.match_identity import MatchTarget
from eval.full_match_validation import digest
from eval.trail_metrics import TrailLabels, trail_metrics


def rescore(comparison: dict, labels: TrailLabels, start: float, end: float, fps: float) -> dict:
    if (comparison.get('sourceSha256') != labels.sourceSha256
            or MatchTarget.model_validate(comparison.get('target')) != labels.target
            or comparison.get('interval') != [start, end] or comparison.get('fps') != fps
            or comparison.get('authorizedLocalEvaluation') is not True
            or comparison.get('productionApproval') is not False
            or comparison.get('modelTraining') is not False or comparison.get('cloudUpload') is not False):
        raise ValueError('historical comparison scope or safety declaration mismatch')
    metrics = {}
    for name in ('baseline', 'candidate'):
        run = comparison.get(name)
        if run is None and name == 'candidate':
            continue
        if not isinstance(run, dict):
            raise ValueError('baseline is required')
        segment = SegmentResult.model_validate_json(json.dumps(run.get('segment'), allow_nan=False))
        audit = run.get('decodeAudit', {})
        frames = run.get('frames')
        claims = run.get('claims')
        if (segment.stages.tracking != 'complete' or segment.stages.identity != 'complete'
                or segment.identity.candidates or audit.get('complete') is not True
                or audit.get('timestampsValid') is not True or audit.get('missingIntervals') != []
                or audit.get('requestedStartSec') != start or audit.get('requestedEndSec') != end
                or audit.get('sampleStepSec') != 1/fps or not isinstance(frames, list)
                or not isinstance(claims, list) or audit.get('framesDecoded') != len(frames)
                or segment.coverage.framesDecoded != len(frames)
                or any(c.get('state') != 'confirmed' for c in claims)
                or sum(f.get('trailState') == 'confirmed' for f in frames) != len(claims)
                or any(not any(f['timeSec'] == c.get('timeSec') and f.get('trailState') == 'confirmed'
                               for f in frames) for c in claims)):
            raise ValueError('complete abstention-safe retained traces required; propagation is not accepted')
        value = trail_metrics([f['timeSec'] for f in frames], claims, labels)
        if not value.get('reviewedVisibleFrames'):
            value['idSwitches'] = value['fragmentations'] = None
        value['reviewStatus'] = ('reviewed_sampled_metrics' if value.get('scoredFrames')
                                 else 'insufficient_scorable_review')
        value['sampledTargetRecall'] = value['trailCoverage']
        value['detectionRecallReason'] = 'Historical detector proposals were not retained; no detector-recall claim.'
        value['qualifyingReads'] = run.get('qualifyingReads')
        metrics[name] = value
    return {'schemaVersion': 1, 'sourceSha256': labels.sourceSha256,
            'target': labels.target.model_dump(exclude_defaults=True), 'comparisonSha256': digest(comparison),
            'labelsSha256': digest(labels.model_dump(mode='json')), 'metrics': metrics,
            'historicalCodeHashesPresent': bool(comparison.get('codeSha256')),
            'productionApproval': False, 'fullRecordingValidated': False,
            'modelTraining': False, 'cloudUpload': False,
            'scope': 'Reviewed sampled traces only; no model rerun, held-out acceptance or gate change.'}
