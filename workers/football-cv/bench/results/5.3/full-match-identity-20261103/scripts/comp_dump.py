"""Replay with a hook on states.frame_states: dump per-frame competitor sources in given windows. Diagnostic."""
import sys, json, numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from pathlib import Path
from scoutx_tracker import states
import full_match_replay as fmr
out=Path(sys.argv[1]); wins=[tuple(map(float,w.split('-'))) for w in sys.argv[2:]]
dump=[]
real=states.frame_states
def fs(T, res, tl, *a, **k):
    st, comp = real(T, res, tl, *a, **k)
    chosen=set(res.chosen); rec=[]
    for (a0,b0) in wins:
        fr=[i for i in range(len(tl.times)) if a0<=tl.times[i]<=b0]
        srcs={}
        for kk, sc in res.score.items():
            if kk in chosen or sc < states.COMPETITOR: continue
            rows=T.rows[T.by_tid[T.summary[kk]["tid"]]]
            f=set(rows[:,0].astype(int)) & set(fr)
            if f: srcs[int(T.summary[kk]['tid'])]={'score':round(float(sc),3),'frames':[int(min(f)),int(max(f))],'t':[round(float(rows[:,1].min()),1),round(float(rows[:,1].max()),1)],
                     'app':round(float(res.appearance_score.get(kk,np.nan)),3) if hasattr(res,'appearance_score') else None}
        ch=[ (int(T.summary[kk]['tid']), round(float(res.score.get(kk,np.nan)),3), round(float(res.confidence.get(kk,np.nan)),3) if hasattr(res,'confidence') else None) for kk in res.chosen
             if T.summary[kk]['t1']>=a0 and T.summary[kk]['t0']<=b0]
        rec.append({'win':[a0,b0],'competitors':srcs,'chosen':ch,
                    'conf':[round(float(np.asarray(tl.conf)[i]),3) for i in fr][::5],'comp':[round(float(comp[i]),3) for i in fr][::5],
                    'states':[str(st[i])[:4] for i in fr][::5]})
    dump.append(rec)
    return st, comp
states.frame_states=fs
fmr.run(Path('/home/claude/work/fmr/replay'), out, Path(sys.argv[0]).parent/'NONE' if False else None)
json.dump(dump,open(str(out)+'.comp.json','w'),indent=1,default=float)
print(json.dumps(dump[-1],indent=0)[:4000])
