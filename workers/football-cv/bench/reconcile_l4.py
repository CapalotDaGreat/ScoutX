"""Recompute evidence summaries from immutable downloaded Netherlands results."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import hashlib
import json
from pathlib import Path


def summarise(root: Path) -> dict:
    def read(name):
        return json.loads((root / name).read_text())

    runs = {mode: read(f'{mode}/full_match.json') for mode in ('cpu', 'gpu')}
    for mode, run in runs.items():
        claim = root / mode / run['claimsFile']['file']
        if hashlib.sha256(claim.read_bytes()).hexdigest() != run['claimsFile']['sha256']:
            raise ValueError(f'{mode} claims checksum mismatch')
        if run['status'] != 'complete' or not run['timing']['timingComplete']:
            raise ValueError(f'{mode} is not a complete measurement')
    stages = {}
    for mode, run in runs.items():
        s = run['stages']
        extraction = s['extraction']['stageSecondsTotal']
        discovery = s['discovery']['timingsSec']
        resolve = s['resolve']['timingsSec']
        stages[mode] = {
            'modelInitialization': s['modelInitialization']['wallSec'],
            'discoveryWall': s['discovery']['wallSec'],
            'extractionWall': s['extraction']['wallSecMeasured'],
            'resolveWall': s['resolve']['wallSec'],
            'decode': extraction['decode'] + discovery['decode'],
            'detect': extraction['detect'] + discovery['detect'],
            'ocr': discovery['ocr'] + resolve['numbers'],
            'tracking': resolve['tracklets'], 'identity': resolve['identity'],
            'report': resolve['timeline_metrics_events'],
            'cameraMotion': extraction['scene_cmc'],
            'colourSignature': extraction['colour_signature'],
            'embedding': extraction['embedding'], 'cropIO': extraction['crops_io'],
        }
    timelines = {m: {round(t, 1): (s, b) for t, s, b in read(f'{m}/full_match_claims.json')}
                 for m in runs}
    changes, buckets = [], Counter()
    for t in sorted(set(timelines['cpu']) | set(timelines['gpu'])):
        a, b = timelines['cpu'].get(t), timelines['gpu'].get(t)
        if a is None or b is None or a[0] != b[0]:
            changes.append({'timeSec': t, 'cpuState': a[0] if a else None,
                            'gpuState': b[0] if b else None})
            buckets[int(t // 300)] += 1
    timestamps = read('timestamps.json')
    hours = (datetime.fromisoformat(timestamps['end'].replace('Z', '+00:00')) -
             datetime.fromisoformat(timestamps['vmBooted'].replace('Z', '+00:00'))).total_seconds() / 3600
    rate = read('prices.json')['vmUsdPerHour']
    cost = {'currency': 'USD', 'estimateOnly': True, 'ratePerHour': rate,
            'sessionHours': hours, 'sessionEstimate': hours * rate,
            'excludes': ['tax', 'discounts', 'cross-region egress', 'bucket storage',
                         'any VM lifetime beyond recorded boot/end timestamps'], 'runs': {}}
    for mode, run in runs.items():
        sec = run['timing']['measuredTotalWallSec']
        duration = run['input']['durationSec']
        cost['runs'][mode] = {'measuredComputeEstimate': sec / 3600 * rate,
                             'matchDurationEstimates': {str(n): {'wallSec': sec * n * 60 / duration,
                                                               'usd': sec * n * 60 / duration / 3600 * rate}
                                                        for n in (34, 90, 140)}}
    return {'schema': 'pitchproof.l4-reconciliation.v1', 'stagesSec': stages,
            'stageNote': 'Component timers do not sum to wall time; discovery has uninstrumented work.',
            'stateDivergences': changes, 'divergentSamplesBy300SecChunk': dict(buckets),
            'costEstimates': cost,
            'packagesEqual': runs['cpu']['environment']['packages'] == runs['gpu']['environment']['packages'],
            'modelHashesEqual': {k: v['sha256'] for k, v in runs['cpu']['models']['files'].items()} ==
                                {k: v['sha256'] for k, v in runs['gpu']['models']['files'].items()},
            'imagesEqual': read('cpu/image.json') == read('gpu/image.json'),
            'gpuSampling': runs['gpu']['gpuSampling'],
            'causalAttribution': 'Unresolved: stage outputs and OCR caches were not retained in the bucket.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    args.out.write_text(json.dumps(summarise(args.root), indent=2, allow_nan=False))
