import json
from types import SimpleNamespace

import pytest

from app.contract import SegmentRequest
from app.pipeline import analyse_segment
from eval.tracking_diagnosis import main, run
from test_worker import components, request_body, FakeSource
import sys


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


def test_lost_state_does_not_propagate_an_earlier_confirmed_number():
    parts = components(number='20')
    reads = iter([('20', .9)] * 6 + [(None, 0.)] * 34)
    parts.jersey_reader = SimpleNamespace(read=lambda _: next(reads))
    result = run(parts, FakeSource(), request())
    assert [f['trailState'] for f in result['frames'][:3]] == ['confirmed']*3
    assert all(f['trailState'] == 'lost' and f['confidence'] == 0 for f in result['frames'][3:])
    assert len(result['claims']) == 3


def test_wrong_source_labels_fail_before_inference(tmp_path):
    source = tmp_path/'source.mp4'
    source.write_bytes(b'not decoded: labels should fail first')
    labels = tmp_path/'labels.json'
    labels.write_text(json.dumps({'schemaVersion': 1, 'sourceSha256': 'a'*64,
        'target': {'jerseyNumber': '20', 'kitPrimaryColor': 'orange'}, 'reviewerId': 'reviewer',
        'reviewed': True, 'frames': [{'timeSec': 1., 'state': 'uncertain', 'box': None}]}))
    out = tmp_path/'out'
    assert main(['--input', str(source), '--out', str(out), '--start', '1', '--end', '2',
                 '--jersey-number', '20', '--kit-primary-color', 'orange', '--labels', str(labels),
                 '--authorize-local-evaluation']) == 1
    assert not out.exists()


@pytest.mark.parametrize('source', ['https://example.com/match.mp4', r'\\server\share\match.mp4'])
def test_remote_sources_are_rejected_before_network_access(tmp_path, source):
    with pytest.raises(SystemExit):
        main(['--input', source, '--out', str(tmp_path/'out'), '--start', '1', '--end', '2',
              '--jersey-number', '20', '--kit-primary-color', 'orange', '--authorize-local-evaluation'])


def test_single_command_compares_fresh_trackers_and_publishes_unreviewed_template(tmp_path, monkeypatch):
    from eval import tracking_diagnosis as workflow
    from app import backends
    source = tmp_path/'source.mp4'
    source.write_bytes(b'controlled test, not footage')
    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(set_num_threads=lambda _: None,
                                                             set_num_interop_threads=lambda _: None))
    monkeypatch.setattr(backends, 'default_components', lambda *a, **kw: components(number='20'))
    monkeypatch.setattr(workflow, 'LocalFile', lambda _: FakeSource(count=4))
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'CUDA_VISIBLE_DEVICES'):
        monkeypatch.setenv(key, '')
    out = tmp_path/'out'
    args = ['--input', str(source), '--out', str(out), '--start', '0', '--end', '2', '--fps', '2',
            '--jersey-number', '20', '--kit-primary-color', 'red', '--kit-secondary-color', 'white',
            '--compare-scale2x', '--authorize-local-evaluation']
    assert main(args) == 0
    value = json.loads((out/'diagnosis.json').read_text())
    assert value['baseline']['qualifyingReads'] == value['candidate']['qualifyingReads'] == 4
    assert value['candidateDecision'] == 'rejected_no_target_read_gain'
    assert value['candidateSelectedForProduction'] is value['fullRecordingValidated'] is False
    assert len(value['codeSha256']) == 7
    assert value['baseline']['metrics']['falseClaimRate'] is None
    assert json.loads((out/'labels.template.json').read_text())['reviewed'] is False
    original = (out/'diagnosis.json').read_bytes()
    assert main(args) == 1
    assert (out/'diagnosis.json').read_bytes() == original


def test_review_boxes_must_fit_actual_source_dimensions():
    from eval.trail_metrics import TrailLabels
    truth = TrailLabels.model_validate_json(json.dumps({'schemaVersion': 1, 'sourceSha256': 'a'*64,
        'target': {'jerseyNumber': '20', 'kitPrimaryColor': 'red'}, 'reviewerId': 'reviewer', 'reviewed': True,
        'frames': [{'timeSec': i*.5, 'state': 'visible', 'box': [0., 0., 1300., 20.]} for i in range(20)]}))
    with pytest.raises(ValueError, match='source dimensions'):
        run(components(number='20'), FakeSource(), request(), truth)


def test_source_changes_are_not_published_as_a_complete_comparison(tmp_path, monkeypatch):
    from eval import tracking_diagnosis as workflow
    from app import backends
    source = tmp_path/'source.mp4'
    source.write_bytes(b'original fixture')
    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(set_num_threads=lambda _: None,
                                                             set_num_interop_threads=lambda _: None))
    monkeypatch.setattr(backends, 'default_components', lambda *a, **kw: components())
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'CUDA_VISIBLE_DEVICES'):
        monkeypatch.setenv(key, '')
    def changing(*args):
        source.write_bytes(b'mutated fixture')
        return {}
    monkeypatch.setattr(workflow, 'run', changing)
    out = tmp_path/'out'
    assert main(['--input', str(source), '--out', str(out), '--start', '0', '--end', '2',
                 '--jersey-number', '20', '--kit-primary-color', 'red', '--authorize-local-evaluation']) == 1
    assert not out.exists()


def test_opposing_same_number_is_only_an_aggregate_rejection_not_a_retained_identity():
    class OpponentSource:
        def frames(self, *args):
            for t, frame in FakeSource().frames(*args):
                frame[:] = (30, 60, 180)
                yield t, frame
    result = run(components(number='20'), OpponentSource(), request())
    assert result['qualifyingReads'] == result['numberReadCandidateTracks'] == 0
    assert result['cropRejections']['kit_rejected'] == 20
    assert all(not f['numberReadCandidates'] for f in result['frames'])
    assert '1:t1' not in json.dumps(result)
