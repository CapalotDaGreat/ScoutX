"""Claim outcome by state x evidence type over the labelled IMG_4809 intervals (verified basis)."""
import sys,json,numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from pathlib import Path
import interval_scores as isc, pp_bench
from decoder_interval_eval import GT, interval_truth
from collections import Counter
corr=json.loads(Path('/home/claude/work/b53/workers/football-cv/bench/references/gt_time_basis_corrections.json').read_text())
lc=json.loads(Path('/home/claude/work/b53/workers/football-cv/bench/results/5.3/wrong-player-20261102/label_corrections_i0225.json').read_text())
def table(get_tl, corrected=False):
    res=Counter()
    for s,e in json.loads(GT.read_text())['intervals']:
        t=interval_truth(s,e)
        if corrected: t=isc.apply_label_corrections(t,s,lc,GT)
        v=pp_bench.apply_time_basis(t,{**corr,'corrections':[{**c,'intervalsSec':[[s,e]]} for c in corr['corrections']]}) if s>=1150 else t
        tl,ev=get_tl(s,e)
        per=isc.score(tl,v,s)['_per']
        for k,o in per.items():
            i=int(np.argmin(abs(tl['times']-(v['times'][k]-s))))
            if str(tl['states'][i]) in ('LIKELY_VISIBLE','CONFIRMED_VISIBLE'): res[(str(tl['states'][i])[:4],str(ev[i]),o)]+=1
    return res
def full(p):
    z=np.load(p)
    def g(s,e):
        m=(z['times']>=s-1e-6)&(z['times']<e-1e-6)
        return {'times':z['times'][m]-s,'present':z['present'][m],'boxes':z['boxes'][m],'states':z['states'][m]}, z['evidence'][m]
    return g
def interval(d):
    def g(s,e):
        z=np.load(f'{d}/i{int(s):04d}/automatic/timeline.npz')
        return {k:z[k] for k in ('times','present','boxes','states')}, z['evidence']
    return g
out={}
for name,g in [('full_default_base',full('/home/claude/work/fm/work_x0/report/timeline.npz')),('interval_default',interval('/home/claude/work/dval/default')),('interval_reference',interval('/home/claude/work/dval/reference'))]:
    for c in (False,True):
        r=table(g,c); out[f"{name}_{'corrected' if c else 'original'}"]={' / '.join(k):v for k,v in sorted(r.items())}
json.dump(out,open(sys.argv[1],'w'),indent=1)
for k,v in out.items(): print(k); [print('   ',a,b) for a,b in v.items()]
