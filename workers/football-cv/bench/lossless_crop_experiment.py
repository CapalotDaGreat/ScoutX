"""Offline crop-codec experiment. Never changes the deployed JPEG pipeline.

Reuses fresh detections/features, regenerates EVERY retained crop as lossless PNG
from the verified source, and reruns unchanged OCR/identity. This is not an
end-to-end speed benchmark, and labels are previously examined development data.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'bench'))

import cv2
import numpy as np
from scoutx_tracker.envinfo import sha256_file, verify_models
from validate_identity_windows import WINDOWS, code_hashes, fixture_truth, score_timeline, window_local_time


def padded_crop(frame, box):
    # Exact geometry used by the existing stage-1 JPEG writer, before compression.
    x1, y1, x2, y2 = (int(v) for v in box)
    pad = int(0.05 * (box[3] - box[1]))
    return frame[max(0, y1 - pad):y2, max(0, x1 - pad):x2 + pad]


def regenerate_crops(video: Path, data, output: Path) -> dict:
    groups = {}
    for index, old_path in data.crops.items():
        frame = int(data.dets[index, 0])
        groups.setdefault(frame, []).append((index, Path(old_path)))
    if not groups:
        raise ValueError('baseline has no retained crops')
    output.mkdir(parents=True)
    cap = cv2.VideoCapture(str(video))
    mapping = {}
    try:
        fps = cap.get(cv2.CAP_PROP_FPS)
        first = min(groups)
        cap.set(cv2.CAP_PROP_POS_FRAMES, round(data.times[first] * fps))
        for frame_index in range(first, max(groups) + 1):
            ok, frame = cap.read()
            if not ok:
                raise ValueError('incomplete crop decode')
            for index, old_path in groups.get(frame_index, []):
                crop = padded_crop(frame, data.dets[index, 2:6])
                previous = cv2.imread(str(old_path))
                if previous is None or previous.shape != crop.shape:
                    raise ValueError('source/crop geometry differs from the baseline')
                path = output / (old_path.stem + '.png')
                if not cv2.imwrite(str(path), crop, [cv2.IMWRITE_PNG_COMPRESSION, 3]):
                    raise OSError('crop write failed')
                if not np.array_equal(cv2.imread(str(path)), crop):
                    raise ValueError('PNG did not preserve the decoded source pixels')
                mapping[index] = str(path)
    finally:
        cap.release()
    return mapping


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--baseline', type=Path, required=True, help='Completed fresh-window output directory')
    parser.add_argument('--out-dir', type=Path, required=True)
    parser.add_argument('--window', choices=tuple(WINDOWS), default='3144')
    args = parser.parse_args(argv)
    if args.out_dir.exists():
        parser.error('use a new experiment output directory')
    baseline = json.loads((args.baseline / 'validation.json').read_text())
    if baseline['status'] != 'complete' or sha256_file(args.video) != baseline['sourceSha256']:
        raise ValueError('completed baseline and identical source required')
    if verify_models() != baseline['models']:
        raise ValueError('model files differ from baseline')
    before = code_hashes()
    if before != baseline['codeSha256']:
        raise ValueError('evaluation/engine code differs from baseline')
    original = next(item for item in baseline['results'] if item['window'] == args.window)
    if original['sightings'] != 0:
        raise ValueError('nonempty discovery evidence must be retained explicitly before this comparison')
    import torch
    from scoutx_tracker.analyze import analyze
    from scoutx_tracker.tracklets import load_runs

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    source = args.baseline / args.window / 'stage1' / 'chunk'
    data = load_runs([str(source)])
    meta, truth = fixture_truth(args.window)
    args.out_dir.mkdir(parents=True)
    stage = args.out_dir / 'stage1' / 'chunk'
    stage.mkdir(parents=True)
    for filename in ('detections.npz', 'meta.json'):
        shutil.copy2(source / filename, stage / filename)
    t = time.perf_counter()
    data.crops = regenerate_crops(args.video, data, stage / 'crops')
    regenerated_sec = time.perf_counter() - t
    truth, local_anchors, _ = window_local_time(data, truth, meta.get('anchors', []), [], WINDOWS[args.window][0])
    conditions = []
    for mode, anchors in [('automatic', []), ('recorded-owner-anchor', local_anchors)]:
        if mode != 'automatic' and not anchors:
            continue
        report = analyze([str(stage)], str(args.out_dir / mode), '20', 'orange', kit2='white', D=data,
                         anchors=anchors, sightings=[], log=lambda m: print(m, flush=True))
        if not report['invariants']['ok']:
            raise ValueError('report invariants failed')
        conditions.append({'mode': mode, 'metrics': score_timeline(args.out_dir / mode / 'timeline.npz', truth,
                                                                  (data.width, data.height)),
                           'coverage': report['coverage'], 'engine': report['engine']})
    if code_hashes() != before or sha256_file(args.video) != baseline['sourceSha256']:
        raise ValueError('evaluation code or source changed')
    result = {'schema': 'pitchproof.lossless-crop-experiment.v1', 'window': args.window,
              'baselineFileSha256': sha256_file(args.baseline / 'validation.json'),
              'sourceSha256': baseline['sourceSha256'], 'models': baseline['models'], 'codeSha256': before,
              'experimentCodeSha256': sha256_file(Path(__file__)),
              'reusedDetectionsSha256': sha256_file(source / 'detections.npz'), 'cropCount': len(data.crops),
              'baselineMetrics': original['conditions'][0]['metrics'],
              'candidateMetrics': conditions[0]['metrics'], 'candidateConditions': conditions,
              'baselineConditions': original['conditions'],
              'cropRegenerationSec': round(regenerated_sec, 3), 'cropAndResolveSec': round(time.perf_counter() - t, 3),
              'scope': 'All retained crops regenerated, unchanged crop geometry/models/thresholds; reused detections/features',
              'fullEndToEndTiming': False, 'productionSelected': False, 'fullRecordingValidated': False}
    (args.out_dir / 'comparison.json').write_text(json.dumps(result, indent=2, allow_nan=False), encoding='utf-8')
    print(json.dumps({k: result[k] for k in ('baselineMetrics', 'candidateMetrics', 'cropCount')}), flush=True)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
