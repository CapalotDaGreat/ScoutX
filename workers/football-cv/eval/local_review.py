"""Static offline frame review, source-bound label validation and prospective holdouts."""
from __future__ import annotations

import argparse
import hashlib
from io import BytesIO
import json
import math
import os
from pathlib import Path
import random
from typing import Annotated, Literal

import numpy as np
from PIL import Image
from pydantic import Field, model_validator

from app.contract import SegmentRequest
from app.experimental_identity import Digest, StrictModel
from app.match_identity import MatchTarget
from app.pipeline import scene_signature, usable_box
from app.source_pts import source_sha256
from eval.full_match_validation import digest, encoded, publish, read_json
from eval.match import decoded_coverage, inspect_duration
from eval.predict import LocalFile
from eval.prepare_anchor import _local_path, _signature
from eval.trail_metrics import TrailLabels


class Overlay(StrictModel):
    box: tuple[float, float, float, float]
    trackId: Annotated[str, Field(pattern=r'^[A-Za-z0-9:_-]{1,80}$')]


class ReviewFrame(StrictModel):
    timeSec: Annotated[float, Field(ge=0, le=9000)]
    width: Annotated[int, Field(gt=0, le=8192)]
    height: Annotated[int, Field(gt=0, le=8192)]
    image: Annotated[str, Field(pattern=r'^frame-[0-9]{5}\.png$')]
    rgbSha256: Digest
    pngSha256: Digest
    detections: Annotated[list[Overlay], Field(max_length=300)]
    tracks: Annotated[list[Overlay], Field(max_length=300)]

    @model_validator(mode='after')
    def contained(self):
        for item in self.detections + self.tracks:
            x1, y1, x2, y2 = item.box
            if not 0 <= x1 < x2 <= self.width or not 0 <= y1 < y2 <= self.height:
                raise ValueError('overlay exceeds decoded image')
        return self


class ReviewPack(StrictModel):
    schemaVersion: int = Field(ge=1, le=1)
    sourceSha256: Digest
    target: MatchTarget
    startSec: Annotated[float, Field(ge=0, le=9000)]
    endSec: Annotated[float, Field(gt=0, le=9000)]
    fps: Annotated[float, Field(gt=0, le=5)]
    overlaysAvailable: bool
    uiSha256: Digest
    split: Literal['development', 'holdout'] = 'development'
    splitPlanSha256: Digest | None = None
    frames: Annotated[list[ReviewFrame], Field(min_length=1, max_length=75)]

    @model_validator(mode='after')
    def bounded(self):
        if not 0 < self.endSec-self.startSec <= 15:
            raise ValueError('review windows are limited to fifteen seconds')
        if self.split == 'holdout' and self.splitPlanSha256 is None:
            raise ValueError('holdout pack requires a frozen split digest')
        for i, frame in enumerate(self.frames):
            if frame.image != f'frame-{i:05}.png' or not self.startSec <= frame.timeSec < self.endSec:
                raise ValueError('noncanonical review sample')
            if i and frame.timeSec <= self.frames[i-1].timeSec:
                raise ValueError('review samples must increase')
        return self


def request_for(pack: ReviewPack) -> SegmentRequest:
    return SegmentRequest(contractVersion=2, jobId='local-review', segmentIndex=0,
        startSec=pack.startSec, endSec=pack.endSec, source={'url': 'https://evaluation.invalid/local'},
        target=pack.target.model_dump(), sampling={'fps': pack.fps},
        privacy={'retainNonTargetIdentities': False, 'faceRecognition': False, 'persistMedia': False})


def labels_for_pack(raw: dict, pack: ReviewPack, *, draft: bool = False) -> TrailLabels:
    # Drafts are checked against the same schema, but are never returned as reviewed exports.
    if draft and not isinstance(raw.get('reviewed'), bool):
        raise ValueError('draft review state must be explicit')
    value = {**raw, 'reviewed': True} if draft else raw
    labels = TrailLabels.model_validate_json(json.dumps(value, allow_nan=False))
    if not draft and labels.reviewerId.startswith('REPLACE_'):
        raise ValueError('actual reviewer ID is required')
    if labels.sourceSha256 != pack.sourceSha256 or labels.target != pack.target:
        raise ValueError('labels refer to a different source or target')
    if len(labels.frames) != len(pack.frames):
        raise ValueError('every sampled timestamp must be retained')
    for label, frame in zip(labels.frames, pack.frames):
        if abs(label.timeSec-frame.timeSec) > 1e-9:
            raise ValueError('labels must retain exact source sample timestamps')
        if label.box and (label.box[2] > frame.width or label.box[3] > frame.height):
            raise ValueError('label exceeds decoded image dimensions')
    return labels


def prepare(source: Path, source_digest: str, target: MatchTarget, start: float, end: float, fps: float,
            *, template: dict | None = None, detector=None, tracker_factory=None,
            holdout_plan: dict | None = None) -> dict[str, bytes]:
    if (not all(math.isfinite(v) for v in (start, end, fps))
            or not 0 <= start < end <= min(9000., start+15) or not 0 < fps <= 5):
        raise ValueError('bounded review interval required')
    if holdout_plan is not None:
        check_holdout(holdout_plan, source_digest, target, start, end, fps)
    files, rows = {}, []
    pixels_total = bytes_total = 0
    previous_time, previous_scene, epoch = None, None, 0
    tracker = tracker_factory() if tracker_factory else None
    for t, rgb in LocalFile(source).frames('', None, start, end, fps):
        if len(rows) >= 75 or rgb.shape[0]*rgb.shape[1] > 16_000_000:
            raise ValueError('local review image budget exceeded')
        pixels_total += rgb.shape[0]*rgb.shape[1]
        if pixels_total > 200_000_000:
            raise ValueError('review pack pixel budget exceeded; choose a shorter interval')
        signature = scene_signature(rgb)
        if tracker and previous_time is not None and (t-previous_time > max(2., 1.5/fps)
                or float(np.mean(np.abs(signature-previous_scene))) > .35):
            tracker, epoch = tracker_factory(), epoch+1
        previous_time, previous_scene = t, signature
        boxes = ([b for raw in detector.people(rgb)
                  if (b := usable_box(raw, rgb.shape[1], rgb.shape[0])) is not None] if detector else [])
        tracked = tracker.update(boxes) if tracker else []
        data = BytesIO()
        Image.fromarray(rgb).save(data, format='PNG')
        image = f'frame-{len(rows):05}.png'
        files[image] = data.getvalue()
        bytes_total += len(files[image])
        if bytes_total > 256*1024*1024:
            raise ValueError('review pack storage budget exceeded; choose a shorter interval')
        rows.append({'timeSec': t, 'width': rgb.shape[1], 'height': rgb.shape[0], 'image': image,
            'rgbSha256': hashlib.sha256(rgb.tobytes(order='C')).hexdigest(),
            'pngSha256': hashlib.sha256(files[image]).hexdigest(),
            'detections': [{'box': [b.x1, b.y1, b.x2, b.y2], 'trackId': f'd{i}'} for i, b in enumerate(boxes)],
            'tracks': [{'box': [b.x1, b.y1, b.x2, b.y2], 'trackId': f's{epoch}:{key}'}
                       for key, raw in tracked if (b := usable_box(raw, rgb.shape[1], rgb.shape[0])) is not None]})
    ui = Path(__file__).with_name('review_ui.html').read_text(encoding='utf8')
    pack = ReviewPack.model_validate_json(json.dumps({'schemaVersion': 1, 'sourceSha256': source_digest,
        'target': target.model_dump(), 'startSec': start, 'endSec': end, 'fps': fps,
        'split': 'holdout' if holdout_plan else 'development',
        'splitPlanSha256': digest(holdout_plan) if holdout_plan else None,
        'overlaysAvailable': detector is not None, 'uiSha256': hashlib.sha256(ui.encode()).hexdigest(), 'frames': rows}))
    if not decoded_coverage([f.timeSec for f in pack.frames], request_for(pack))['complete']:
        raise ValueError('incomplete review decode')
    draft = template or {'schemaVersion': 1, 'sourceSha256': source_digest,
        'target': target.model_dump(exclude_defaults=True), 'reviewerId': 'REPLACE_WITH_ACTUAL_REVIEWER', 'reviewed': False,
        'frames': [{'timeSec': f.timeSec, 'state': 'uncertain', 'box': None,
                    'occlusion': 'unknown', 'camera': 'unknown', 'crossing': False} for f in pack.frames]}
    labels_for_pack(draft, pack, draft=True)
    draft = {**draft, 'reviewed': False}
    manifest = pack.model_dump(mode='json')
    embedded = json.dumps({'pack': manifest, 'packSha256': digest(manifest), 'draft': draft}, allow_nan=False)
    embedded = embedded.replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    files.update({'index.html': ui.replace('__REVIEW_DATA__', embedded).encode(),
                  'manifest.json': encoded(manifest), 'labels.template.json': encoded(draft)})
    return files


def validate(source: Path, source_digest: str, directory: Path, raw: dict,
             *, notes: dict | None = None, require_blinded: bool = False, holdout_plan: dict | None = None) -> dict:
    directory = _local_path(directory.resolve(strict=True))
    pack = ReviewPack.model_validate_json(json.dumps(read_json(directory/'manifest.json'), allow_nan=False))
    if pack.sourceSha256 != source_digest:
        raise ValueError('review pack source hash mismatch')
    labels = labels_for_pack(raw, pack)
    if pack.split == 'holdout':
        if holdout_plan is None or digest(holdout_plan) != pack.splitPlanSha256:
            raise ValueError('original frozen holdout plan is required')
        check_holdout(holdout_plan, source_digest, pack.target, pack.startSec, pack.endSec, pack.fps)
        require_blinded = True
    elif holdout_plan is not None:
        raise ValueError('development pack cannot become a holdout during validation')
    # Re-decode the authorized source, not a tampered browser preview or inferred FPS frame number.
    count = 0
    for t, rgb in LocalFile(source).frames('', None, pack.startSec, pack.endSec, pack.fps):
        if count >= len(pack.frames):
            raise ValueError('unexpected source sample')
        f = pack.frames[count]
        image = _local_path((directory/f.image).resolve(strict=True))
        if (image.parent != directory or abs(t-f.timeSec) > 1e-9 or rgb.shape[:2] != (f.height, f.width)
                or hashlib.sha256(rgb.tobytes(order='C')).hexdigest() != f.rgbSha256
                or source_sha256(image) != f.pngSha256):
            raise ValueError('review preview or exact source frame changed')
        count += 1
    if count != len(pack.frames):
        raise ValueError('missing source samples')
    blinded = None
    if notes is not None:
        if (notes.get('schemaVersion') != 1 or notes.get('reviewerId') != labels.reviewerId
                or notes.get('sourceSha256') != source_digest or notes.get('packSha256') != digest(pack.model_dump(mode='json'))
                or len(notes.get('frames', [])) != count):
            raise ValueError('review notes scope mismatch')
        for note, frame in zip(notes['frames'], pack.frames):
            if (note.get('timeSec') != frame.timeSec or note.get('reviewed') is not True
                    or note.get('numberLegible') not in ('unknown', 'yes', 'no')):
                raise ValueError('incomplete review notes')
            tags = note.get('tags')
            if (not isinstance(tags, list) or any(not isinstance(t, str) for t in tags)
                    or len(set(tags)) != len(tags) or any(t not in ('re_entry', 'back_facing', 'far_small') for t in tags)):
                raise ValueError('invalid hard-case review tags')
        if not isinstance(notes.get('overlaysShown'), bool):
            raise ValueError('overlay exposure attestation missing')
        blinded = not notes['overlaysShown']
    if require_blinded and blinded is not True:
        raise ValueError('unexposed review notes are required for a blinded holdout')
    return {'schemaVersion': 1, 'sourceSha256': source_digest, 'labelsSha256': digest(raw),
            'packSha256': digest(pack.model_dump(mode='json')), 'reviewerId': labels.reviewerId,
            'reviewedFrames': count, 'blindedReviewAttested': blinded, 'productionApproval': False,
            'split': pack.split, 'splitPlanSha256': pack.splitPlanSha256,
            'independence': 'Human attestation only; not proof of independent review or production acceptance.'}


def freeze_windows(source_digest: str, duration: float, dev_start: float, dev_end: float,
                   count: int = 4, seconds: float = 6., buffer: float = 60., fps: float = 2.) -> dict:
    if (not all(math.isfinite(v) for v in (duration, dev_start, dev_end, seconds, buffer, fps))
            or not 0 <= dev_start < dev_end <= duration <= 9000 or not 1 <= count <= 12
            or not 0 < seconds <= 15 or buffer < 0 or not 0 < fps <= 5):
        raise ValueError('invalid frozen split bounds')
    rng = random.Random(int(source_digest, 16))
    windows = []
    for i in range(count):
        low, high = duration*i/count, duration*(i+1)/count-seconds
        for _ in range(1000):
            start = round(rng.uniform(low, high), 3)
            end = round(start+seconds, 3)
            if (low > high or end > duration*(i+1)/count or start < low
                    or (start < dev_end+buffer and end > max(0., dev_start-buffer))
                    or any(start < w['endSec']+buffer and end > w['startSec']-buffer for w in windows)):
                continue
            windows.append({'startSec': start, 'endSec': end, 'contentReviewed': False})
            break
        else:
            raise ValueError('not enough separated holdout space; do not silently substitute windows')
    return {'schemaVersion': 1, 'sourceSha256': source_digest, 'durationSec': duration,
            'development': {'startSec': dev_start, 'endSec': dev_end}, 'exclusionBufferSec': buffer,
            'holdout': windows, 'holdoutFps': fps, 'selection': 'Source-hash-seeded temporal strata, selected before new tuning.',
            'requiredNegatives': ['wrong_player', 'similar_kit', 'conflicting_number', 'crossing', 'cut', 'occlusion', 're_entry'],
            'negativeCoverageVerified': False, 'productionApproval': False,
            'limitation': 'Prospective within-recording split; not proof of prior non-exposure or unseen-match generalization.'}


def check_holdout(plan: dict, source_digest: str, target: MatchTarget, start: float, end: float, fps: float) -> None:
    if (plan.get('schemaVersion') != 1 or plan.get('sourceSha256') != source_digest
            or MatchTarget.model_validate(plan.get('target')) != target
            or plan.get('holdoutFps') != fps or not any(
                w.get('startSec') == start and w.get('endSec') == end for w in plan.get('holdout', []))):
        raise ValueError('source, target, window and sampling must match the frozen holdout')


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_subparsers(dest='mode', required=True)
    for mode in ('prepare', 'validate', 'score', 'freeze'):
        sub = modes.add_parser(mode)
        sub.add_argument('--input', type=_local_path, required=True)
        sub.add_argument('--out', type=_local_path, required=True)
        sub.add_argument('--authorize-local-evaluation', action='store_true', required=True)
        if mode in ('prepare', 'freeze'):
            sub.add_argument('--jersey-number', required=True)
            sub.add_argument('--kit-primary-color', required=True)
            sub.add_argument('--kit-secondary-color', default='')
        if mode == 'prepare':
            sub.add_argument('--start', type=float, required=True)
            sub.add_argument('--end', type=float, required=True)
            sub.add_argument('--fps', type=float, default=5.)
            sub.add_argument('--template', type=_local_path)
            sub.add_argument('--candidate-overlays', action='store_true')
            sub.add_argument('--holdout-plan', type=_local_path)
        elif mode in ('validate', 'score'):
            sub.add_argument('--pack', type=_local_path, required=True)
            sub.add_argument('--labels', type=_local_path, required=True)
            sub.add_argument('--notes', type=_local_path)
            sub.add_argument('--require-blinded', action='store_true')
            sub.add_argument('--holdout-plan', type=_local_path)
            if mode == 'score':
                sub.add_argument('--diagnosis', type=_local_path, required=True)
        else:
            sub.add_argument('--dev-start', type=float, required=True)
            sub.add_argument('--dev-end', type=float, required=True)
            sub.add_argument('--count', type=int, default=4)
            sub.add_argument('--window-seconds', type=float, default=6.)
            sub.add_argument('--buffer-seconds', type=float, default=60.)
            sub.add_argument('--holdout-fps', type=float, default=2.)
    args = parser.parse_args(argv)
    try:
        source = _local_path(args.input.resolve(strict=True))
        output = _local_path(args.out.resolve())
        if not source.is_file() or args.out.exists() or args.out.is_symlink() or not output.parent.is_dir():
            raise ValueError('local source and new output directory required')
        before, sha = source.stat(), source_sha256(source)
        if args.mode in ('prepare', 'freeze'):
            target = MatchTarget(jerseyNumber=args.jersey_number, kitPrimaryColor=args.kit_primary_color,
                                 kitSecondaryColor=args.kit_secondary_color)
        if args.mode == 'prepare':
            detector = factory = None
            holdout_plan = read_json(args.holdout_plan) if args.holdout_plan else None
            if holdout_plan is not None:
                check_holdout(holdout_plan, sha, target, args.start, args.end, args.fps)
            if args.candidate_overlays:
                os.environ.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', CUDA_VISIBLE_DEVICES='')
                import torch
                from app.backends import RtDetrDetector, ByteTrackTracker
                torch.set_num_threads(2)
                detector, factory = RtDetrDetector(local_only=True, cpu=True), lambda: ByteTrackTracker(args.fps)
            files = prepare(source, sha, target, args.start, args.end, args.fps,
                            template=read_json(args.template) if args.template else None,
                            detector=detector, tracker_factory=factory,
                            holdout_plan=holdout_plan)
        elif args.mode == 'freeze':
            plan = freeze_windows(sha, inspect_duration(source), args.dev_start, args.dev_end,
                                  args.count, args.window_seconds, args.buffer_seconds, args.holdout_fps)
            plan['target'] = target.model_dump(exclude_defaults=True)
            files = {'holdout-plan.json': encoded(plan)}
        else:
            raw_labels = read_json(args.labels)
            result = validate(source, sha, args.pack, raw_labels,
                              notes=read_json(args.notes) if args.notes else None, require_blinded=args.require_blinded,
                              holdout_plan=read_json(args.holdout_plan) if args.holdout_plan else None)
            files = {'validation.json': encoded(result)}
            if args.mode == 'score':
                from eval.review_scoring import rescore
                pack = ReviewPack.model_validate_json(json.dumps(read_json(args.pack/'manifest.json')))
                scores = rescore(read_json(args.diagnosis, maximum=64*1024*1024),
                                 labels_for_pack(raw_labels, pack), pack.startSec, pack.endSec, pack.fps)
                files['reviewed-metrics.json'] = encoded(scores)
        if _signature(source.stat()) != _signature(before) or source_sha256(source) != sha:
            raise ValueError('source changed during review preparation/validation')
        publish(output, files)
        print(json.dumps({'status': 'complete', 'mode': args.mode, 'productionApproval': False,
                          'reviewedLabelsCreatedByAgent': False}))
        return 0
    except Exception:
        print('Review operation failed: check local paths, source hashes, complete labels, bounds and cached models. No approval granted.')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
