import json,sys,numpy as np
sys.path[:0]=['.','bench']
from scoutx_tracker.tracklets import load_runs
from scoutx_tracker.analyze import det_of_crop,cached_tracklets
from pathlib import Path
run=sys.argv[1]; tids=[int(x) for x in sys.argv[2].split(',')]; f0,f1=int(sys.argv[3]),int(sys.argv[4])
D=load_runs([run+'/stage1/chunk']);cache=json.load(open(run+'/stage1/ocr_cache.json'))
det_of=det_of_crop(D);reads={det_of[k]:v[0] for k,v in cache.items() if v[0] and k in det_of}
T=cached_tracklets(D,'orange','white',reads,Path('/tmp/claude-0/-home-claude/b32eec01-4a17-5138-8211-afb12a28de6c/scratchpad'))
print([a for a in dir(T) if not a.startswith('_')])
R=T.rows
for tid in tids:
    ix=np.where(R[:,2]==tid)[0]; fr=R[ix,0].astype(int)
    print('tracklet',tid,'frames',fr.min(),fr.max(),'n',len(ix), 'reads',{int(R[i,0]):reads.get(int(R[i,8])) for i in ix if reads.get(int(R[i,8]))})
    for i in ix:
        if f0<=R[i,0]<=f1: print('  ',int(R[i,0]),[int(v) for v in R[i,3:7]],'det',int(R[i,8]))
print('links:')
for l in T.links:
    if l.pre in tids or l.post in tids: print('  ',l)
