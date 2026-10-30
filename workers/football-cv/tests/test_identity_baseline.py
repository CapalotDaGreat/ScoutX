"""Archived-evidence baseline must distinguish automatic and owner-assisted identity."""
import json
from pathlib import Path
import sys

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
import replay_identity_baseline as baseline


def test_real_crossing_replay_exposes_missing_identity_evidence_without_false_claims():
    automatic = baseline.replay('img4809_1073_slice', use_recorded_anchors=False)
    assisted = baseline.replay('img4809_1073_slice', use_recorded_anchors=True)
    assert automatic['metrics']['claimedRecall'] == 0
    assert automatic['readDiagnostics']['retainedTargetNumberReads'] == 0
    assert automatic['stageDiagnostics']['assembledTrackHitFrames'] == 31
    assert assisted['metrics']['claimedRecall'] > 0.75
    assert assisted['metrics']['wrongIdentitySec'] == 0
    assert assisted['readDiagnostics']['recordedAnchorsUsed'] == 1
    assert automatic['inputHashes'] == assisted['inputHashes']


def test_baseline_manifest_binds_code_runtime_and_scope(tmp_path):
    output = tmp_path / 'baseline.json'
    assert baseline.main(['--out', str(output)]) == 0
    value = json.loads(output.read_text())
    assert value['runtime']['engineVersion'] == '5.2.0'
    assert value['codeSha256']['scoutx_tracker/identity.py'] == baseline.digest(baseline.ROOT / 'scoutx_tracker/identity.py')
    assert value['detectorAndOcrRerun'] is value['fullRecordingValidated'] is value['productionApproval'] is False
    assert len(value['results']) == 3
    original = output.read_bytes()
    with pytest.raises(SystemExit):
        baseline.main(['--out', str(output)])
    assert output.read_bytes() == original
