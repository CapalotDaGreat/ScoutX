from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
import fp32_comparison as probe


def test_profiles_change_one_detector_factor_at_a_time():
    half, full = probe.PROFILES['gpu-fp16-b8'], probe.PROFILES['gpu-fp32-b8']
    assert {k for k in half if half[k] != full[k]} == {'half'}
    one = probe.PROFILES['gpu-fp32-b1']
    assert {k for k in full if full[k] != one[k]} == {'batch'}
    assert full == probe.PROFILES['gpu-fp32-b8-repeat']


def test_profile_environment_does_not_inherit_experimental_output_knobs():
    old = {'PATH': 'tools', 'SCOUTX_WEIGHTS_DIR': 'weights', 'SCOUTX_OCR_ENHANCE': '1',
           'SCOUTX_KEYFRAME_EVERY': '7', 'SCOUTX_HWACCEL': 'cuda', 'SCOUTX_NIGHT_OCR': '1'}
    env = probe.profile_env('cpu-onnx', old)
    assert env['PATH'] == 'tools' and env['SCOUTX_WEIGHTS_DIR'] == 'weights'
    assert env['SCOUTX_OCR_ENHANCE'] == '0' and env['SCOUTX_KEYFRAME_EVERY'] == '1'
    assert env['CUDA_VISIBLE_DEVICES'] == ''
    assert env['SCOUTX_ORT_PROVIDERS'] == 'CPUExecutionProvider'
    assert 'SCOUTX_HWACCEL' not in env and 'SCOUTX_NIGHT_OCR' not in env
    assert old['SCOUTX_KEYFRAME_EVERY'] == '7'


def test_plan_does_not_import_cuda_or_start_inference(tmp_path, monkeypatch):
    def forbidden(*a, **kw):
        pytest.fail('plan attempted a subprocess')
    monkeypatch.setattr(probe.subprocess, 'run', forbidden)
    assert probe.main(['--out-dir', str(tmp_path / 'plan')]) == 0
    assert (tmp_path / 'plan/plan.json').is_file()
    assert not (tmp_path / 'plan/session.json').exists()


def test_corpus_sampling_is_bounded_stable_and_keeps_diagnostic_frames():
    paths = [Path(f'3144/stage1/chunk/crops/{i:06d}_2.jpg') for i in range(300)]
    paths += [Path('1073/stage1/chunk/crops/000234_8.jpg')]
    chosen = probe.select_corpus(paths, 20)
    assert len(chosen) == 20 and chosen == probe.select_corpus(reversed(paths), 20)
    assert paths[226] in chosen and paths[-1] in chosen
    assert len(probe.select_corpus(paths[:5], 20)) == 5
    assert paths[77] in probe.select_corpus(paths, 20, preferred=[paths[77]])


def test_detector_comparison_counts_missing_boxes_without_reusing_matches():
    a = np.array([[0, 0., 0, 0, 10, 20, .9], [0, 0., 1, 0, 11, 20, .8]], float)
    b = a[:1].copy()
    result = probe.detection_agreement(a, b)
    assert result['matched'] == 1
    assert result['meanMatchedIoU'] == 1
    assert result['framesWithUnmatchedDetections'] == [
        {'frame': 0, 'unmatchedReference': 1, 'unmatchedCandidate': 0}]


def test_matrix_budget_leaves_setup_and_cleanup_time(tmp_path):
    with pytest.raises(SystemExit):
        probe.main(['--out-dir', str(tmp_path / 'bad'), '--budget-sec', '10800'])
    assert not (tmp_path / 'bad').exists()


def test_execute_refuses_an_image_from_a_different_commit_before_cuda(tmp_path, monkeypatch):
    monkeypatch.setenv('SCOUTX_GIT_COMMIT', 'a' * 40)
    with pytest.raises(ValueError, match='image build commit'):
        probe.main(['--execute', '--video', 'unused.mp4', '--expected-commit', 'b' * 40,
                    '--out-dir', str(tmp_path / 'mismatch')])
    assert not (tmp_path / 'mismatch/session.json').exists()


def test_execute_requires_a_bound_commit_before_creating_output(tmp_path):
    with pytest.raises(SystemExit):
        probe.main(['--execute', '--video', 'unused.mp4', '--out-dir', str(tmp_path / 'missing')])
    assert not (tmp_path / 'missing').exists()


def test_matrix_comparison_exposes_decode_mismatch_and_lost_cpu_number(tmp_path, monkeypatch):
    import audit_claim_outcomes
    monkeypatch.setattr(audit_claim_outcomes, 'audit', lambda *a: {'allLabelledFrames': {'correctClaim': 1}})
    monkeypatch.setattr(probe, 'fixture_truth', lambda key: ({},
                        {'times': {'0': 1880.0}, 'frames': {}}))
    metrics = dict(targetLabelledSec=.1, claimedCorrectSec=.1, confirmedCorrectSec=.1,
                   wrongIdentitySec=0., confirmedWrongIdentitySec=0., overlapAmbiguousSec=0.,
                   claimedRecall=1., IDF1=1.)
    for profile in probe.PROFILES:
        root = tmp_path / profile
        (root / '3144/automatic').mkdir(parents=True)
        (root / '3144/stage1/chunk').mkdir(parents=True)
        probe.write(root / 'precision_diagnostics.json', {
            'decodedPixels': {'18800': 'different' if profile == 'gpu-fp32-b1' else 'same'},
            'corpusReads': [{'path': 'fixed.jpg', 'pixelSha256': 'crop', 'result': [None, 0., None]}]})
        probe.write(root / 'validation.json', {'codeSha256': {}, 'sourceSha256': 'same', 'models': {},
            'results': [{'window': '3144', 'conditions': [{'mode': 'automatic', 'metrics': metrics}]}]})
        np.savez(root / '3144/automatic/timeline.npz', times=[0.], present=[True],
                 states=['CONFIRMED_VISIBLE'], boxes=[[0, 0, 10, 20]])
        np.savez(root / '3144/stage1/chunk/detections.npz', dets=[[0., 0., 0., 0., 10., 20., .9]])
    probe.write(tmp_path / 'cpu-onnx/corpus_diagnostics.json', {
        'corpusReads': [{'path': 'fixed.jpg', 'pixelSha256': 'crop', 'result': ['20', .99, 'shirt']}]})
    result = probe.compare_profiles(tmp_path, ['3144'])
    assert not result['controlledDecodeValid']
    assert len(result['fixedCorpusOcr']['gpu-fp32-b8']['cpuAcceptedReadLosses']) == 1
    assert result['pairs'][0]['windows'][0]['conditions'][0]['accuracyGate']['passed']
    assert not result['productionApproval']


def test_gap_window_uses_existing_authoritative_label_times_without_new_annotations():
    import json
    meta, truth = probe.fixture_truth('gap1150')
    source = probe.ROOT / meta['provenance']['file']
    assert probe.digest(source) == meta['provenance']['sha256']
    gt = json.loads(source.read_text())
    expected = [[round((gt['times'][k] - 1150) * 10), x['box'], x['label']]
                for k, boxes in gt['frames'].items() if 1150 <= gt['times'][k] < 1180 for x in boxes]
    assert meta['groundTruth'] == expected
    assert sum(any(x['label'] == 'T' for x in labels) for labels in truth['frames'].values()) == 287
