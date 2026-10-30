"""Fresh model inference on fixed, previously examined IMG_4809 regression windows.

This measures window accuracy and wall time, not full-match validation or an
independent holdout. Automatic and recorded-owner-anchor conditions stay separate.
Footage, crops and caches remain in the operator's new local output directory.
"""
from __future__ import annotations

import argparse
import dataclasses
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'bench'))

import numpy as np
import pp_bench
from scoutx_tracker.envinfo import environment_metadata, sha256_file, verify_models

WINDOWS = {'3144': (1880.0, 1925.0), '1073': (1050.0, 1085.0)}


def fixture_truth(name: str) -> tuple[dict, dict]:
    meta = json.loads((ROOT / 'tests' / 'fixtures' / f'img4809_{name}_slice.json').read_text())
    start, _ = WINDOWS[name]
    truth = {'fps': meta['fps'], 'frames': {}, 'times': {}}
    for frame, box, label in meta['groundTruth']:
        key = str(frame)
        truth['frames'].setdefault(key, []).append({'box': box, 'label': label})
        truth['times'][key] = start + frame / meta['fps']
    return meta, truth


def score_timeline(path: Path, truth: dict, size: tuple[int, int]) -> dict:
    with np.load(path, allow_pickle=False) as z:
        times, states, present, boxes = (z[k] for k in ('times', 'states', 'present', 'boxes'))
        if not len(times) or np.any(np.diff(times) <= 0):
            raise ValueError('empty or nonchronological timeline')
        for timestamp in truth['times'].values():
            if float(np.min(np.abs(times - timestamp))) > 0.051:
                raise ValueError('reviewed label has no decoded sample')
        claims = [[float(t), str(states[i]), boxes[i].tolist()] for i, t in enumerate(times) if present[i]]
        scored = pp_bench.accuracy(claims, truth, size)
        labelled_states = []
        for key, labels in truth['frames'].items():
            if any(label['label'] == 'T' for label in labels):
                i = int(np.argmin(np.abs(times - truth['times'][key])))
                labelled_states.append(str(states[i]) if present[i] else 'UNKNOWN')
        scored['abstainedVisibleFrames'] = sum(s not in pp_bench.CLAIM for s in labelled_states)
        scored['confirmedRecall'] = (round(scored['confirmedCorrectSec'] / scored['targetLabelledSec'], 3)
                                     if scored['targetLabelledSec'] else None)
        scored['abstentionRateOnVisibleLabels'] = (round(scored['abstainedVisibleFrames'] / len(labelled_states), 3)
                                                   if labelled_states else None)
        return scored


def window_local_time(data, truth, anchors, sightings, offset):
    """Reports are window-local; FrameReader's source-video offsets stay absolute."""
    data.times = data.times - offset
    data.dets = data.dets.copy()
    data.dets[:, 1] -= offset
    data.balls = data.balls.copy()
    data.balls[:, 1] -= offset
    local_truth = {**truth, 'times': {key: value - offset for key, value in truth['times'].items()}}
    return (local_truth, [(t - offset, x, y) for t, x, y in anchors],
            [{**sighting, 't': sighting['t'] - offset} for sighting in sightings])


def code_hashes() -> dict:
    files = list((ROOT / 'scoutx_tracker').glob('*.py')) + [Path(__file__), ROOT / 'bench' / 'pp_bench.py']
    files += [ROOT / 'tests' / 'fixtures' / f'img4809_{key}_slice.json' for key in WINDOWS]
    return {p.relative_to(ROOT).as_posix(): sha256_file(p) for p in sorted(files)}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--video', type=Path, required=True)
    parser.add_argument('--out-dir', type=Path, required=True)
    parser.add_argument('--windows', nargs='+', choices=tuple(WINDOWS), default=list(WINDOWS))
    parser.add_argument('--reuse-stage1-from', type=Path,
                        help='Rebuild reports from verified prior fresh inference; timing is marked incomplete')
    args = parser.parse_args(argv)
    if not args.video.is_file() or args.out_dir.exists() or args.out_dir.is_symlink():
        parser.error('local footage and a NEW output directory required')
    reference = json.loads((ROOT / 'bench' / 'references' / 'img4809_proxy_10fps.json').read_text())
    source_hash = sha256_file(args.video)
    if source_hash != reference['sha256']:
        raise ValueError('source differs from the exact validated proxy; no inference run')
    models = verify_models()
    if not models['ok']:
        raise ValueError('model hashes do not match the pinned reference')
    before = code_hashes()
    previous = None
    if args.reuse_stage1_from:
        previous = json.loads((args.reuse_stage1_from / 'validation.json').read_text())
        if previous['sourceSha256'] != source_hash or previous['models'] != models:
            raise ValueError('prior source/model provenance differs')
        for name, expected in previous['codeSha256'].items():
            if name != 'bench/validate_identity_windows.py' and before.get(name) != expected:
                raise ValueError('prior engine, evaluator or labels differ')
    import torch
    from scoutx_tracker.analyze import analyze
    from scoutx_tracker.discovery import discover
    from scoutx_tracker.extract import Detector, extract
    from scoutx_tracker.ocr import shared_reader
    from scoutx_tracker.tracklets import load_runs

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    args.out_dir.mkdir(parents=True)
    record = {'schema': 'pitchproof.fresh-window-validation.v1',
              'timestampUtc': datetime.now(timezone.utc).isoformat(), 'environment': environment_metadata(),
              'gitCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'models': models, 'sourceSha256': source_hash, 'codeSha256': before,
              'configuration': {'stage1Imgsz': 1280, 'stage1Stride': 1, 'keyframeEvery': 1,
                                'stage1Decoder': 'cv2', 'discoveryDecoder': 'auto', 'torchThreads': 2},
              'scope': 'Fresh inference on fixed development regressions; not independent holdout or full match',
              'reportTimeBasis': 'window-local, with absolute source interval and source offsets retained',
              'reusedStage1AndDiscovery': previous is not None, 'timingComplete': previous is None,
              'productionApproval': False, 'fullRecordingValidated': False, 'results': [], 'status': 'running'}

    def save():
        temporary = args.out_dir / 'validation.json.part'
        temporary.write_text(json.dumps(record, indent=2, allow_nan=False), encoding='utf-8')
        temporary.replace(args.out_dir / 'validation.json')

    save()
    started = time.perf_counter()
    reader = shared_reader() if previous is None else None
    detector = Detector(imgsz=416) if previous is None else None
    record['modelInitialisationSec'] = round(time.perf_counter() - started, 3)
    save()
    for key in args.windows:
        meta, truth = fixture_truth(key)
        start, end = WINDOWS[key]
        directory = args.out_dir / key
        directory.mkdir()
        print(f'Window {key}: {start}-{end} s', flush=True)
        t = time.perf_counter()
        if previous is None:
            discovery = discover(str(args.video), start, end, '20', 'orange', lambda f: detector(f)[:2], reader,
                                 crops_dir=str(directory / 'discovery-crops'))
            sightings = [dataclasses.asdict(s) for s in discovery.sightings]
            item = {'window': key, 'intervalSec': [start, end], 'discoverySec': round(time.perf_counter() - t, 3),
                    'sightings': len(sightings), 'discoverySightings': sightings,
                    'discoveryTimings': discovery.timings, 'conditions': []}
        else:
            old = next(item for item in previous['results'] if item['window'] == key)
            if old['sightings'] and 'discoverySightings' not in old:
                raise ValueError('prior discovery evidence was not retained; cannot reconstruct it from a count')
            sightings = old.get('discoverySightings', [])
            item = {**{name: value for name, value in old.items() if name != 'conditions'},
                    'discoverySightings': sightings, 'conditions': [], 'inferenceReused': True}
            shutil.copytree(args.reuse_stage1_from / key / 'stage1', directory / 'stage1')
        record['results'].append(item)
        save()
        stage = directory / 'stage1' / 'chunk'
        def progress(frame, timestamp, elapsed):
            print(f'Window {key} frame {frame} at {timestamp:.1f}s, extraction {elapsed:.1f}s', flush=True)
        t = time.perf_counter()
        if previous is None:
            extraction = extract(str(args.video), str(stage), start=start, end=end, stride=1, imgsz=1280,
                                 key_every=1, decoder='cv2', progress=progress)
            item.update(extractionSec=round(time.perf_counter() - t, 3), extraction=extraction)
        item['retainedStage1Sha256'] = sha256_file(stage / 'detections.npz')
        save()
        data = load_runs([str(stage)])
        truth, local_anchors, sightings = window_local_time(data, truth, meta.get('anchors', []), sightings, start)
        for mode, anchors in [('automatic', []), ('recorded-owner-anchor', meta.get('anchors', []))]:
            if mode != 'automatic' and not anchors:
                continue
            output = directory / mode
            t = time.perf_counter()
            report = analyze([str(stage)], str(output), '20', 'orange', kit2='white',
                             anchors=local_anchors if anchors else [], D=data,
                             sightings=sightings, log=lambda m: print(m, flush=True))
            if not report['invariants']['ok']:
                record['status'], record['error'] = 'failed', report['invariants']['violations']
                save()
                raise ValueError('report invariants failed')
            item['conditions'].append({'mode': mode, 'anchors': anchors, 'resolveSec': round(time.perf_counter() - t, 3),
                                       'metrics': score_timeline(output / 'timeline.npz', truth, (data.width, data.height)),
                                       'coverage': report['coverage'], 'engine': report['engine']})
            save()
        print(json.dumps(item['conditions'], default=str), flush=True)
    if code_hashes() != before or sha256_file(args.video) != source_hash or verify_models() != models:
        raise ValueError('source, models or evaluation code changed; results are incomplete')
    record['status'] = 'complete'
    record['measuredWindowWallSec'] = round(time.perf_counter() - started, 3)
    save()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
