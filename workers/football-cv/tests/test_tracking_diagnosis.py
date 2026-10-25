import json

import pytest

from app.contract import SegmentRequest
from app.pipeline import analyse_segment
from eval.tracking_diagnosis import main, run
from test_worker import components, request_body, FakeSource


def request():
    body = request_body(endSec=10.)
    body['target']['jerseyNumber'] = '20'
    return SegmentRequest.model_validate(body)


def test_instrumentation_does_not_change_existing_pipeline_or_double_count_crops():
    trace = []
    baseline = analyse_segment(request(), components(number='20'), trace)
    audited = run(components(number='20'), FakeSource(), request())
    assert audited['segment']['coverage'] == baseline.model_dump()['coverage']
    assert len(audited['claims']) == len(trace) == 20
    assert audited['qualifyingReads'] == 20
    assert audited['numberReadCandidateTracks'] == 1
    assert audited['cropRejections']['accepted'] == 20
    assert audited['cropRejections']['too_small'] == 20
    assert audited['metrics']['trailCoverage'] is None


def test_wrong_number_is_not_exported_as_identity_or_candidate():
    result = run(components(number='18'), FakeSource(), request())
    assert result['qualifyingReads'] == 0
    assert result['claims'] == []
    assert all(not f['numberReadCandidates'] for f in result['frames'])
    assert result['segment']['identity']['candidates'] == []
    assert '"18"' not in json.dumps(result)
    assert '_tracks' not in json.dumps(result)


def test_weak_or_unreadable_evidence_remains_abstention():
    result = run(components(number=None), FakeSource(), request())
    assert result['qualifyingReads'] == 0
    assert result['metrics']['sampledAbstentionRate'] == 1
    assert all(f['trailState'] == 'abstained' for f in result['frames'])


def test_partial_decode_is_not_reported_as_successful_abstention():
    with pytest.raises(ValueError, match='incomplete'):
        run(components(), FakeSource(count=2), request())


def test_missing_source_and_existing_output_fail_without_loading_models(tmp_path):
    out = tmp_path/'existing'
    out.mkdir()
    assert main(['--input', str(tmp_path/'missing.mp4'), '--out', str(out), '--start', '1', '--end', '2',
                 '--jersey-number', '20', '--kit-primary-color', 'orange', '--authorize-local-evaluation']) == 1
    assert list(out.iterdir()) == []


def test_requires_authorization_before_source_access(tmp_path):
    with pytest.raises(SystemExit):
        main(['--input', str(tmp_path/'missing.mp4'), '--out', str(tmp_path/'new'), '--start', '1', '--end', '2',
              '--jersey-number', '20', '--kit-primary-color', 'orange'])
