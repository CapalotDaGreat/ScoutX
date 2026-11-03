"""Replay with a hook on analyze.resolve_identity: dump the tracklets (span, raw track, reads, exclusion, candidacy)
whose rows overlap a time window. Diagnostic only."""
import sys, json, numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from pathlib import Path
from scoutx_tracker import analyze as an
import full_match_replay as fmr
out=Path(sys.argv[1]); a0,b0=map(float,sys.argv[2].split('-'))
dump=[]
RR=np.load('/home/claude/work/fm/work_x0/stage1/trackrows_68067827eec6e618.npy'); RAW={int(d):int(t) for t,d in zip(RR[:,2],RR[:,8])}
real=an.resolve_identity
def ri(summary, reads, target, fps, rows, by_tid, *a, **k):
    res=real(summary, reads, target, fps, rows, by_tid, *a, **k)
    ex=getattr(res,'excluded',{}) or {}
    rec=[]
    for i,s in enumerate(summary):
        if s['t1']<a0 or s['t0']>b0: continue
        ix=by_tid[s['tid']]; r=rows[ix]
        rec.append({'tid':int(s['tid']),'t':[round(float(s['t0']),1),round(float(s['t1']),1)],'n':int(len(ix)),
                    'rawTracks':sorted({RAW.get(int(d),-1) for d in r[:,8]}),
                    'reads':[(round(f/10,1),num,round(float(c),2)) for f,num,c,_ in reads.get(s['tid'],[])],
                    'excluded':ex.get(i) or ex.get(int(s['tid'])),'chosen':i in set(res.chosen),
                    'score':round(float(res.score.get(i,np.nan)),3)})
    dump.append(rec); return res
an.resolve_identity=ri
fmr.run(Path('/home/claude/work/fmr/replay'), out)
json.dump(dump,open(str(out)+'.tl.json','w'),indent=1,default=float)
