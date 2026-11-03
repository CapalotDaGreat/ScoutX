"""Replay hook on analyze.resolve_identity: per tracklet, appearance score / score / chain / evidence, and the
labels it covers (IMG_4809 labelled intervals, verified time basis). Diagnostic only."""
import sys, json, numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from pathlib import Path
from scoutx_tracker import analyze as an
from pp_bench import iou
import full_match_replay as fmr
out=Path(sys.argv[1])
gt=json.load(open('/home/claude/work/b53/workers/football-cv/bench/results/5.1/gt_img4809_intervals.json'))
lab_by_frame={}
for k,labs in gt['frames'].items():
    f=int(k); shift=1 if f>=11500 else 0          # labels >= 1150 s stamped 0.1 s early -> timeline frame = f - 1
    lab_by_frame[f-shift]=labs
dump=[]
real=an.resolve_identity
def ri(summary, reads, target, fps, rows, by_tid, *a, **k):
    res=real(summary, reads, target, fps, rows, by_tid, *a, **k)
    chosen=set(res.chosen); rec=[]
    fr=rows[:,0].astype(int)
    for i,s in enumerate(summary):
        ix=by_tid[s['tid']]; labs={'T':0,'N':0,'?':0}
        for j in ix:
            L=lab_by_frame.get(int(fr[j]))
            if not L: continue
            b=max(L,key=lambda x:iou(rows[j,3:7],x['box']))
            if iou(rows[j,3:7],b['box'])>=0.5: labs[b['label']]+=1
        rec.append({'tid':int(s['tid']),'t':[round(float(s['t0']),1),round(float(s['t1']),1)],'n':int(len(ix)),
                    'hmed':round(float(s.get('h_med',0)),1),'app':round(float(res.appearance_score.get(i,np.nan)),4),
                    'score':round(float(res.score.get(i,np.nan)),4),'chosen':i in chosen,'evidence':res.evidence.get(i),
                    'labels':labs,'reads':[n for _,n,_,_ in reads.get(s['tid'],[])]})
    dump.append(rec); return res
an.resolve_identity=ri
fmr.run(Path('/home/claude/work/fmr/replay'), out)
json.dump(dump[-1],open(str(out)+'.sep.json','w'),default=float)
