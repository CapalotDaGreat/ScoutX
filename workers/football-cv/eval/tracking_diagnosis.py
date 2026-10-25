"""Source-bound local per-frame diagnosis. Never trains or grants production approval."""
from __future__ import annotations

import argparse
from collections import Counter
import json
import math
import os
from pathlib import Path
import time

import numpy as np

from app.contract import SegmentRequest
from app.identity import valid_read, TEAM_CANDIDATE_MATCH
from app.match_identity import MatchTarget
from app.pipeline import Components, WORKER_VERSION, _crop, analyse_segment, usable_box
from app.source_pts import source_sha256
from app.teams import team_match
from eval.full_match_validation import encoded, publish, read_json
from eval.match import decoded_coverage
from eval.predict import LocalFile, target_only_segment
from eval.prepare_anchor import _local_path, _signature
from eval.trail_metrics import TrailLabels, trail_metrics


class Audit:
    def __init__(self, target: MatchTarget):
        self.target = target
        self.frames: list[dict] = []
        self.current: dict = {}
        self.crop_index = 0
        self.epoch = 0
        self.eligible: list[dict] = []
        self.frame: np.ndarray | None = None

    def source(self, source):
        audit = self
        class Source:
            def frames(self, *args):
                for t, frame in source.frames(*args):
                    audit.frame, audit.crop_index, audit.eligible = frame, 0, []
                    audit.current = {'timeSec': t, 'detections': 0, 'tracked': 0, 'observations': []}
                    audit.frames.append(audit.current)
                    yield t, frame
        return Source()

    def detector(self, detector):
        audit = self
        class Detector:
            def people(self, frame):
                boxes = detector.people(frame)
                audit.current['detections'] = sum(usable_box(b, frame.shape[1], frame.shape[0]) is not None for b in boxes)
                audit.current['_detections'] = boxes
                return boxes
        return Detector()

    def factory(self, factory):
        audit = self
        def create():
            audit.epoch += 1
            epoch, tracker = audit.epoch, factory()
            class Tracker:
                def update(self, boxes):
                    result = tracker.update(boxes)
                    audit.current['tracked'] = len(result)
                    audit.current['_tracks'] = []
                    for key, raw in result:
                        b = usable_box(raw, audit.frame.shape[1], audit.frame.shape[0])
                        if b is None:
                            continue
                        row = {'key': f'{epoch}:{key}', 'box': [b.x1, b.y1, b.x2, b.y2], 'crops': [],
                               'kitMatch': team_match(_crop(audit.frame, b, .15, .5),
                                                     audit.target.kitPrimaryColor, audit.target.kitSecondaryColor)}
                        audit.current['_tracks'].append(row)
                        if b.score >= .4 and _crop(audit.frame, b, .15, .5).size:
                            audit.eligible.append(row)
                    return result
            return Tracker()
        return create

    def reader(self, reader):
        audit = self
        class Reader:
            def read(self, crop):
                index, audit.crop_index = audit.crop_index, audit.crop_index + 1
                if index // 2 >= len(audit.eligible):
                    raise ValueError('OCR instrumentation no longer matches garment policy')
                raw = []
                inner = getattr(reader, '_reader', None)
                if inner is not None:
                    class Proxy:
                        def readtext(self, *args, **kwargs):
                            values = inner.readtext(*args, **kwargs)
                            raw.extend(values)
                            return values
                    reader._reader = Proxy()
                try:
                    number, confidence = reader.read(crop)
                finally:
                    if inner is not None:
                        reader._reader = inner
                valid = {str(text).strip() for _, text, score in raw if valid_read(str(text).strip(), float(score))}
                reason = ('too_small' if crop.shape[0] < 24 or crop.shape[1] < 16 else
                          'conflicting_regions' if len(valid) > 1 else
                          'accepted' if valid_read(number, confidence) else
                          'low_confidence_or_invalid_text' if raw else 'no_text')
                gray = crop.astype(float).mean(axis=2) if crop.size else np.zeros((1, 1))
                focus = float(np.mean(np.diff(gray, axis=0)**2)) if gray.shape[0] > 1 else 0.
                audit.eligible[index // 2]['crops'].append({'region': 'torso' if index % 2 == 0 else 'shorts',
                    'width': crop.shape[1], 'height': crop.shape[0], 'focusProxy': focus,
                    'reason': reason, 'number': number, 'confidence': confidence})
                return number, confidence
        return Reader()

    def finish(self, trace: list[dict], labels: TrailLabels | None) -> dict:
        rows, claims = [], []
        counts = Counter()
        candidate_keys = set()
        reads = 0
        for frame in self.frames:
            rejections = Counter(c['reason'] for o in frame.get('_tracks', []) for c in o['crops'])
            target_observations = []
            for observation in frame.get('_tracks', []):
                crops = observation['crops']
                valid = [c for c in crops if valid_read(c['number'], c['confidence'])]
                if len({c['number'] for c in valid}) > 1:
                    rejections['garment_conflict'] += 1
                    continue
                if not valid or valid[0]['number'] != self.target.jerseyNumber:
                    continue
                kit_ok = observation['kitMatch'] >= TEAM_CANDIDATE_MATCH
                reads += kit_ok
                candidate_keys.add(observation['key'])
                target_observations.append({'candidateKey': observation['key'], 'kitMatch': observation['kitMatch'],
                    'qualifyingRead': kit_ok, 'confidence': min(c['confidence'] for c in valid),
                    'crops': [{k: v for k, v in c.items() if k != 'number'} for c in crops]})
            for point in trace:
                if point['timeSec'] != frame['timeSec']:
                    continue
                matches = [o for o in frame.get('_tracks', []) if o['box'] == point['box']]
                if len(matches) != 1:
                    raise ValueError('trace cannot be attributed uniquely to an anonymous track')
                claims.append({**point, 'trackId': matches[0]['key'], 'state': 'confirmed',
                               'confidence': .8, 'confidenceCalibrated': False})
            detection_hit = None
            if labels is not None:
                label = next((v for v in labels.frames if abs(v.timeSec-frame['timeSec']) <= 1e-6), None)
                if label and label.state == 'visible':
                    from eval.evaluate import iou
                    detection_hit = any(iou(list(label.box), [b.x1, b.y1, b.x2, b.y2]) >= .5
                                        for b in frame.get('_detections', []))
            counts.update(rejections)
            rows.append({'timeSec': frame['timeSec'], 'detections': frame['detections'], 'tracked': frame['tracked'],
                         'targetDetectionHit': detection_hit, 'rejections': dict(rejections),
                         'numberReadCandidates': target_observations,
                         'trailState': 'confirmed' if any(c['timeSec'] == frame['timeSec'] for c in claims) else 'abstained',
                         'occlusion': 'unmeasured', 'cameraMotion': 'unmeasured', 'crossing': 'unmeasured'})
        metrics = trail_metrics([r['timeSec'] for r in rows], claims, labels)
        hits = [r['targetDetectionHit'] for r in rows if r['targetDetectionHit'] is not None]
        if hits:
            metrics['detectionRecall'] = sum(hits)/len(hits)
        self.frames.clear()
        self.eligible.clear()
        self.frame = None
        return {'frames': rows, 'claims': claims, 'metrics': metrics, 'qualifyingReads': reads,
                'numberReadCandidateTracks': len(candidate_keys), 'cropRejections': dict(counts)}


def run(components: Components, source, request: SegmentRequest, labels: TrailLabels | None = None) -> dict:
    target = MatchTarget.model_validate({k: v for k, v in request.target.model_dump().items()
                                       if k in MatchTarget.model_fields})
    audit = Audit(target)
    local = Components(audit.source(source), audit.detector(components.detector),
                       audit.factory(components.tracker_factory), audit.reader(components.jersey_reader), components.models)
    trace = []
    started = time.perf_counter()
    result = analyse_segment(request, local, trace)
    timestamps = [r['timeSec'] for r in audit.frames]
    coverage = decoded_coverage(timestamps, request)
    if result.stages.tracking != 'complete' or not coverage['complete']:
        raise ValueError('failed/incomplete decode is not an abstention benchmark')
    value = audit.finish(trace, labels)
    return {**value, 'segment': target_only_segment(result), 'decodeAudit': coverage,
            'elapsedSec': time.perf_counter()-started}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, type=_local_path)
    parser.add_argument('--out', required=True, type=_local_path)
    parser.add_argument('--start', required=True, type=float)
    parser.add_argument('--end', required=True, type=float)
    parser.add_argument('--fps', type=float, default=5.)
    parser.add_argument('--jersey-number', required=True)
    parser.add_argument('--kit-primary-color', required=True)
    parser.add_argument('--kit-secondary-color', default='')
    parser.add_argument('--labels', type=_local_path)
    parser.add_argument('--authorize-local-evaluation', action='store_true', required=True)
    args = parser.parse_args(argv)
    try:
        target = MatchTarget(jerseyNumber=args.jersey_number, kitPrimaryColor=args.kit_primary_color,
                             kitSecondaryColor=args.kit_secondary_color)
        source = _local_path(args.input.resolve(strict=True))
        if (not source.is_file() or not all(math.isfinite(v) for v in (args.start, args.end, args.fps))
                or not 0 <= args.start < args.end <= min(9000, args.start+15) or not 0 < args.fps <= 5
                or args.out.exists() or args.out.is_symlink() or not args.out.parent.is_dir()):
            raise ValueError('bounded local source and new output directory required')
        _local_path(args.out.resolve())
        before, digest = source.stat(), source_sha256(source)
        labels = TrailLabels.model_validate_json(args.labels.read_text()) if args.labels else None
        if labels and (labels.sourceSha256 != digest or labels.target != target):
            raise ValueError('reviewed source/target mismatch')
        os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', CUDA_VISIBLE_DEVICES='')
        import torch
        from app.backends import default_components
        torch.set_num_threads(2)
        torch.set_num_interop_threads(1)
        components = default_components(args.fps, local_only=True, cpu=True)
        request = SegmentRequest(contractVersion=2, jobId='local-diagnosis', segmentIndex=0,
            startSec=args.start, endSec=args.end, source={'url': 'https://evaluation.invalid/local'},
            target=target.model_dump(), sampling={'fps': args.fps},
            privacy={'retainNonTargetIdentities': False, 'faceRecognition': False, 'persistMedia': False})
        baseline = run(components, LocalFile(source), request, labels)
        if _signature(source.stat()) != _signature(before) or source_sha256(source) != digest:
            raise ValueError('source changed')
        payload = {'schemaVersion': 1, 'sourceSha256': digest, 'target': target.model_dump(exclude_defaults=True),
            'workerVersion': WORKER_VERSION, 'models': components.models, 'fps': args.fps,
            'interval': [args.start, args.end], 'authorizedLocalEvaluation': True,
            'productionApproval': False, 'modelTraining': False, 'cloudUpload': False,
            'baseline': baseline, 'candidate': None, 'fullRecordingValidated': False}
        publish(args.out, {'diagnosis.json': encoded(payload)})
        print(json.dumps({'qualifyingReads': baseline['qualifyingReads'], **baseline['metrics']}))
        return 0
    except Exception:
        print('Diagnosis failed; no complete comparison or approval claimed.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
