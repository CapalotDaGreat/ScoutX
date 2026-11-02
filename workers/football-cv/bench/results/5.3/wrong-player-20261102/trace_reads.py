import json,sys,numpy as np
sys.path.insert(0,'.');sys.path.insert(0,'bench')
import pp_bench
from decoder_interval_eval import interval_truth
from scoutx_tracker.tracklets import load_runs
from scoutx_tracker.analyze import det_of_crop
run,start,num=sys.argv[1],float(sys.argv[2]),sys.argv[3]
D=load_runs([run+'/stage1/chunk']);cache=json.load(open(run+'/stage1/ocr_cache.json'))
truth=interval_truth(start,start+30)
lab_at={round(truth['times'][k]-start,1):truth['frames'][k] for k in truth['frames']}
det_of=det_of_crop(D)
for k,v in sorted(cache.items()):
  if v[0]!=num or k not in det_of: continue
  d=det_of[k];f=int(D.dets[d,0]);t=round(f/10,1);box=D.dets[d,2:6]
  labs=lab_at.get(t,[]);ious=sorted([(round(pp_bench.iou(box,l['box']),2),l['label']) for l in labs],reverse=True)[:3]
  print(k,'frame',f,'t',t,'read',v,'h',round(box[3]-box[1]),'label IoUs',ious)
v=json.load(open(run+'/../validation.json'));it=[x for x in v['results'] if abs(x['intervalSec'][0]-start)<1e-6][0]
for s in it.get('discoverySightings',[]):
  t=round(s['t']-start,1);labs=lab_at.get(t,[]);print('sighting t',s['t'],'conf',s['conf'],'frames',s['frames'],'label IoUs',sorted([(round(pp_bench.iou(s['box'],l['box']),2),l['label']) for l in labs],reverse=True)[:3])
