"""Controlled development-window CUDA precision investigation; NEVER creates a VM.

Default action writes a plan. --execute runs isolated profile subprocesses on an
already approved GPU host. Production constructors/settings are not edited.
Intermediate media stays on that host; export numeric JSON/NPZ evidence only.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'bench'))

PROFILES = {
    'cpu-onnx': dict(device='cpu', backend='onnx', half=False, batch=1),
    'cpu-torch': dict(device='cpu', backend='torch', half=False, batch=1),
    'gpu-fp16-b8': dict(device='cuda', backend='torch', half=True, batch=8),
    'gpu-fp32-b8': dict(device='cuda', backend='torch', half=False, batch=8),
    'gpu-fp32-b1': dict(device='cuda', backend='torch', half=False, batch=1),
    'gpu-fp32-b8-repeat': dict(device='cuda', backend='torch', half=False, batch=8),
}
WINDOWS = {'gap1150': (1150., 1180.), '3144': (1880., 1925.), '1073': (1050., 1085.)}


def fixture_truth(key):
    meta = json.loads((ROOT / 'tests/fixtures' / f'img4809_{key}_slice.json').read_text())
    truth = {'fps': meta['fps'], 'frames': {}, 'times': {}}
    for frame, box, label in meta['groundTruth']:
        k = str(frame)
        truth['frames'].setdefault(k, []).append({'box': box, 'label': label})
        truth['times'][k] = WINDOWS[key][0] + frame / meta['fps']
    return meta, truth


def write(path, value):
    Path(path).write_text(json.dumps(value, indent=2, allow_nan=False), encoding='utf-8')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def profile_env(profile, original=None):
    source = dict(os.environ if original is None else original)
    env = {k: v for k, v in source.items() if not k.startswith('SCOUTX_')}
    for k in ('SCOUTX_WEIGHTS_DIR', 'SCOUTX_GIT_COMMIT', 'SCOUTX_IMAGE_BUILT',
              'SCOUTX_BASE_IMAGE', 'SCOUTX_LOCK_SHA256'):
        if k in source:
            env[k] = source[k]
    p = PROFILES[profile]
    env.update(SCOUTX_MODE='balanced', SCOUTX_DETECTOR='yolox_s', SCOUTX_DECODER='cv2',
               SCOUTX_KEYFRAME_EVERY='1', SCOUTX_DISCOVERY_DET='416',
               SCOUTX_BACKEND=p['backend'], SCOUTX_BATCH=str(p['batch']), SCOUTX_OCR_ENHANCE='0',
               SCOUTX_ORT_PROVIDERS='CPUExecutionProvider',
               OMP_NUM_THREADS='2', MKL_NUM_THREADS='2', CUBLAS_WORKSPACE_CONFIG=':4096:8',
               PYTHONHASHSEED='0')
    if p['device'] == 'cpu':
        env['CUDA_VISIBLE_DEVICES'] = ''
    return env


def plan():
    prices = json.loads((ROOT / 'bench/gcp/prices_europe-west4.json').read_text())
    return {'schema': 'pitchproof.fp32-plan.v1', 'profiles': PROFILES,
            'windows': WINDOWS,
            'scope': 'Previously examined development regressions, not independent or full-match accuracy',
            'controlled': ['same image/commit/model hashes', 'OpenCV BGR decoding and JPEG quality 92',
                           'same identity and gate thresholds', 'fresh per-profile caches',
                           'seed 0, TF32 disabled, deterministic Torch algorithms',
                           'same fixed JPEG corpus replayed on CPU and GPU OCR'],
            'source': json.loads((ROOT / 'bench/references/img4809_proxy_10fps.json').read_text()),
            'budgetSec': 5400, 'maximumVmSessionSec': 10800, 'createsCloudResources': False,
            'proposedHost': {'project': 'scoutx-230b0', 'region': 'europe-west4', 'zone': 'europe-west4-c',
                             'machine': 'g2-standard-8', 'diskGb': 200,
                             'priceSnapshot': prices['retrieved'], 'usdPerHour': prices['vmUsdPerHour'],
                             'expectedSessionHours': [1, 1.5],
                             'maximumThreeHourComputeEstimateUsd': 3 * prices['vmUsdPerHour'],
                             'excludes': ['tax', 'storage', 'network transfer'],
                             'capacity': 'Not established by quota or prior successful allocation'},
            'historicalComparison': 'Old full-match results are contextual only: source code and decode controls differ.'}


def select_corpus(paths, limit=96, preferred=()):
    """Deterministic uniform sample plus all crops at the two diagnostic instants."""
    paths = sorted(paths, key=lambda p: p.as_posix())
    required = [p for p in paths if ('3144' in p.parts and p.stem.startswith('000226_'))
                or ('1073' in p.parts and p.stem.startswith('000234_'))
                or ('gap1150' in p.parts and p.stem.startswith('000054_'))]
    required = sorted(set(required) | (set(paths) & set(preferred)), key=lambda p: p.as_posix())
    if len(required) > limit:
        raise ValueError('diagnostic frames exceed corpus limit')
    selected = set(required)
    candidates = [p for p in paths if p not in selected]
    slots = limit - len(selected)
    if candidates and slots:
        count = min(slots, len(candidates))
        selected.update(candidates[round(i * (len(candidates) - 1) / max(count - 1, 1))]
                        for i in range(count))
    return sorted(selected, key=lambda p: p.as_posix())


def freeze_corpus(directory, out):
    import cv2
    import numpy as np
    entries = []
    stages = {}
    accepted = {}
    for cache in directory.glob('*/stage1/ocr_cache.json'):
        for key, value in json.loads(cache.read_text()).items():
            if isinstance(value, list) and value and isinstance(value[0], str) and len(value[0]) == 2:
                accepted[cache.parent / 'chunk/crops' / Path(key).name] = value
    for p in select_corpus(directory.glob('*/stage1/chunk/crops/*.jpg'), preferred=accepted):
        image = cv2.imread(str(p))
        if image is None:
            raise ValueError(f'unreadable corpus crop: {p}')
        stage, window = p.parent.parent, p.parents[3].name
        if stage not in stages:
            with np.load(stage / 'detections.npz') as z:
                stages[stage] = z['dets']
        detection = stages[stage][int(p.stem.split('_')[-1])]
        entries.append({'path': str(p.resolve()), 'fileSha256': digest(p), 'window': window,
                        'sourceTimeSec': WINDOWS[window][0] + float(detection[0]) / 10,
                        'box': detection[2:6].tolist(), 'jpegQuality': 92,
                        'cpuPipelineRead': accepted.get(p),
                        'padding': 'floor(0.05*float box height), left and top only; production stage1 geometry',
                        'pixelSha256': hashlib.sha256(image.tobytes()).hexdigest()})
    if not entries:
        raise ValueError('empty OCR corpus')
    write(out, entries)


def instrument(profile):
    """Process-local diagnostic adapters; never installed into the production engine."""
    import cv2
    import numpy as np
    import torch
    from scoutx_tracker import ocr, yolox_net

    p = PROFILES[profile]
    if torch.cuda.is_available() != (p['device'] == 'cuda'):
        raise RuntimeError('device visibility differs from explicit profile; refusing fallback')
    torch.manual_seed(0)
    np.random.seed(0)
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.deterministic = True
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.use_deterministic_algorithms(True)
    evidence = {'profile': profile, 'settings': p, 'probeSha256': digest(__file__),
                'decodedPixels': {}, 'detectors': [], 'ocr': [], 'rawReaderEvents': []}
    original_init = yolox_net.Detector.__init__

    def init(self, variant, weights, imgsz=1280, device=None, half=None):
        original_init(self, variant, weights, imgsz, device=p['device'], half=p['half'])
        parameter = next(self.model.parameters())
        if str(parameter.device).split(':')[0] != p['device']:
            raise RuntimeError('detector device fallback')
        if parameter.dtype != (torch.float16 if p['half'] else torch.float32):
            raise RuntimeError('detector precision differs from requested profile')
        evidence['detectors'].append({'imgsz': imgsz, 'device': str(parameter.device),
                                      'dtype': str(parameter.dtype)})
    yolox_net.Detector.__init__ = init
    onnx_init = yolox_net.OnnxDetector.__init__

    def init_onnx(self, variant, weights, imgsz=1280, threads=0):
        onnx_init(self, variant, weights, imgsz, threads)
        if self.providers != ['CPUExecutionProvider'] or p['backend'] != 'onnx':
            raise RuntimeError('ONNX profile must execute only on CPU')
        evidence['detectors'].append({'imgsz': imgsz, 'device': 'cpu', 'dtype': 'float32',
                                      'providers': self.providers,
                                      'onnxSha256': digest(Path(weights).with_suffix(f'.{imgsz}.onnx'))})
    yolox_net.OnnxDetector.__init__ = init_onnx
    capture = cv2.VideoCapture

    class Capture:
        def __init__(self, *a, **kw):
            self.cap = capture(*a, **kw)

        def __getattr__(self, key):
            return getattr(self.cap, key)

        def remember(self, result):
            ok, frame = result
            if ok:
                key = str(round(self.cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1)
                value = hashlib.sha256(frame.tobytes()).hexdigest()
                old = evidence['decodedPixels'].setdefault(key, value)
                if old != value:
                    raise ValueError('same source frame decoded to different pixels within one profile')
            return result

        def read(self):
            return self.remember(self.cap.read())

        def retrieve(self, *a, **kw):
            return self.remember(self.cap.retrieve(*a, **kw))
    cv2.VideoCapture = Capture

    class ParseqLog:
        def __init__(self, model):
            self.model = model

        def __getattr__(self, key):
            return getattr(self.model, key)

        def __call__(self, images):
            result = self.model(images)
            evidence['rawReaderEvents'].append({'reader': 'PARSeq',
                'pixels': [hashlib.sha256(im.tobytes()).hexdigest() for im in images],
                'reads': [[str(t), float(c)] for t, c in result]})
            return result

    def json_safe(value):
        if hasattr(value, 'tolist'):
            return json_safe(value.tolist())
        if isinstance(value, (list, tuple)):
            return [json_safe(x) for x in value]
        return value

    class EasyLog:
        def __init__(self, model):
            self.model = model

        def __getattr__(self, key):
            return getattr(self.model, key)

        def call(self, method, image, *args, **kwargs):
            result = getattr(self.model, method)(image, *args, **kwargs)
            evidence['rawReaderEvents'].append({'reader': 'EasyOCR.' + method,
                'pixelSha256': hashlib.sha256(image.tobytes()).hexdigest(), 'reads': json_safe(result)})
            return result

        def recognize(self, image, *args, **kwargs):
            return self.call('recognize', image, *args, **kwargs)

        def readtext(self, image, *args, **kwargs):
            return self.call('readtext', image, *args, **kwargs)

    reader_init, reader_read = ocr.NumberReader.__init__, ocr.NumberReader.read

    def init_reader(self, *args, **kwargs):
        reader_init(self, *args, **kwargs)
        devices = [str(next(m.parameters()).device).split(':')[0]
                   for m in (self.parseq, self.easy.recognizer)]
        dtypes = [next(m.parameters()).dtype for m in (self.parseq, self.easy.recognizer)]
        if devices != [p['device'], p['device']]:
            raise RuntimeError('OCR device fallback: ' + str(devices))
        if dtypes != [torch.float32, torch.float32]:
            raise RuntimeError('OCR precision changed: ' + str(dtypes))
        evidence['ocrDevices'] = devices
        evidence['ocrDtypes'] = [str(dtype) for dtype in dtypes]
        self.parseq, self.easy = ParseqLog(self.parseq), EasyLog(self.easy)

    def read(self, image):
        first = len(evidence['rawReaderEvents'])
        result = reader_read(self, image)
        evidence['ocr'].append({'pixelSha256': hashlib.sha256(image.tobytes()).hexdigest(),
                               'result': list(result), 'readerEvents': [first, len(evidence['rawReaderEvents'])]})
        return result
    ocr.NumberReader.__init__, ocr.NumberReader.read = init_reader, read
    return evidence


def run_profile(args):
    from scoutx_tracker.envinfo import environment_metadata, verify_models
    import cv2
    evidence = instrument(args.profile)
    out = Path(args.out_dir)
    diagnostics = out / ('corpus_diagnostics.json' if args.ocr_only else 'precision_diagnostics.json')
    if diagnostics.exists():
        raise ValueError('diagnostic output already exists')
    try:
        if not args.ocr_only:
            import validate_identity_windows as evaluation
            evaluation.WINDOWS = dict(WINDOWS)
            evaluation.fixture_truth = fixture_truth
            if evaluation.main(['--video', args.video, '--out-dir', str(out), '--windows', *args.windows]):
                raise RuntimeError('window validation failed')
        else:
            out.mkdir(exist_ok=True)
        if args.corpus:
            from scoutx_tracker.ocr import shared_reader
            reader = shared_reader()
            evidence['corpusReads'] = []
            for item in json.loads(Path(args.corpus).read_text()):
                if digest(item['path']) != item['fileSha256']:
                    raise ValueError('fixed corpus changed')
                im = cv2.imread(item['path'])
                if im is None or hashlib.sha256(im.tobytes()).hexdigest() != item['pixelSha256']:
                    raise ValueError('fixed corpus pixels differ')
                evidence['corpusReads'].append({**item, 'result': list(reader.read(im))})
        evidence['environment'] = environment_metadata()
        evidence['models'] = verify_models()
        if not evidence['models']['ok']:
            raise RuntimeError('model hashes differ')
        evidence['status'] = 'complete'
    except Exception as error:
        evidence.update(status='failed', error={'type': type(error).__name__, 'message': str(error)})
        raise
    finally:
        out.mkdir(exist_ok=True, parents=True)
        write(diagnostics, evidence)


def detection_agreement(first, second):
    import numpy as np
    import pp_bench
    matched, iou_sum, coordinate_error = 0, 0., 0.
    changes = []
    for frame in sorted(set(first[:, 0]) | set(second[:, 0])):
        a, b = first[first[:, 0] == frame], second[second[:, 0] == frame]
        pairs = sorted(((pp_bench.iou(x[2:6], y[2:6]), i, j)
                        for i, x in enumerate(a) for j, y in enumerate(b)), reverse=True)
        used_a, used_b = set(), set()
        for iou, i, j in pairs:
            if iou < 0.5:
                break
            if i in used_a or j in used_b:
                continue
            used_a.add(i)
            used_b.add(j)
            matched += 1
            iou_sum += iou
            coordinate_error = max(coordinate_error, float(np.max(np.abs(a[i, 2:6] - b[j, 2:6]))))
        if len(used_a) != len(a) or len(used_b) != len(b):
            changes.append({'frame': int(frame), 'unmatchedReference': len(a) - len(used_a),
                            'unmatchedCandidate': len(b) - len(used_b)})
    return {'method': 'Greedy descending IoU, one-to-one, threshold 0.5; person detections',
            'matched': matched, 'reference': len(first), 'candidate': len(second),
            'meanMatchedIoU': iou_sum / matched if matched else None,
            'maxMatchedCoordinateDeltaPx': coordinate_error if matched else None,
            'framesWithUnmatchedDetections': changes}


def compare_profiles(root, windows):
    import numpy as np
    import pp_bench
    from audit_claim_outcomes import audit
    pairs = [('cpu-onnx', 'cpu-torch'), ('gpu-fp16-b8', 'gpu-fp32-b8'),
             ('gpu-fp32-b8', 'gpu-fp32-b1'), ('gpu-fp32-b8', 'gpu-fp32-b8-repeat'),
             ('cpu-torch', 'gpu-fp32-b1')]
    diagnostics = {p: json.loads((root / p / 'precision_diagnostics.json').read_text()) for p in PROFILES}
    cpu_ocr = json.loads((root / 'cpu-onnx/corpus_diagnostics.json').read_text())['corpusReads']
    baseline_ocr = {x['path']: x for x in cpu_ocr}
    gate = pp_bench.load_gate(ROOT / 'bench/gates/balanced_5.2.json')
    result = {'schema': 'pitchproof.fp32-comparison.v1', 'pairs': [], 'fixedCorpusOcr': {},
              'scope': plan()['scope'], 'productionApproval': False}
    for p, d in diagnostics.items():
        if p == 'cpu-onnx':
            continue
        reads = {x['path']: x for x in d['corpusReads']}
        lost = [{'corpusPath': key, 'pixelSha256': val['pixelSha256'], 'cpu': val['result'],
                 'candidate': reads[key]['result'] if key in reads else None}
                for key, val in baseline_ocr.items() if val['result'][0] is not None and
                (key not in reads or reads[key]['result'][0] != val['result'][0])]
        result['fixedCorpusOcr'][p] = {'crops': len(reads), 'cpuAcceptedReadLosses': lost,
                                      'sameCorpus': reads.keys() == baseline_ocr.keys()}
    for first, second in pairs:
        a, b = diagnostics[first]['decodedPixels'], diagnostics[second]['decodedPixels']
        common = set(a) & set(b)
        pixel_diff = [key for key in sorted(common) if a[key] != b[key]]
        entry = {'reference': first, 'candidate': second,
                 'decodedCommonFrames': len(common), 'decodedPixelMismatches': pixel_diff,
                 'decodeValid': bool(common) and not pixel_diff,
                 'decodedOnlyReference': len(set(a) - set(b)),
                 'decodedOnlyCandidate': len(set(b) - set(a)), 'windows': []}
        for window in windows:
            validations = [json.loads((root / p / 'validation.json').read_text()) for p in (first, second)]
            for field in ('codeSha256', 'sourceSha256', 'models'):
                if validations[0][field] != validations[1][field]:
                    raise ValueError('profile provenance differs: ' + field)
            items = [next(i for i in v['results'] if i['window'] == window) for v in validations]
            modes = []
            for ref, cand in zip(items[0]['conditions'], items[1]['conditions']):
                if ref['mode'] != cand['mode']:
                    raise ValueError('identity conditions differ')
                claims = []
                for p in (first, second):
                    with np.load(root / p / window / ref['mode'] / 'timeline.npz') as z:
                        claims.append([[float(t), str(z['states'][i]), z['boxes'][i].tolist()]
                                       for i, t in enumerate(z['times']) if z['present'][i]])
                agreement = pp_bench.claims_agreement(*claims)
                accuracy_gate = pp_bench.evaluate_gate(cand['metrics'], gate, ref['metrics'])
                accuracy_gate['failures'].extend(pp_bench.agreement_failures(agreement, gate))
                accuracy_gate['passed'] = not accuracy_gate['failures']
                _, truth = fixture_truth(window)
                truth['times'] = {k: t - WINDOWS[window][0] for k, t in truth['times'].items()}
                modes.append({'mode': ref['mode'], 'referenceMetrics': ref['metrics'],
                              'candidateMetrics': cand['metrics'],
                              'agreement': agreement, 'accuracyGate': accuracy_gate,
                              'referenceOutcomes': audit(root / first / window / ref['mode'] / 'timeline.npz', truth),
                              'candidateOutcomes': audit(root / second / window / ref['mode'] / 'timeline.npz', truth)})
            with np.load(root / first / window / 'stage1/chunk/detections.npz') as z:
                da = z['dets']
            with np.load(root / second / window / 'stage1/chunk/detections.npz') as z:
                db = z['dets']
            identical = da.shape == db.shape and np.array_equal(da, db)
            entry['windows'].append({'window': window, 'conditions': modes,
                                     'referencePersonDetections': len(da), 'candidatePersonDetections': len(db),
                                     'personDetectionsBitIdentical': bool(identical),
                                     'detectorAgreement': detection_agreement(da, db)})
        result['pairs'].append(entry)
    result['controlledDecodeValid'] = all(x['decodeValid'] for x in result['pairs'])
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--video')
    ap.add_argument('--out-dir', required=True)
    ap.add_argument('--execute', action='store_true')
    ap.add_argument('--expected-commit', help='Required for matrix execution; must match image build metadata')
    ap.add_argument('--profile', choices=PROFILES, help=argparse.SUPPRESS)
    ap.add_argument('--corpus', help=argparse.SUPPRESS)
    ap.add_argument('--ocr-only', action='store_true', help=argparse.SUPPRESS)
    ap.add_argument('--windows', nargs='+', choices=WINDOWS, default=list(WINDOWS))
    ap.add_argument('--budget-sec', type=int, default=5400)
    args = ap.parse_args(argv)
    if args.profile:
        return run_profile(args)
    out = Path(args.out_dir).resolve()
    if out.exists():
        ap.error('new output directory required')
    if not 60 <= args.budget_sec <= 5400:
        ap.error('inference budget must be 60..5400 s; reserve VM time for setup/export/cleanup')
    if args.execute and (not args.video or not args.expected_commit):
        ap.error('--execute requires --video and --expected-commit')
    spec = plan()
    out.mkdir(parents=True)
    write(out / 'plan.json', spec)
    if not args.execute:
        return 0
    if os.environ.get('SCOUTX_GIT_COMMIT') != args.expected_commit or len(args.expected_commit) != 40:
        raise ValueError('image build commit differs from approved 40-character commit')
    import torch
    from scoutx_tracker.envinfo import verify_gpu_providers, verify_models
    if not torch.cuda.is_available() or not verify_models()['ok'] or not verify_gpu_providers()['ok']:
        raise RuntimeError('verified CUDA/model environment required; no automatic CPU-only matrix')
    if digest(args.video) != spec['source']['sha256']:
        raise ValueError('exact original proxy bytes required')
    started = time.monotonic()
    status = {'schema': 'pitchproof.fp32-session.v1', 'status': 'running',
              'startedUtc': datetime.now(timezone.utc).isoformat(), 'profiles': [],
              'probeSha256': digest(__file__), 'budgetSec': args.budget_sec,
              'approvedCommit': args.expected_commit}
    corpus = out / 'ocr_corpus.json'
    try:
        for name in PROFILES:
            commands = [(name, False)]
            if name == 'cpu-onnx':
                commands.append((name, True))
            for profile, only in commands:
                cmd = [sys.executable, str(Path(__file__).resolve()), '--profile', profile,
                       '--video', str(Path(args.video).resolve()), '--out-dir', str(out / profile),
                       '--windows', *args.windows]
                if corpus.exists():
                    cmd += ['--corpus', str(corpus)]
                if only:
                    cmd += ['--ocr-only']
                remaining = args.budget_sec - (time.monotonic() - started)
                if remaining < 1:
                    raise TimeoutError('matrix budget exhausted')
                log = out / (profile + ('-corpus' if only else '') + '.log')
                with log.open('w') as stream:
                    subprocess.run(cmd, env=profile_env(profile), cwd=ROOT, stdout=stream,
                                   stderr=subprocess.STDOUT, check=True, timeout=remaining)
                if name == 'cpu-onnx' and not only:
                    freeze_corpus(out / name, corpus)
            status['profiles'].append(name)
            write(out / 'session.json', status)
        if digest(__file__) != status['probeSha256']:
            raise ValueError('probe code changed during session')
        write(out / 'comparison.json', compare_profiles(out, args.windows))
        status['status'] = 'complete'
    except Exception as error:
        status.update(status='incomplete', error={'type': type(error).__name__, 'message': str(error)})
        raise
    finally:
        status['wallSec'] = time.monotonic() - started
        write(out / 'session.json', status)


if __name__ == '__main__':
    main()
