import json,sys,numpy as np
sys.path.insert(0,'.');sys.path.insert(0,'bench')
import pp_bench
from decoder_interval_eval import interval_truth
from scoutx_tracker.tracklets import load_runs
from scoutx_tracker.analyze import det_of_crop,cached_tracklets
from pathlib import Path
run,start,f0,f1=sys.argv[1],float(sys.argv[2]),int(sys.argv[3]),int(sys.argv[4])
D=load_runs([run+'/stage1/chunk']);cache=json.load(open(run+'/stage1/ocr_cache.json'))
det_of=det_of_crop(D);reads={det_of[k]:v[0] for k,v in cache.items() if v[0] and k in det_of}
T=cached_tracklets(D,'orange','white',reads,Path('/tmp/claude-0/-home-claude/b32eec01-4a17-5138-8211-afb12a28de6c/scratchpad'))
truth=interval_truth(start,start+30);lab={round(truth['times'][k]-start,1):truth['frames'][k] for k in truth['frames']}
tl=np.load(run+'/automatic/timeline.npz');R=T.rows
rows=[]
for f in range(f0,f1+1):
  t=round(f/10,1);i=int(np.argmin(np.abs(tl['times']-t)));st=str(tl['states'][i]);ev=str(tl['evidence'][i])
  labs=lab.get(t,[]);tb=[l['box'] for l in labs if l['label']=='T']
  ix=np.where(R[:,0]==f)[0]
  ttid=None
  if tb and len(ix):
    r=max(ix,key=lambda q:pp_bench.iou(R[q,3:7],tb[0]));ttid=int(R[r,2]) if pp_bench.iou(R[r,3:7],tb[0])>=0.5 else -1
  ctid=None;cl=None
  if tl['present'][i]:
    b=tl['boxes'][i]
    if len(ix):
      r=max(ix,key=lambda q:pp_bench.iou(R[q,3:7],b));ctid=int(R[r,2]) if pp_bench.iou(R[r,3:7],b)>=0.9 else None
    cl=sorted([(round(pp_bench.iou(b,l['box']),2),l['label']) for l in labs],reverse=True)[:2]
  rows.append((f,st[:4],ev[:8],'claimTid',ctid,'labels',cl,'targetTid',ttid))
for r in rows: print(*r)
print('links',[ (l.pre,l.post,round(l.t,1),l.decision,l.margin) for l in T.links if f0/10-1<=l.t<=f1/10+1])
