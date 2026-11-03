import numpy as np, sys, json
def load(p): return dict(np.load(p))
P={'resume_cold':'/home/claude/work/fm/work_x2c/report/timeline.npz','base':'/home/claude/work/fm/work_x0/report/timeline.npz','cand_warm':'/home/claude/work/fm/work_x1/report/timeline.npz',
   'cand_cold':'/home/claude/work/fm/work_x1c/report/timeline.npz','base_warm':'/home/claude/work/fmr/base_warm.timeline.npz'}
T={k:load(v) for k,v in P.items()}
CL=('CONFIRMED_VISIBLE','LIKELY_VISIBLE')
def claims(z): return np.isin(z['states'].astype(str),CL)
def iou(a,b):
    x1,y1=max(a[0],b[0]),max(a[1],b[1]);x2,y2=min(a[2],b[2]),min(a[3],b[3]);i=max(0,x2-x1)*max(0,y2-y1)
    return i/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i+1e-9)
def diff(a,b):
    A,B=T[a],T[b];ca,cb=claims(A),claims(B);t=A['times']
    d=[i for i in range(len(t)) if ca[i]!=cb[i] or (ca[i] and (A['states'][i]!=B['states'][i] or iou(A['boxes'][i],B['boxes'][i])<0.5))]
    segs=[]
    for i in d:
        if segs and t[i]-t[segs[-1][-1]]<=1.0: segs[-1].append(i)
        else: segs.append([i])
    out={'pair':f'{a}->{b}','claims':[int(ca.sum()),int(cb.sum())],'confirmed':[int((A['states'].astype(str)=='CONFIRMED_VISIBLE').sum()),int((B['states'].astype(str)=='CONFIRMED_VISIBLE').sum())],
         'framesDiffering':len(d),'segments':[]}
    for s in segs:
        from collections import Counter
        out['segments'].append({'t':[round(float(t[s[0]]),1),round(float(t[s[-1]]),1)],'n':len(s),
          a:dict(Counter(str(A['states'][i])[:4] if ca[i] else '-' for i in s)), b:dict(Counter(str(B['states'][i])[:4] if cb[i] else '-' for i in s))})
    return out
res=[diff('base','resume_cold'),diff('base','cand_cold'),diff('base','base_warm'),diff('base_warm','cand_warm'),diff('base','cand_warm')]
json.dump(res,open('/home/claude/work/fmr/cmp.json','w'),indent=1)
for r in res:
    print(r['pair'],'claims',r['claims'],'conf',r['confirmed'],'diff',r['framesDiffering'])
    for s in r['segments']: print('   ',s)
