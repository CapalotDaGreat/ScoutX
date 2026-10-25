from io import BytesIO
import json
from pathlib import Path

import numpy as np
from PIL import Image
import pytest

from app.match_identity import MatchTarget
from app.pipeline import Box
from eval import local_review as review
from eval.full_match_validation import digest, publish
from app.source_pts import source_sha256


class FixtureSource:
    def frames(self, *args):
        for t in (0., 1.):
            rgb = np.full((64, 96, 3), (100, 150, 80), dtype=np.uint8)
            rgb[10:50, 10:40] = (210, 40, 40)
            yield t, rgb


def generated_pack(directory: Path, *, overlays=False):
    source = directory/'source.mov'
    source.write_bytes(b'generated synthetic review fixture, not match footage')
    sha = source_sha256(source)
    original = review.LocalFile
    review.LocalFile = lambda _: FixtureSource()
    try:
        class Detector:
            def people(self, frame):
                return [Box(10., 10., 40., 50., .9)]
        class Tracker:
            def update(self, boxes):
                return [('t1', b) for b in boxes]
        files = review.prepare(source, sha, MatchTarget(jerseyNumber='20', kitPrimaryColor='red'), 0., 2., 1.,
                               detector=Detector() if overlays else None,
                               tracker_factory=Tracker if overlays else None)
    finally:
        review.LocalFile = original
    output = directory/'pack'
    publish(output, files)
    pack = review.ReviewPack.model_validate_json(files['manifest.json'])
    labels = json.loads(files['labels.template.json'])
    labels.update(reviewed=True, reviewerId='synthetic_reviewer')
    notes = {'schemaVersion': 1, 'sourceSha256': sha, 'packSha256': digest(pack.model_dump(mode='json')),
             'reviewerId': labels['reviewerId'], 'overlaysShown': False,
             'frames': [{'timeSec': f.timeSec, 'reviewed': True, 'numberLegible': 'unknown', 'tags': []}
                        for f in pack.frames]}
    return source, sha, output, pack, labels, notes


@pytest.fixture
def fixture(tmp_path, monkeypatch):
    result = generated_pack(tmp_path)
    monkeypatch.setattr(review, 'LocalFile', lambda _: FixtureSource())
    return result


def test_default_pack_is_model_free_static_and_unreviewed(fixture):
    _, _, output, pack, _, _ = fixture
    assert pack.overlaysAvailable is False
    assert not any(f.detections or f.tracks for f in pack.frames)
    assert json.loads((output/'labels.template.json').read_text())['reviewed'] is False
    assert set(p.name for p in output.iterdir()) == {'index.html', 'manifest.json', 'labels.template.json',
                                                    'frame-00000.png', 'frame-00001.png'}
    assert Image.open(BytesIO((output/'frame-00000.png').read_bytes())).size == (96, 64)
    html = (output/'index.html').read_text()
    assert '__REVIEW_DATA__' not in html
    assert "connect-src 'none'" in html
    assert '<script src=' not in html and 'fetch(' not in html


def test_optional_overlays_use_only_anonymous_boxes_not_crops(tmp_path):
    _, _, output, pack, _, _ = generated_pack(tmp_path, overlays=True)
    assert pack.overlaysAvailable is True
    assert pack.frames[0].tracks[0].trackId == 's0:t1'
    assert pack.frames[0].detections[0].trackId == 'd0'
    assert not any('crop' in p.name for p in output.iterdir())


def test_valid_labels_redecode_exact_samples_and_do_not_grant_approval(fixture):
    source, sha, output, _, labels, notes = fixture
    result = review.validate(source, sha, output, labels, notes=notes, require_blinded=True)
    assert result['reviewedFrames'] == 2
    assert result['blindedReviewAttested'] is True
    assert result['productionApproval'] is False


@pytest.mark.parametrize('change', ['wrong_source', 'missing_time', 'changed_time', 'outside_box', 'unreviewed', 'wrong_target'])
def test_invalid_labels_fail_closed(fixture, change):
    source, sha, output, _, labels, _ = fixture
    if change == 'wrong_source': labels['sourceSha256'] = 'b'*64
    elif change == 'missing_time': labels['frames'].pop()
    elif change == 'changed_time': labels['frames'][0]['timeSec'] = .01
    elif change == 'outside_box': labels['frames'][0].update(state='visible', box=[0., 0., 97., 20.])
    elif change == 'unreviewed': labels['reviewed'] = False
    else: labels['target']['jerseyNumber'] = '8'
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels)


def test_changed_preview_cannot_validate_labels(fixture):
    source, sha, output, _, labels, _ = fixture
    (output/'frame-00000.png').write_bytes(b'changed fixture preview')
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels)


def test_changed_decoded_rgb_is_not_a_matching_source_frame(fixture, monkeypatch):
    source, sha, output, _, labels, _ = fixture
    class Changed:
        def frames(self, *args):
            for t, rgb in FixtureSource().frames():
                yield t, np.zeros_like(rgb)
    monkeypatch.setattr(review, 'LocalFile', lambda _: Changed())
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels)


def test_overlay_exposure_cannot_pass_blinded_holdout_validation(fixture):
    source, sha, output, _, labels, notes = fixture
    notes['overlaysShown'] = True
    with pytest.raises(ValueError, match='unexposed'):
        review.validate(source, sha, output, labels, notes=notes, require_blinded=True)
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels, require_blinded=True)


@pytest.mark.parametrize('change', ['reviewer', 'missing_review', 'wrong_pack', 'bad_tag'])
def test_review_notes_are_bound_to_source_pack_and_reviewer(fixture, change):
    source, sha, output, _, labels, notes = fixture
    if change == 'reviewer': notes['reviewerId'] = 'someone_else'
    elif change == 'missing_review': notes['frames'][0]['reviewed'] = False
    elif change == 'wrong_pack': notes['packSha256'] = 'c'*64
    else: notes['frames'][0]['tags'] = ['invented']
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels, notes=notes)


def test_freeze_is_deterministic_disjoint_and_does_not_claim_negatives_exist():
    plan = review.freeze_windows('a'*64, 2034., 241., 247.)
    assert plan == review.freeze_windows('a'*64, 2034., 241., 247.)
    assert len(plan['holdout']) == 4
    for w in plan['holdout']:
        assert not (w['startSec'] < 307 and w['endSec'] > 181)
        assert w['contentReviewed'] is False
    assert plan['negativeCoverageVerified'] is False
    assert plan['productionApproval'] is False
    assert plan['holdout'] != review.freeze_windows('b'*64, 2034., 241., 247.)['holdout']


def test_impossible_freeze_fails_instead_of_substituting_seen_windows():
    with pytest.raises(ValueError):
        review.freeze_windows('a'*64, 20., 5., 10., buffer=60.)


def test_network_paths_rejected_before_access():
    for path in ('https://example.com/video.mp4', r'\\server\share\video.mp4'):
        with pytest.raises(ValueError):
            review._local_path(path)


def test_existing_output_is_preserved(fixture):
    source, _, output, _, _, _ = fixture
    original = (output/'manifest.json').read_bytes()
    assert review.main(['prepare', '--input', str(source), '--out', str(output), '--start', '0', '--end', '2',
        '--jersey-number', '20', '--kit-primary-color', 'red', '--authorize-local-evaluation']) == 1
    assert (output/'manifest.json').read_bytes() == original


def test_source_mutation_prevents_pack_publication(tmp_path, monkeypatch):
    source = tmp_path/'source.mov'
    source.write_bytes(b'original generated fixture')
    class Mutating:
        def frames(self, *args):
            for t, rgb in FixtureSource().frames():
                source.write_bytes(b'changed generated fixture')
                yield t, rgb
    monkeypatch.setattr(review, 'LocalFile', lambda _: Mutating())
    output = tmp_path/'new'
    assert review.main(['prepare', '--input', str(source), '--out', str(output), '--start', '0', '--end', '2',
        '--fps', '1', '--jersey-number', '20', '--kit-primary-color', 'red', '--authorize-local-evaluation']) == 1
    assert not output.exists()


def test_holdout_sampling_and_window_cannot_drift_after_freeze():
    target = MatchTarget(jerseyNumber='20', kitPrimaryColor='red')
    plan = review.freeze_windows('a'*64, 2034., 241., 247., fps=2.)
    plan['target'] = target.model_dump(exclude_defaults=True)
    w = plan['holdout'][0]
    review.check_holdout(plan, 'a'*64, target, w['startSec'], w['endSec'], 2.)
    for start, end, fps in [(w['startSec'], w['endSec'], 5.), (241., 247., 2.)]:
        with pytest.raises(ValueError, match='frozen holdout'):
            review.check_holdout(plan, 'a'*64, target, start, end, fps)


def test_holdout_validation_requires_original_plan_and_unexposed_notes(fixture):
    source, sha, output, pack, labels, notes = fixture
    plan = {'schemaVersion': 1, 'sourceSha256': sha, 'target': pack.target.model_dump(exclude_defaults=True),
            'holdoutFps': 1., 'holdout': [{'startSec': 0., 'endSec': 2.}]}
    pack = pack.model_copy(update={'split': 'holdout', 'splitPlanSha256': digest(plan)})
    (output/'manifest.json').write_text(json.dumps(pack.model_dump(mode='json')))
    notes['packSha256'] = digest(pack.model_dump(mode='json'))
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels, notes=notes)
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels, holdout_plan=plan)
    notes['overlaysShown'] = True
    with pytest.raises(ValueError):
        review.validate(source, sha, output, labels, notes=notes, holdout_plan=plan)
    notes['overlaysShown'] = False
    result = review.validate(source, sha, output, labels, notes=notes, holdout_plan=plan)
    assert result['split'] == 'holdout' and result['productionApproval'] is False


def test_validation_cli_produces_only_a_validation_record(fixture, tmp_path):
    source, _, output, _, labels, notes = fixture
    label_path, note_path = tmp_path/'synthetic-labels.json', tmp_path/'synthetic-notes.json'
    label_path.write_text(json.dumps(labels))
    note_path.write_text(json.dumps(notes))
    result = tmp_path/'validated'
    assert review.main(['validate', '--input', str(source), '--pack', str(output), '--labels', str(label_path),
        '--notes', str(note_path), '--require-blinded', '--out', str(result), '--authorize-local-evaluation']) == 0
    assert [p.name for p in result.iterdir()] == ['validation.json']
    assert json.loads((result/'validation.json').read_text())['productionApproval'] is False


def test_score_cli_reuses_retained_predictions_without_models(fixture, tmp_path):
    from test_review_scoring import comparison
    source, sha, output, _, labels, notes = fixture
    label_path, note_path, diagnosis = tmp_path/'labels.json', tmp_path/'notes.json', tmp_path/'diagnosis.json'
    label_path.write_text(json.dumps(labels))
    note_path.write_text(json.dumps(notes))
    diagnosis.write_text(json.dumps(comparison(sha)))
    result = tmp_path/'scored'
    assert review.main(['score', '--input', str(source), '--pack', str(output), '--labels', str(label_path),
        '--notes', str(note_path), '--diagnosis', str(diagnosis), '--out', str(result),
        '--authorize-local-evaluation']) == 0
    scores = json.loads((result/'reviewed-metrics.json').read_text())
    assert scores['metrics']['baseline']['groundTruthAvailable'] is True
    assert scores['metrics']['baseline']['trailCoverage'] is None  # synthetic review is entirely uncertain
    assert scores['productionApproval'] is False


def test_placeholder_reviewer_is_not_a_completed_review(fixture):
    source, sha, output, _, labels, _ = fixture
    labels['reviewerId'] = 'REPLACE_WITH_ACTUAL_REVIEWER'
    with pytest.raises(ValueError, match='actual reviewer'):
        review.validate(source, sha, output, labels)


if __name__ == '__main__':
    import sys
    destination = Path(sys.argv[1])
    destination.mkdir(exist_ok=False)
    generated_pack(destination, overlays=True)
