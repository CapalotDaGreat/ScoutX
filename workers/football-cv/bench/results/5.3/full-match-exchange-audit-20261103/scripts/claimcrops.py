import cv2,numpy as np,sys
z=np.load(sys.argv[1]); out=sys.argv[2]; ts=[float(x) for x in sys.argv[3:]]
cap=cv2.VideoCapture('/home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4'); tiles=[]
for t in ts:
    f=int(round(t*10)); cap.set(cv2.CAP_PROP_POS_FRAMES,f-3); 
    for _ in range(4): ok,im=cap.read()
    ok_=np.where(np.isin(z['states'].astype(str),['CONFIRMED_VISIBLE','LIKELY_VISIBLE']))[0]; i=int(ok_[np.argmin(np.abs(z['times'][ok_]-t))]); t=float(z['times'][i]); f=int(round(t*10)); cap.set(cv2.CAP_PROP_POS_FRAMES,f-3)
    for _ in range(4): ok,im=cap.read()
    b=[int(v) for v in z['boxes'][i]]; h=b[3]-b[1]
    x0,y0,x1,y1=max(0,b[0]-h),max(0,b[1]-h//3),min(1920,b[2]+h),min(1080,b[3]+h//4)
    im=im.copy(); cv2.rectangle(im,(b[0],b[1]),(b[2],b[3]),(0,0,255),2)
    c=cv2.resize(im[y0:y1,x0:x1],(300,int(300*(y1-y0)/max(1,x1-x0))))
    c=cv2.copyMakeBorder(c,24,0,0,0,0); cv2.putText(c,f"{t:.1f}s {str(z['states'][i])[:4]} {str(z['evidence'][i])[:6]}",(3,18),0,0.5,(255,255,255),1); tiles.append(c)
H=max(x.shape[0] for x in tiles); tiles=[cv2.copyMakeBorder(x,0,H-x.shape[0],0,0,0) for x in tiles]
rows=[np.hstack(tiles[i:i+5]+[np.zeros_like(tiles[0])]*(5-len(tiles[i:i+5]))) for i in range(0,len(tiles),5)]
cv2.imwrite(out,np.vstack(rows))
