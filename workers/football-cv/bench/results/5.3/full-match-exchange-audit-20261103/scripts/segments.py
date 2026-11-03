import numpy as np, json, sys
out={}
for tag,p in (('base','/home/claude/work/fm/work_x0/report/timeline.npz'),('cand','/home/claude/work/fm/work_x1/report/timeline.npz')):
    z=np.load(p); st=z['states'].astype(str); ev=z['evidence'].astype(str)
    cl=np.where(np.isin(st,['CONFIRMED_VISIBLE','LIKELY_VISIBLE']))[0]
    segs=[]
    for i in cl:
        if segs and z['times'][i]-z['times'][segs[-1][-1]]<=1.0: segs[-1].append(int(i))
        else: segs.append([int(i)])
    out[tag]=[{'t0':round(float(z['times'][s[0]]),1),'t1':round(float(z['times'][s[-1]]),1),'n':len(s),
               'conf':int(sum(st[i]=='CONFIRMED_VISIBLE' for i in s)),'evidence':sorted(set(ev[s])),
               'mid':round(float(z['times'][s[len(s)//2]]),1),'box':[int(v) for v in z['boxes'][s[len(s)//2]]]} for s in segs]
    print(tag,len(cl),'claims',len(segs),'segments')
json.dump(out,open('/home/claude/work/fm/an/segments.json','w'),indent=1)
for s in out['base']: print(s['t0'],s['t1'],s['n'],s['conf'],s['evidence'])
