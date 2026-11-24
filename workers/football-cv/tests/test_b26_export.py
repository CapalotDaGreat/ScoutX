"""B-26 export/parity regressions: synthetic arrays only, no inference or network."""
import copy
import json
from pathlib import Path

import numpy as np
import pytest

from scoutx_tracker import b26_export as ex
from bench import compare_b26 as cmp

GATE = Path(__file__).resolve().parents[1] / 'bench/gates/balanced_5.2.json'


def write(path, value):
    path.write_bytes(ex.canonical(value))


@pytest.fixture
def bundle(tmp_path):
    times = [i / 10 for i in range(100)]
    gt = {'fps': 10, 'times': {str(i): t for i, t in enumerate(times[:6])},
          'frames': {str(i): [{'label': 'T', 'box': [0, 0, 10, 20]},
                                 {'label': 'N', 'box': [20, 0, 30, 20]}] for i in range(6)}}
    truth = tmp_path / 'gt.json'
    write(truth, gt)
    metadata = {
        'input': {'videoStreamSha256': 'a'*64, 'sampleTimesSha256': ex.digest(times),
                  'sampledFrames': 100, 'durationSec': 10, 'width': 40, 'height': 30,
                  'fps': 10, 'pixFmt': 'yuv420p', 'colorTransfer': 'bt709'},
        'target': {'jerseyNumber': 7},
        'engine': {'sourceSha256': 'b'*64, 'lockSha256': 'c'*64, 'imageDigest': 'sha256:'+'d'*64,
                   'version': 'synthetic', 'models': {'detector': 'e'*64}},
        'settings': {'stage1': {'stride': 1}, 'resolve': {'mode': 'balanced'}, 'decoder': {'color': 'bt709'}},
        'groundTruth': {'sha256': ex.file_digest(truth), 'timeBasis': 'unshifted', 'width': 40, 'height': 30},
        'artifacts': {'discoverySha256': ex.digest([]), 'feedbackSha256': ex.digest({}),
                      'auxiliaryCacheSha256': ex.digest({})},
        'resources': {'cpu': 8, 'memoryGiB': 32, 'effectiveProviders': ['CPUExecutionProvider'], 'threads': {'intra': 1}}}

    def make(name, split=False, schedule='sequential', changes=(), wrong=False, absent=False):
        root = tmp_path / name
        root.mkdir()
        plan = ([{'index': 0, 'startSec': 0, 'endSec': 2}, {'index': 1, 'startSec': 2, 'endSec': 10}]
                if split else [{'index': 0, 'startSec': 0, 'endSec': 10}])
        context = {'metadata': copy.deepcopy(metadata), 'segmentPlan': plan, 'schedule': schedule,
                   'checkpointSourceSha256': 'f'*64}
        runs = []
        for s in plan:
            run = root / str(s['index'])
            run.mkdir()
            np.savez(run / 'detections.npz', times=np.array([t for t in times if s['startSec'] <= t < s['endSec']]))
            write(run / 'meta.json', {})
            write(run / 'checkpoint.json', {'videoSha256': 'f'*64, 'startSec': s['startSec'], 'endSec': s['endSec'],
                  'settings': metadata['settings']['stage1'], 'settingsFingerprint': ex.digest(metadata['settings']['stage1']),
                  'files': {n: {'size': (run/n).stat().st_size, 'sha256': ex.file_digest(run/n)} for n in ('detections.npz', 'meta.json')}})
            runs.append(str(run))
        states = np.array(['CONFIRMED_VISIBLE']*100, dtype='<U32')
        states[list(changes)] = 'AMBIGUOUS'
        boxes = np.tile([0., 0., 10., 20.], (100, 1))
        present = np.ones(100, bool)
        if wrong:
            boxes[0] = [20, 0, 30, 20]
        if absent:
            states[-1], present[-1], boxes[-1] = 'UNKNOWN', False, np.nan
        timeline = root / 'timeline.npz'
        np.savez(timeline, times=times, states=states, boxes=boxes, present=present)
        record = ex.export_resolve(timeline, {'invariants': {'ok': True}}, runs, root/'exports', context)
        return record, context, runs, timeline

    return make, truth


def compare(bundle):
    make, truth = bundle
    paths = [make('a')[0], make('b', True)[0], make('c', True, 'orchestrated')[0]]
    return paths, truth


def test_full_timeline_absence_precision_and_unique_attempts(bundle):
    make, _ = bundle
    path, context, runs, timeline = make('absent', absent=True)
    claims = json.loads((path.parent/'full_claims.json').read_text())['frames']
    assert len(claims) == 100 and claims[-1] == [9.9, 'UNKNOWN', None, False]
    assert claims[3][0] == 0.3
    again = ex.export_resolve(timeline, {'invariants': {'ok': True}}, runs, path.parent.parent, context)
    assert again != path and path.is_file()
    assert not list(path.parent.parent.glob('.tmp-*'))
    assert set(json.loads(path.read_text())) >= {'segmentPlanSha256', 'contextSha256', 'claimsFile'}


def test_mixed_plan_and_scheduling_pass(bundle):
    paths, truth = compare(bundle)
    result, code = cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))
    assert code == 0 and all(v['result'] == 'PASSED' for v in result['comparisons'].values())


def test_wrong_identity_is_recomputed(bundle):
    make, truth = bundle
    paths = [make('a')[0], make('b', True, wrong=True)[0], make('c', True, 'orchestrated')[0]]
    result, code = cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))
    assert code == 3
    assert result['comparisons']['A_to_B']['candidateAccuracy']['wrongIdentitySec'] == 0.1


def test_cumulative_drift_cannot_pass(bundle):
    make, truth = bundle
    paths = [make('a')[0], make('b', True, changes=(20, 21))[0],
             make('c', True, 'orchestrated', changes=(20, 21, 22, 23))[0]]
    r, code = cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))
    assert code == 3
    assert r['comparisons']['A_to_B']['result'] == 'PASSED'
    assert r['comparisons']['B_to_C']['result'] == 'PASSED'
    assert r['comparisons']['A_to_C']['result'] == 'FAILED'


@pytest.mark.parametrize('section,key,value', [
    ('engine', 'version', 'different'), ('settings', 'decoder', {'color': 'hdr'}),
    ('resources', 'cpu', 4), ('artifacts', 'discoverySha256', '1'*64),
    ('input', 'extraSetting', True)])
def test_unexpected_metadata_drift(bundle, section, key, value):
    paths, truth = compare(bundle)
    r = json.loads(paths[1].read_text())
    r['metadata'][section][key] = value
    write(paths[1], r)
    result, code = cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))
    assert code == 5 and result['comparisons']['A_to_B']['notComparable']


@pytest.mark.parametrize('mutation', ['hash', 'count', 'plan', 'traversal', 'legacy', 'drop', 'duplicate', 'nan'])
def test_corrupt_bundles_rejected(bundle, mutation):
    make, _ = bundle
    path, _, _, _ = make('bad')
    r = json.loads(path.read_text())
    claims = path.parent/'full_claims.json'
    if mutation == 'hash':
        r['claimsFile']['sha256'] = '0'*64
    elif mutation == 'count':
        r['claimsFile']['frames'] -= 1
    elif mutation == 'plan':
        r['segmentPlanSha256'] = '0'*64
    elif mutation == 'traversal':
        r['claimsFile']['file'] = '../full_claims.json'
    elif mutation == 'legacy':
        r['schema'] = 'legacy'
    else:
        data = json.loads(claims.read_text())
        if mutation == 'drop':
            data['frames'].pop()
        elif mutation == 'duplicate':
            data['frames'][1][0] = data['frames'][0][0]
        else:
            data['frames'][0][0] = float('nan')
        claims.write_text(json.dumps(data))
        r['claimsFile'].update(sha256=ex.file_digest(claims), frames=len(data['frames']))
    write(path, r)
    with pytest.raises(ValueError):
        cmp.load_bundle(path)


def test_checkpoint_corruption_and_invalid_report_leave_no_export(bundle, tmp_path):
    make, _ = bundle
    _, ctx, runs, timeline = make('bad')
    output = tmp_path/'never'
    with pytest.raises(ValueError, match='invariants'):
        ex.export_resolve(timeline, {'invariants': {'ok': False}}, runs, output, ctx)
    Path(runs[0], 'meta.json').write_text('tampered')
    with pytest.raises(ValueError, match='checkpoint payload'):
        ex.export_resolve(timeline, {'invariants': {'ok': True}}, runs, output, ctx)
    assert not output.exists()


def test_disabled_and_context_binding(bundle, monkeypatch, tmp_path):
    monkeypatch.delenv('SCOUTX_B26_EXPORT_ENABLED', raising=False)
    assert ex.configured_context('job', {}, {}) is None
    make, _ = bundle
    _, ctx, runs, _ = make('ctx')
    contexts = tmp_path/'contexts'
    contexts.mkdir()
    write(contexts/'job.json', ctx)
    monkeypatch.setenv('SCOUTX_B26_EXPORT_ENABLED', 'true')
    monkeypatch.setenv('SCOUTX_B26_EXPORT_ROOT', str(tmp_path/'private'))
    monkeypatch.setenv('SCOUTX_B26_CONTEXT_ROOT', str(contexts))
    assert ex.configured_context('job', ctx['metadata']['target'], {})[1] == ctx
    with pytest.raises(ValueError, match='request'):
        ex.configured_context('job', {'jerseyNumber': 99}, {})
    ex.verify_pre_resolve(ctx, Path(runs[0]).parent, [])
    with pytest.raises(ValueError, match='discovery'):
        ex.verify_pre_resolve(ctx, Path(runs[0]).parent, [{'number': 7}])
    write(Path(runs[0])/'ocr_cache.json', {})
    with pytest.raises(ValueError, match='cache'):
        ex.verify_pre_resolve(ctx, Path(runs[0]).parent, [])


def test_reference_and_labels_frozen(bundle):
    paths, truth = compare(bundle)
    with pytest.raises(ValueError, match='frozen reference'):
        cmp.compare_all(paths, truth, GATE, '0'*64)
    truth.write_text('{}')
    with pytest.raises(ValueError):
        cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))


def test_cli_missing_and_pass(bundle, tmp_path):
    paths, truth = compare(bundle)
    args = ['--a', str(paths[0]), '--b', str(paths[1]), '--c', str(paths[2]),
            '--ground-truth', str(truth), '--reference-sha256', ex.file_digest(paths[0]), '--out', str(tmp_path/'result.json')]
    assert cmp.main(args) == 0
    paths[2].unlink()
    assert cmp.main(args) == 7


def test_http_export_survives_temp_cleanup_without_response_changes(bundle, tmp_path, monkeypatch):
    import shutil
    from fastapi.testclient import TestClient
    from app import tracking_v3 as api
    from app.main import app

    make, _ = bundle
    _, ctx, runs, timeline = make('http')
    request = api.ResolveRequest.model_validate({
        'contractVersion': 3, 'jobId': 'evaluation',
        'privacy': {'retainNonTargetIdentities': False, 'faceRecognition': False, 'persistMedia': False},
        'target': {'jerseyNumber': '7', 'kitPrimaryColor': 'orange'}, 'feedback': {}})
    ctx['metadata']['target'] = request.target.model_dump()
    ctx['metadata']['artifacts']['feedbackSha256'] = ex.digest(request.feedback.model_dump())
    artifacts = tmp_path/'artifacts'
    destination = artifacts/'evaluation/stage1/c_00000'
    shutil.copytree(runs[0], destination)
    contexts = tmp_path/'contexts'
    contexts.mkdir()
    write(contexts/'evaluation.json', ctx)
    exports = tmp_path/'exports'
    for key, val in {'TRACKING_V3_ENABLED': 'true', 'TRACKING_ARTIFACT_ROOT': str(artifacts),
                     'SCOUTX_B26_EXPORT_ENABLED': 'true', 'SCOUTX_B26_CONTEXT_ROOT': str(contexts),
                     'SCOUTX_B26_EXPORT_ROOT': str(exports)}.items():
        monkeypatch.setenv(key, val)
    seen = []

    def fake(runs, out, *args, **kwargs):
        seen.append(Path(out))
        shutil.copyfile(timeline, Path(out)/'timeline.npz')
        return {'invariants': {'ok': True}, 'identity': {}}

    monkeypatch.setattr(api, '_analyze', fake)
    with TestClient(app) as client:
        response = client.post('/v3/tracking:resolve', json=request.model_dump())
        assert response.status_code == 200, response.text
        assert set(response.json()) == {'workerVersion', 'models', 'report', 'timeline'}
        assert len(response.json()['timeline']['times']) < 100
        record = next(exports.rglob('record.json'))
        assert len(cmp.load_bundle(record)['claims']) == 100
        assert not seen[0].exists()
        # Bad context refuses before the engine and does not disclose paths.
        ctx['metadata']['target'] = {'jerseyNumber': '99'}
        write(contexts/'evaluation.json', ctx)
        denied = client.post('/v3/tracking:resolve', json=request.model_dump())
        assert denied.status_code == 503 and len(seen) == 1
        assert denied.json()['detail'] == 'evaluation_export_not_configured'
        injected = {**request.model_dump(), 'exportRoot': str(exports)}
        assert client.post('/v3/tracking:resolve', json=injected).status_code == 422


@pytest.mark.parametrize('plan', [[], [{'index': 0, 'startSec': 1, 'endSec': 10}],
    [{'index': 0, 'startSec': 0, 'endSec': 9}], [{'index': 0, 'startSec': 0, 'endSec': 901}]])
def test_invalid_plans(plan):
    with pytest.raises(ValueError):
        ex.validate_plan(plan, 10)


def test_atomic_write_failure_removes_only_attempt(bundle, monkeypatch):
    make, _ = bundle
    path, ctx, runs, timeline = make('atomic')
    original = Path.write_bytes

    def fail_record(self, data):
        if self.name == 'record.json':
            raise OSError('injected disk failure')
        return original(self, data)

    monkeypatch.setattr(Path, 'write_bytes', fail_record)
    with pytest.raises(OSError):
        ex.export_resolve(timeline, {'invariants': {'ok': True}}, runs, path.parent.parent, ctx)
    assert path.exists() and not list(path.parent.parent.glob('.tmp-*'))


def test_unexpected_schedule_and_plan_rejected(bundle):
    paths, truth = compare(bundle)
    record = json.loads(paths[1].read_text())
    record['schedule'] = 'orchestrated'
    write(paths[1], record)
    assert cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))[1] == 5
    record['schedule'] = 'sequential'
    record['segmentPlan'] = [{'index': 0, 'startSec': 0, 'endSec': 10}]
    record['segmentPlanSha256'] = ex.digest(record['segmentPlan'])
    write(paths[1], record)
    assert cmp.compare_all(paths, truth, GATE, ex.file_digest(paths[0]))[1] == 5


def test_cli_fail_invalid_and_no_evidence_overwrite(bundle, tmp_path):
    make, truth = bundle
    paths = [make('a')[0], make('b', True, wrong=True)[0], make('c', True, 'orchestrated')[0]]
    args = ['--a', str(paths[0]), '--b', str(paths[1]), '--c', str(paths[2]),
            '--ground-truth', str(truth), '--reference-sha256', ex.file_digest(paths[0]), '--out', str(tmp_path/'comparison.json')]
    assert cmp.main(args) == 3
    original = paths[0].read_bytes()
    assert cmp.main(args[:-1]+[str(paths[0])]) == 5
    assert paths[0].read_bytes() == original
    record = json.loads(paths[1].read_text())
    record['schedule'] = 'invalid'
    write(paths[1], record)
    assert cmp.main(args) == 5


@pytest.mark.parametrize('kind', ['shift', 'drop', 'shape', 'absent_claim'])
def test_timeline_drift_rejected_before_export(bundle, tmp_path, kind):
    make, _ = bundle
    _, ctx, runs, timeline = make('drift')
    with np.load(timeline) as data:
        arrays = {key: data[key].copy() for key in data.files}
    if kind == 'shift':
        arrays['times'][1] += 0.001
    elif kind == 'drop':
        arrays = {k: v[:-1] for k, v in arrays.items()}
    elif kind == 'shape':
        arrays['boxes'] = arrays['boxes'][:, :3]
    else:
        arrays['present'][0] = False
    np.savez(timeline, **arrays)
    with pytest.raises(ValueError):
        ex.export_resolve(timeline, {'invariants': {'ok': True}}, runs, tmp_path/'no-export', ctx)
    assert not (tmp_path/'no-export').exists()
