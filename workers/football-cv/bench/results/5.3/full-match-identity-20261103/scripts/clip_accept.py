import sys, json, numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from pathlib import Path
from scoutx_tracker import states, identity
import regression_replay as rr
out=Path(sys.argv[2]); a0,b0=map(float,sys.argv[3].split('-')); rec={}
realc=identity._best_chain
import inspect
def chain(cands, unary, t0, t1, *a, **k):
    res=realc(cands, unary, t0, t1, *a, **k); L=inspect.currentframe().f_back.f_locals
    rec['mode']=L.get('mode'); rec['positives']=[(round(float(t0[i]),1),round(float(t1[i]),1)) for i in L['positives']]
    rec['chain']=[(int(L['summary'][i]['tid']),round(float(t0[i]),1),round(float(t1[i]),1),round(float(L['app'][i]),3),round(float(L['rel'][i]),3)) for i in res[0] if t1[i]>=a0 and t0[i]<=b0]
    return res
identity._best_chain=chain
real=states.frame_states
def fs(T,res,tl,*a,**k):
    st,comp=real(T,res,tl,*a,**k)
    fr=[i for i in range(len(tl.times)) if a0<=tl.times[i]<=b0]
    rec['frames']=[(round(float(tl.times[i]),1),str(st[i])[:4],str(np.asarray(tl.evidence)[i]),round(float(np.asarray(tl.conf)[i]),3),round(float(comp[i]),3)) for i in fr]
    return st,comp
states.frame_states=fs
rr.run(Path(sys.argv[1]),out)
print(json.dumps(rec,indent=0))
