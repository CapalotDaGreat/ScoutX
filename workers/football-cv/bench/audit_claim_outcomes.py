"""Offline audit: unmatched claims remain explicit, never counted as correct or abstained."""
from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'bench'))

import numpy as np
import pp_bench
from scoutx_tracker.envinfo import sha256_file
from validate_identity_windows import WINDOWS, fixture_truth


def classify_claim(claim, labels):
    if claim is None or claim[0] not in pp_bench.CLAIM:
        return 'abstained'
    _, box = claim
    best = max(labels, key=lambda label: pp_bench.iou(box, label['box']), default=None)
    if best is None or pp_bench.iou(box, best['box']) < 0.5:
        return 'unmatchedClaim'
    if best['label'] == 'T':
        return 'correctClaim'
    if best['label'] == 'N':
        if any(label['label'] == 'T' and pp_bench.iou(box, label['box']) >= pp_bench.OVERLAP_IOU for label in labels):
            return 'overlapAmbiguousClaim'
        return 'wrongPlayerClaim'
    return 'indeterminateLabelClaim'


def audit(timeline: Path, truth: dict, size=(1920, 1080)) -> dict:
    all_labels, target_visible = Counter(), Counter()
    with np.load(timeline, allow_pickle=False) as z:
        times = z['times']
        for key, labels in truth['frames'].items():
            i = int(np.argmin(np.abs(times - truth['times'][key])))
            if abs(times[i] - truth['times'][key]) > 0.051:
                raise ValueError('label has no matching prediction sample')
            box = z['boxes'][i] * np.array([1920 / size[0], 1080 / size[1]] * 2)
            claim = (str(z['states'][i]), box) if z['present'][i] else None
            outcome = classify_claim(claim, labels)
            all_labels[outcome] += 1
            if any(label['label'] == 'T' for label in labels):
                target_visible[outcome] += 1
    return {'allLabelledFrames': dict(all_labels), 'targetVisibleLabelledFrames': dict(target_visible),
            'frameDurationSec': 1 / truth['fps'], 'timelineSha256': sha256_file(timeline),
            'unmatchedMeaning': 'Claim does not match any annotated box at IoU >= 0.5; requires review, not proof of safety'}


def promotion_blockers(rows: list[dict]) -> list[str]:
    blockers = []
    if any(not row['absoluteSafetyGate']['passed'] for row in rows):
        blockers.append('One or more evaluated conditions fail the absolute safety gate')
    if any(row['outcomes']['allLabelledFrames'].get('unmatchedClaim', 0) for row in rows):
        blockers.append('Unmatched claims require review')
    blockers.append('No independent/full-match/GPU validation of this crop candidate')
    return blockers


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--lossless-3144', type=Path, required=True)
    parser.add_argument('--lossless-1073', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args(argv)
    if args.out.exists():
        parser.error('new output file required')
    baseline = json.loads((args.baseline / 'validation.json').read_text())
    if baseline['status'] != 'complete':
        raise ValueError('completed baseline required')
    rows = []
    gate = pp_bench.load_gate(ROOT / 'bench' / 'gates' / 'balanced_5.2.json')
    for item in baseline['results']:
        key = item['window']
        _, truth = fixture_truth(key)
        truth['times'] = {k: t - WINDOWS[key][0] for k, t in truth['times'].items()}
        candidate_dir = getattr(args, 'lossless_' + key)
        candidate = json.loads((candidate_dir / 'comparison.json').read_text())
        if candidate['baselineFileSha256'] != sha256_file(args.baseline / 'validation.json'):
            raise ValueError('candidate uses a different baseline')
        for codec, directory, conditions in [('jpeg', args.baseline / key, item['conditions']),
                                               ('png-experiment', candidate_dir, candidate['candidateConditions'])]:
            for condition in conditions:
                rows.append({'window': key, 'codec': codec, 'mode': condition['mode'],
                             'sourceOffsetSec': WINDOWS[key][0], 'metrics': condition['metrics'],
                             'outcomes': audit(directory / condition['mode'] / 'timeline.npz', truth),
                             'absoluteSafetyGate': pp_bench.evaluate_gate(condition['metrics'], gate)})
    result = {'schema': 'pitchproof.claim-outcome-audit.v1', 'sourceSha256': baseline['sourceSha256'],
              'baselineManifestSha256': sha256_file(args.baseline / 'validation.json'),
              'auditCodeSha256': sha256_file(Path(__file__)), 'rows': rows,
              'scope': 'Previously examined labelled regressions; unmatched claims explicitly separated',
              'productionSelected': False, 'fullRecordingValidated': False,
              'promotionBlockers': promotion_blockers(rows)}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(result, stream, indent=2, allow_nan=False)
    print(json.dumps([{k: row[k] for k in ('window', 'codec', 'mode', 'outcomes')} for row in rows]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
