"""Label-only contact sheets for the i0225 annotation review (no predictions drawn). Local only."""
import sys, json, cv2, numpy as np
sys.path[:0]=['/home/claude/work/b53/workers/football-cv/bench','/home/claude/work/b53/workers/football-cv']
from decoder_interval_eval import interval_truth
V='/home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4'
s0,s1,step=int(sys.argv[1]),int(sys.argv[2]),int(sys.argv[3]); x0,y0,x1,y1=[int(v) for v in sys.argv[4].split(',')]; out=sys.argv[5]
t=interval_truth(225,255)
cap=cv2.VideoCapture(V); cap.set(cv2.CAP_PROP_POS_FRAMES, s0-5)
f=s0-5; tiles=[]
col={'T':(0,255,0),'N':(0,0,255),'?':(0,255,255)}
while f<=s1:
    ok,im=cap.read(); 
    if not ok: break
    if f>=s0 and (f-s0)%step==0:
        k=str(f-2250); im=im.copy()
        for i,lab in enumerate(t['frames'].get(k,[])):
            b=[int(v) for v in lab['box']]
            cv2.rectangle(im,(b[0],b[1]),(b[2],b[3]),col[lab['label']],2)
            cv2.putText(im,f"{lab['label']}{i}",(b[0],b[1]-4),cv2.FONT_HERSHEY_SIMPLEX,0.6,col[lab['label']],2)
        c=im[y0:y1,x0:x1]; sc=2 if (x1-x0)<500 else 1
        c=cv2.resize(c,None,fx=sc,fy=sc,interpolation=cv2.INTER_CUBIC)
        cv2.putText(c,f"src {f} w{f-2250}",(5,22),cv2.FONT_HERSHEY_SIMPLEX,0.7,(255,255,255),2)
        tiles.append(c)
    f+=1
cols=3; h,w=tiles[0].shape[:2]
rows=[np.hstack(tiles[i:i+cols]+[np.zeros_like(tiles[0])]*(cols-len(tiles[i:i+cols]))) for i in range(0,len(tiles),cols)]
cv2.imwrite(out,np.vstack(rows))
print(out,len(tiles))
