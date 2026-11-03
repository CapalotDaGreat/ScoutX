import sys,cv2,numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from decoder_interval_eval import interval_truth
t=interval_truth(225,255)
V='/home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4'
req=[(int(a.split(':')[0]),int(a.split(':')[1])) for a in sys.argv[2:]]  # srcframe:labelindex
cap=cv2.VideoCapture(V); s0=min(f for f,_ in req); cap.set(cv2.CAP_PROP_POS_FRAMES,s0-5); f=s0-5; tiles=[]
need={}
for fr,i in req: need.setdefault(fr,[]).append(i)
while f<=max(need):
    ok,im=cap.read()
    if f in need:
        for i in need[f]:
            lab=min(t['frames'][str(f-2250)],key=lambda L:abs(L['box'][0]-i)); i=t['frames'][str(f-2250)].index(lab); x0,y0,x1,y1=[int(v) for v in lab['box']]
            c=im[max(0,y0-10):y1+10,max(0,x0-10):x1+10]; c=cv2.resize(c,(240,int(240*c.shape[0]/c.shape[1])),interpolation=cv2.INTER_CUBIC)
            c=cv2.copyMakeBorder(c,30,0,0,0,cv2.BORDER_CONSTANT); cv2.putText(c,f"{f} {lab['label']}{i}",(4,22),0,0.7,(255,255,255),2); tiles.append(c)
    f+=1
H=max(x.shape[0] for x in tiles); tiles=[cv2.copyMakeBorder(x,0,H-x.shape[0],0,0,cv2.BORDER_CONSTANT) for x in tiles]
cv2.imwrite(sys.argv[1],np.hstack(tiles))
