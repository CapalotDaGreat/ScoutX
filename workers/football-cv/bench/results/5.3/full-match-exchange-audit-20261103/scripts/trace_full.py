"""Attribute full-match claim differences (baseline vs candidate) to tracklets and exchange cuts. Diagnostic only."""
import json, sys, glob
from pathlib import Path
import numpy as np
sys.path[:0] = ['/home/claude/work/b53/workers/football-cv', '/home/claude/work/b53/workers/football-cv/bench']
from pp_bench import iou
from scoutx_tracker import crossings
from scoutx_tracker.tracklets import load_runs
from scoutx_tracker.analyze import det_of_crop, cached_tracklets
W = Path('/home/claude/work/fm/work_x0')
dirs = sorted(str(p) for p in (W / 'stage1').glob('c_0000?'))
D = load_runs(dirs)
cache = json.load(open(W / 'stage1' / 'ocr_cache.json'))
det_of = det_of_crop(D)
reads = {det_of[k]: v[0] for k, v in cache.items() if v and v[0] and k in det_of}
tl0, tl1 = dict(np.load(W / 'report' / 'timeline.npz')), dict(np.load('/home/claude/work/fm/work_x1/report/timeline.npz'))
spans = [tuple(map(float, s.split('-'))) for s in sys.argv[1:]]
out = {}
for flag in (False, True):
    crossings.EXCHANGE_SPLIT = flag
    T = cached_tracklets(D, 'orange', 'white', reads, Path(f'/tmp/claude-0/-home-claude/b32eec01-4a17-5138-8211-afb12a28de6c/scratchpad/tf{int(flag)}'))
    R = T.rows; tl = tl1 if flag else tl0
    res = []
    for a, b in spans:
        tids = {}
        for i in np.where((tl['times'] >= a - 1e-6) & (tl['times'] <= b + 1e-6))[0]:
            if not tl['present'][i]: continue
            f = int(round(tl['times'][i] * 10))
            ix = np.where(R[:, 0] == f)[0]
            if not len(ix): continue
            j = max(ix, key=lambda q: iou(R[q, 3:7], tl['boxes'][i]))
            if iou(R[j, 3:7], tl['boxes'][i]) >= 0.9:
                tids.setdefault(int(R[j, 2]), []).append((round(float(tl['times'][i]), 1), str(tl['states'][i])[:4], str(tl['evidence'][i])[:8]))
        info = {}
        for tid, cl in tids.items():
            ix = np.where(R[:, 2] == tid)[0]
            rd = {round(float(R[q, 1]), 1): reads[int(R[q, 8])] for q in ix if int(R[q, 8]) in reads}
            info[tid] = {'span': [round(float(R[ix, 1].min()), 1), round(float(R[ix, 1].max()), 1)], 'reads': rd,
                         'claims': [cl[0], cl[-1], len(cl)], 'links': [(l.pre, l.post, round(l.t, 1), l.decision, l.clear) for l in T.links if tid in (l.pre, l.post)]}
        res.append({'span': [a, b], 'tracklets': info})
    out['cand' if flag else 'base'] = res
    print('cand' if flag else 'base', json.dumps(res, default=str)[:3000])
json.dump(out, open('/home/claude/work/fm/an/trace_full.json', 'w'), indent=1, default=str)
