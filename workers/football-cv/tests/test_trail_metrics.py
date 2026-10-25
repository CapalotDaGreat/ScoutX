import pytest

from eval.trail_metrics import TrailLabels, trail_metrics


def labels(states):
    return TrailLabels.model_validate_json(__import__('json').dumps({
        'schemaVersion': 1, 'sourceSha256': 'a'*64,
        'target': {'jerseyNumber': '20', 'kitPrimaryColor': 'orange'},
        'reviewerId': 'reviewer', 'reviewed': True,
        'frames': [{'timeSec': float(i), 'state': state,
                    'box': [0., 0., 10., 20.] if state == 'visible' else None}
                   for i, state in enumerate(states)]}))


def claim(t, key='a', box=None):
    return {'timeSec': float(t), 'trackId': key, 'box': box or [0., 0., 10., 20.]}


def test_unlabeled_metrics_are_unmeasured_not_zero_errors():
    result = trail_metrics([0., 1.], [], None)
    assert result['sampledAbstentionRate'] == 1
    for key in ('trailCoverage', 'falseClaimRate', 'idSwitches', 'fragmentations', 'detectionRecall'):
        assert result[key] is None


def test_wrong_player_miss_switch_fragment_and_absent_target():
    truth = labels(['visible']*5 + ['off_camera'])
    result = trail_metrics([float(i) for i in range(6)],
        [claim(0), claim(2, 'b'), claim(3, 'b', [30, 0, 40, 20]), claim(4, 'b'), claim(5, 'b')], truth)
    assert result['trailCoverage'] == 3/5
    assert result['falseClaimRate'] == 2/6
    assert result['falseClaimsAmongClaims'] == 2/5
    assert result['idSwitches'] == 1
    assert result['fragmentations'] == 2
    assert result['sampledAbstentionRate'] == pytest.approx(1/6)


def test_occlusion_and_reentry_do_not_invent_switches_or_fragments():
    truth = labels(['visible', 'occluded', 'visible', 'off_camera', 'visible'])
    result = trail_metrics([0., 1., 2., 3., 4.], [claim(0), claim(2, 'b'), claim(4, 'c')], truth)
    assert result['trailCoverage'] == 1
    assert result['idSwitches'] == result['fragmentations'] == 0


@pytest.mark.parametrize('claims', [[claim(0), claim(0)], [claim(3)], [claim(0, box=[0, 0, float('nan'), 2])]])
def test_malformed_trace_is_not_abstention(claims):
    with pytest.raises(ValueError):
        trail_metrics([0., 1.], claims, None)


def test_missing_review_sample_is_not_cherry_picked():
    with pytest.raises(ValueError, match='every exact'):
        trail_metrics([0., 1., 2.], [], labels(['visible', 'visible']))


def test_wholly_uncertain_review_cannot_claim_perfect_accuracy():
    result = trail_metrics([0., 1.], [], labels(['uncertain', 'occluded']))
    assert result['trailCoverage'] is result['falseClaimRate'] is None


def test_millisecond_label_quantization_uses_matched_sample_not_float_key():
    truth = labels(['visible'])
    result = trail_metrics([.0000001], [claim(.0000001)], truth)
    assert result['trailCoverage'] == 1
