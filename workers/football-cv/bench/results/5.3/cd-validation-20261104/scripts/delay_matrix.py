"""Acquisition delay, lost/gained identities and total claims per interval, baseline vs candidate (verified basis)."""
import json, sys
from pathlib import Path
import numpy as np
B=Path('/home/claude/work/b53/workers/football-cv/bench'); sys.path[:0]=[str(B),str(B.parent)]
import pp_bench, interval_scores as isc
from decoder_interval_eval import GT, interval_truth, key
pairs=[a.split('=') for a in sys.argv[1:]]   # name=basedir:canddir
corr=json.loads((B/'references'/'gt_time_basis_corrections.json').read_text())
out={}
for s,e in json.loads(GT.read_text())['intervals']:
    k=key(s); truth=interval_truth(s,e)
    v=pp_bench.apply_time_basis(truth,{**corr,'corrections':[{**c,'intervalsSec':[[s,e]]} for c in corr['corrections']]}) if s>=1150 else truth
    tgt=sorted([kk for kk in v['frames'] if any(x['label']=='T' for x in v['frames'][kk])],key=int)
    for name,dirs in pairs:
        bd,cd=dirs.split(':'); r={}
        if not (Path(cd)/k/'automatic'/'timeline.npz').exists(): out.setdefault(k,{})[name]='missing'; continue
        for tag,d in (('base',bd),('cand',cd)):
            tl=isc.load_timeline(Path(d)/k); per=isc.score(tl,v,s)['_per']
            corr_t=[v['times'][kk] for kk in tgt if per[kk]=='correctClaim']
            r[tag]=dict(per=per,first=(min(corr_t)-v['times'][tgt[0]]) if corr_t else None,
                        claims=int(np.isin(tl['states'].astype(str),['CONFIRMED_VISIBLE','LIKELY_VISIBLE']).sum()),
                        confirmed=int((tl['states'].astype(str)=='CONFIRMED_VISIBLE').sum()))
        lost=[int(kk) for kk in tgt if r['base']['per'][kk]=='correctClaim' and r['cand']['per'][kk]!='correctClaim']
        gained=[int(kk) for kk in tgt if r['cand']['per'][kk]=='correctClaim' and r['base']['per'][kk]!='correctClaim']
        from collections import Counter as C
        trans=C(f"{r['base']['per'][kk]}->{r['cand']['per'][kk]}" for kk in v['frames'] if r['base']['per'][kk]!=r['cand']['per'][kk])
        out.setdefault(k,{})[name]=dict(transitionsAllLabelled=dict(trans),targetFrames=len(tgt),firstCorrectDelaySec={t:(round(r[t]['first'],1) if r[t]['first'] is not None else None) for t in r},
            claimsAllFrames={t:r[t]['claims'] for t in r},confirmedAllFrames={t:r[t]['confirmed'] for t in r},
            lostCorrectTargetFrames=lost,gainedCorrectTargetFrames=gained)
json.dump(out,open('/home/claude/work/rplout2/delay_matrix.json','w'),indent=1)
for k,x in out.items(): print(k,json.dumps(x))
