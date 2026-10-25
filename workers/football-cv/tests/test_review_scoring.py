import json

import pytest

from eval.review_scoring import rescore
from eval.trail_metrics import TrailLabels


def comparison(sha='a'*64):
    run = {'qualifyingReads': 0, 'frames': [{'timeSec': 0., 'trailState': 'abstained'},
                                         {'timeSec': 1., 'trailState': 'abstained'}], 'claims': [],
           'decodeAudit': {'complete': True, 'timestampsValid': True, 'missingIntervals': [],
               'requestedStartSec': 0., 'requestedEndSec': 2., 'sampleStepSec': 1., 'framesDecoded': 2},
           'segment': {'contractVersion': 2, 'workerVersion': 'synthetic/1', 'models': {}, 'segmentIndex': 0,
               'cameraView': 'unclear', 'stages': {'tracking': 'complete', 'identity': 'complete',
                    'events': 'unavailable', 'pitch': 'unavailable'},
               'identity': {'state': 'UNKNOWN', 'candidates': []}, 'events': [],
               'availability': [{'startSec': 0., 'endSec': 2., 'state': 'UNKNOWN', 'confidence': 0.}],
               'coverage': {'analysedSec': 2., 'targetVisibleSec': 0., 'framesDecoded': 2}}}
    return {'sourceSha256': sha, 'target': {'jerseyNumber': '20', 'kitPrimaryColor': 'red'},
            'interval': [0., 2.], 'fps': 1., 'authorizedLocalEvaluation': True, 'productionApproval': False,
            'modelTraining': False, 'cloudUpload': False, 'baseline': run, 'candidate': None}


def labels():
    return TrailLabels.model_validate_json(json.dumps({'schemaVersion': 1, 'sourceSha256': 'a'*64,
        'target': {'jerseyNumber': '20', 'kitPrimaryColor': 'red'}, 'reviewerId': 'synthetic_reviewer',
        'reviewed': True, 'frames': [{'timeSec': t, 'state': 'visible', 'box': [10., 10., 40., 50.]}
                                   for t in (0., 1.)]}))


def test_reviewed_metrics_are_recovered_without_rerunning_inference():
    result = rescore(comparison(), labels(), 0., 2., 1.)
    metric = result['metrics']['baseline']
    assert metric['trailCoverage'] == metric['sampledTargetRecall'] == 0
    assert metric['falseClaimRate'] == metric['idSwitches'] == metric['fragmentations'] == 0
    assert metric['detectionRecall'] is None
    assert metric['falseClaimsAmongClaims'] is None
    assert result['historicalCodeHashesPresent'] is False
    assert result['productionApproval'] is result['fullRecordingValidated'] is False


@pytest.mark.parametrize('change', ['source', 'target', 'partial', 'missing_claims', 'false_abstention', 'propagation'])
def test_mismatched_or_incomplete_saved_comparisons_are_rejected(change):
    value = comparison()
    if change == 'source': value['sourceSha256'] = 'b'*64
    elif change == 'target': value['target']['jerseyNumber'] = '8'
    elif change == 'partial': value['baseline']['decodeAudit']['complete'] = False
    elif change == 'missing_claims': del value['baseline']['claims']
    elif change == 'false_abstention': value['baseline']['frames'][0]['trailState'] = 'confirmed'
    else: value['baseline']['claims'] = [{'timeSec': 0., 'box': [10., 10., 40., 50.],
                                        'trackId': 'target', 'state': 'inferred-from-tracklet'}]
    with pytest.raises(ValueError):
        rescore(value, labels(), 0., 2., 1.)


def test_all_uncertain_review_does_not_fabricate_zero_identity_errors():
    raw = labels().model_dump(mode='json')
    for frame in raw['frames']:
        frame.update(state='uncertain', box=None)
    truth = TrailLabels.model_validate_json(json.dumps(raw))
    value = rescore(comparison(), truth, 0., 2., 1.)['metrics']['baseline']
    assert value['reviewStatus'] == 'insufficient_scorable_review'
    assert value['idSwitches'] is value['fragmentations'] is value['falseClaimRate'] is None
