"""Fresh evaluation must not score labels outside decoded footage or invent confidence."""
from pathlib import Path
import sys

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
import validate_identity_windows as evaluation


def test_scoring_separates_correct_wrong_and_abstention(tmp_path):
    timeline = tmp_path / 'timeline.npz'
    np.savez(timeline, times=np.array([10., 10.1, 10.2]), present=np.array([True, True, False]),
             states=np.array(['CONFIRMED_VISIBLE', 'LIKELY_VISIBLE', 'UNKNOWN']),
             boxes=np.array([[0, 0, 10, 20], [50, 0, 60, 20], [0, 0, 0, 0]]))
    truth = {'fps': 10., 'frames': {str(i): [{'label': 'T', 'box': [0, 0, 10, 20]},
                                           {'label': 'N', 'box': [50, 0, 60, 20]}] for i in range(3)},
             'times': {str(i): 10. + i / 10 for i in range(3)}}
    result = evaluation.score_timeline(timeline, truth, (1920, 1080))
    assert result['claimedCorrectSec'] == 0.1
    assert result['wrongIdentitySec'] == 0.1
    assert result['confirmedWrongIdentitySec'] == 0
    assert result['abstainedVisibleFrames'] == 1
    assert result['claimedRecall'] == result['confirmedRecall'] == 0.333
    truth['times']['2'] = 11.
    with pytest.raises(ValueError, match='no decoded sample'):
        evaluation.score_timeline(timeline, truth, (1920, 1080))


def test_wrong_source_is_refused_before_models_or_output(tmp_path, monkeypatch):
    source, output = tmp_path / 'video.mp4', tmp_path / 'out'
    source.write_bytes(b'not the reference recording')
    def unexpected_models():
        pytest.fail('wrong source must fail before model verification or inference')
    monkeypatch.setattr(evaluation, 'verify_models', unexpected_models)
    with pytest.raises(ValueError, match='source differs'):
        evaluation.main(['--video', str(source), '--out-dir', str(output)])
    assert not output.exists()


def test_fixture_labels_keep_absolute_times_and_owner_anchor_separate():
    meta, truth = evaluation.fixture_truth('1073')
    assert meta['anchors']
    assert min(truth['times'].values()) >= 1050
    assert max(truth['times'].values()) < 1085
    assert sum(any(label['label'] == 'T' for label in labels) for labels in truth['frames'].values()) == 31


def test_window_reports_use_local_times_without_changing_source_decode_offsets():
    from types import SimpleNamespace
    warp = np.arange(14).reshape(2, 7)
    source = [('video.mp4', 0, 2, 1050.)]
    data = SimpleNamespace(times=np.array([1050., 1050.1]), dets=np.array([[0, 1050., 1, 2, 3, 4, .9]]),
                           balls=np.empty((0, 7)), sources=source, warps=warp)
    truth = {'times': {'0': 1050.1}, 'frames': {}}
    result, anchors, sightings = evaluation.window_local_time(data, truth, [(1050.1, 12, 13)],
                                                              [{'t': 1050.1, 'frames': 2}], 1050.)
    np.testing.assert_allclose(data.times, [0., .1])
    assert data.dets[0, 1] == 0
    assert result['times']['0'] == pytest.approx(.1)
    assert anchors[0][0] == sightings[0]['t'] == pytest.approx(.1)
    assert data.sources == source and data.warps is warp
    assert truth['times']['0'] == 1050.1
