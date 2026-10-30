"""Replay current identity code on archived labelled crossings, without model inference.

These are development regressions, not an independent holdout or a full-match
benchmark. Retained detections, appearance features and OCR reads are inputs;
their detector/recogniser accuracy and runtime are not remeasured here.
"""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
from pathlib import Path
import platform
import subprocess
import sys
import time

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'bench'))

import pp_bench
from scoutx_tracker import __version__
from scoutx_tracker import crossings, tracklets
from scoutx_tracker.features import kit_scores
from scoutx_tracker.identity import Target, resolve_identity
from scoutx_tracker.states import frame_states
from scoutx_tracker.stats import build_timeline
from scoutx_tracker.tracklets import Detections, assemble, track_rows, tracklet_features

FIXTURES = ROOT / 'tests' / 'fixtures'


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_hashes() -> dict:
    files = list((ROOT / 'scoutx_tracker').glob('*.py')) + [Path(__file__), ROOT / 'bench' / 'pp_bench.py']
    return {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(files)}


def replay(name: str, *, use_recorded_anchors: bool) -> dict:
    meta_path, data_path = FIXTURES / f'{name}.json', FIXTURES / f'{name}.npz'
    hashes = {'labelsAndReads': digest(meta_path), 'retainedStage1': digest(data_path)}
    meta = json.loads(meta_path.read_text())
    with np.load(data_path, allow_pickle=False) as z:
        data = {key: z[key].copy() for key in z.files}
    D = Detections(data['dets'], data['sigs'].astype(np.float32), data['emb_idx'], data['embs'].astype(np.float32),
                   data['balls'], data['warps'], data['times'], data['segment'], {}, meta['fps'],
                   [('fixture', 0, len(data['times']), 0.0)], meta['width'], meta['height'])
    D.grass = data['grass']
    started = time.perf_counter()
    T = assemble(D, track_rows(D), 'orange', 'white')
    reads = {}
    mapped_reads = 0
    mapped_target_reads = 0
    for frame, box, number, confidence in meta['reads']:
        rows = np.where(T.rows[:, 0] == frame)[0]
        if not len(rows):
            continue
        best = max(rows, key=lambda row: pp_bench.iou(T.rows[row, 3:7], box))
        if pp_bench.iou(T.rows[best, 3:7], box) >= 0.5:
            reads.setdefault(int(T.rows[best, 2]), []).append((frame, number, confidence, 'fixture'))
            mapped_reads += 1
            mapped_target_reads += number == '20'
    anchors = meta.get('anchors', []) if use_recorded_anchors else []
    target = Target(number='20', kit_primary='orange', kit_secondary='white', anchors=[tuple(a) for a in anchors])
    row_kit = kit_scores(D.sigs[T.rows[:, 8].astype(int)], 'orange')
    result = resolve_identity(T.summary, reads, target, D.fps, T.rows, T.by_tid, tracklet_features(D, T),
                              row_kit=row_kit, links=T.links, contact_pre=T.contact_pre)
    timeline = build_timeline(D, T, result, row_kit=row_kit)
    states, _ = frame_states(T, result, timeline, np.full(len(D.times), 'play'))
    elapsed = time.perf_counter() - started
    claims = [[float(t), str(states[f]), timeline.boxes[f].tolist()] for f, t in enumerate(D.times) if timeline.present[f]]
    gt = {'fps': D.fps, 'frames': {}, 'times': {}}
    for frame, box, label in meta['groundTruth']:
        gt['frames'].setdefault(str(frame), []).append({'box': box, 'label': label})
        gt['times'][str(frame)] = float(D.times[frame])
    metrics = pp_bench.accuracy(claims, gt, (D.width, D.height))
    stages = Counter()
    selected_states = Counter()
    abstained = confirmed_correct = 0
    for key, labels in gt['frames'].items():
        frame = int(key)
        targets = [label['box'] for label in labels if label['label'] == 'T']
        if not targets:
            continue
        stages['targetVisibleLabelledFrames'] += 1
        has_target = lambda boxes: any(pp_bench.iou(box, target_box) >= 0.5 for box in boxes for target_box in targets)
        stages['retainedDetectionHitFrames'] += has_target(D.dets[D.dets[:, 0] == frame, 2:6])
        stages['assembledTrackHitFrames'] += has_target(T.rows[T.rows[:, 0] == frame, 3:7])
        selected = bool(timeline.present[frame]) and has_target([timeline.boxes[frame]])
        stages['selectedTargetHitFrames'] += selected
        if selected:
            selected_states[str(states[frame])] += 1
            confirmed_correct += states[frame] == 'CONFIRMED_VISIBLE'
        abstained += not timeline.present[frame] or states[frame] not in pp_bench.CLAIM
    visible = stages['targetVisibleLabelledFrames']
    metrics.update(confirmedRecall=round(confirmed_correct / visible, 3) if visible else None,
                   abstainedVisibleFrames=int(abstained), abstentionRateOnVisibleLabels=round(abstained / visible, 3) if visible else None)
    if hashes != {'labelsAndReads': digest(meta_path), 'retainedStage1': digest(data_path)}:
        raise ValueError('fixture changed during replay')
    return {'fixture': name, 'inputHashes': hashes, 'sourceDescription': meta['source'],
            'mode': 'recorded-anchor' if anchors else 'automatic', 'anchorsUsed': anchors,
            'intervalSec': [float(D.times[0]), float(D.times[-1])], 'timelineFrames': len(D.times),
            'labelledFrames': len(gt['frames']), 'retainedReads': len(meta['reads']), 'mappedReads': mapped_reads,
            'readDiagnostics': {'retainedTargetNumberReads': sum(r[2] == '20' for r in meta['reads']),
                                'mappedTargetNumberReads': mapped_target_reads, 'recordedAnchorsUsed': len(anchors)},
            'metrics': metrics, 'stageDiagnostics': dict(stages), 'selectedTargetStates': dict(selected_states),
            'identityReplayWallSec': round(elapsed, 4),
            'timingScope': 'tracking/identity replay only; no decoding, detection, feature extraction or OCR inference'}


def git_value(*args) -> str | None:
    try:
        value = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=True)
        return value.stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True, help='New JSON file; existing results are never overwritten')
    args = parser.parse_args(argv)
    if args.out.exists():
        parser.error('output already exists')
    before = source_hashes()
    results = [replay('img4809_3144_slice', use_recorded_anchors=False),
               replay('img4809_1073_slice', use_recorded_anchors=False),
               replay('img4809_1073_slice', use_recorded_anchors=True)]
    if source_hashes() != before:
        raise ValueError('evaluation code changed during replay')
    record = {'schema': 'pitchproof.identity-replay.v1', 'timestampUtc': datetime.now(timezone.utc).isoformat(),
              'git': {'commit': git_value('rev-parse', 'HEAD'), 'branch': git_value('branch', '--show-current'),
                      'workingTreeStatus': git_value('status', '--short')},
              'runtime': {'python': platform.python_version(), 'executable': sys.executable,
                          'platform': platform.platform(), 'engineVersion': __version__,
                          'packages': {p: version(p) for p in ('numpy', 'scipy')}},
              'identitySettings': {'contactSplit': tracklets.CONTACT_SPLIT, 'stealSplit': crossings.STEAL_SPLIT,
                                   'stealSameMargin': crossings.STEAL_SAME_MARGIN},
              'codeSha256': before, 'results': results,
              'scope': 'Current identity code on archived developer-labelled regressions; not independent held-out accuracy',
              'detectorAndOcrRerun': False, 'fullRecordingValidated': False, 'productionApproval': False}
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x', encoding='utf-8') as stream:
        json.dump(record, stream, indent=2, allow_nan=False)
    for result in results:
        print(json.dumps({k: result[k] for k in ('fixture', 'mode', 'metrics', 'stageDiagnostics')}))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
