import json,sys,glob
from pathlib import Path
import numpy as np
res={}
for d in sorted(glob.glob('/home/claude/work/gen/out/*_x[01]')+glob.glob('/home/claude/work/gen/out/*_B')):
    d=Path(d); tls=list(d.rglob('automatic/timeline.npz'))
    if not tls: res[d.name]='no timeline'; continue
    with np.load(tls[0]) as z: st=z['states'].astype(str); ev=z['evidence'].astype(str); t=z['times']
    cl=np.isin(st,['CONFIRMED_VISIBLE','LIKELY_VISIBLE'])
    from collections import Counter
    res[d.name]=dict(frames=len(st),states=dict(Counter(st)),claims=int(cl.sum()),claimTimes=[round(float(x),1) for x in t[cl]][:40],evidence=dict(Counter(ev[cl])))
for k,v in res.items(): print(k,v)
json.dump(res,open('/home/claude/work/dval/an/clips.json','w'),indent=1)
