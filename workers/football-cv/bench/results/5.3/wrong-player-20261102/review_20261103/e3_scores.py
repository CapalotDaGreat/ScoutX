"""Replay i0225 (reference) and dump identity-solver terms for tracklets in a time span. Diagnostic only."""
import sys, json, inspect, numpy as np
sys.path[:0]=['bench','.']
from pathlib import Path
from scoutx_tracker import identity
import regression_replay as rr
dump=[]
real=identity._best_chain
def wrapped(cands, unary, t0, t1, *a, **k):
    L=inspect.currentframe().f_back.f_locals
    out=real(cands, unary, t0, t1, *a, **k)
    chosen=set(out[0])
    rows=[]
    for i in cands:
        if t1[i]>=float(sys.argv[3]) and t0[i]<=float(sys.argv[4]):
            rows.append(dict(tid=int(L['summary'][i]['tid']), t0=round(float(t0[i]),1), t1=round(float(t1[i]),1),
                             dur=round(float(L['dur'][i]),2), app=round(float(L['app'][i]),3), rel=round(float(L['rel'][i]),3),
                             unary=round(float(unary[i]),2), chosen=i in chosen, positive=i in L['positives']))
    dump.append({'mode':L.get('mode'),'rows':rows})
    return out
identity._best_chain=wrapped
rr.run(Path(sys.argv[1]), Path(sys.argv[2]))
for d in dump[-1:]:
    print(d['mode']); [print(r) for r in sorted(d['rows'],key=lambda r:r['t0'])]
