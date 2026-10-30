from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
from audit_claim_outcomes import classify_claim, promotion_blockers


def test_unmatched_claim_is_neither_correct_nor_abstention():
    labels = [{'label': 'T', 'box': [0, 0, 10, 20]}, {'label': 'N', 'box': [50, 0, 60, 20]}]
    assert classify_claim(('LIKELY_VISIBLE', [100, 0, 110, 20]), labels) == 'unmatchedClaim'
    assert classify_claim(('CONFIRMED_VISIBLE', [0, 0, 10, 20]), labels) == 'correctClaim'
    assert classify_claim(('LIKELY_VISIBLE', [50, 0, 60, 20]), labels) == 'wrongPlayerClaim'
    assert classify_claim(None, labels) == 'abstained'
    assert classify_claim(('AMBIGUOUS', [0, 0, 10, 20]), labels) == 'abstained'


def test_promotion_report_does_not_repeat_a_fixed_wrong_identity_failure():
    rows = [{'absoluteSafetyGate': {'passed': True},
             'outcomes': {'allLabelledFrames': {'correctClaim': 4, 'abstained': 79}}}]
    assert promotion_blockers(rows) == ['No independent/full-match/GPU validation of this crop candidate']


def test_promotion_report_keeps_actual_gate_failures_and_unmatched_claims():
    rows = [{'absoluteSafetyGate': {'passed': False},
             'outcomes': {'allLabelledFrames': {'unmatchedClaim': 12}}}]
    assert len(promotion_blockers(rows)) == 3
    assert 'absolute safety gate' in promotion_blockers(rows)[0]
    assert 'Unmatched' in promotion_blockers(rows)[1]
