"""Slice a full-match timeline.npz into window-local per-interval dirs that bench/interval_scores.py can score."""
import sys, json, numpy as np
from pathlib import Path
src, out = Path(sys.argv[1]), Path(sys.argv[2])
g = json.load(open('/home/claude/work/b53/workers/football-cv/bench/results/5.1/gt_img4809_intervals.json'))
z = dict(np.load(src, allow_pickle=False))
for s, e in g['intervals']:
    m = (z['times'] >= s - 1e-6) & (z['times'] < e - 1e-6)
    d = out / f"i{int(s):04d}" / "automatic"; d.mkdir(parents=True, exist_ok=True)
    sl = {k: (v[m] if getattr(v, 'shape', ()) and len(v) == len(z['times']) else v) for k, v in z.items()}
    sl['times'] = z['times'][m] - s
    np.savez(d / "timeline.npz", **sl)
    print(s, int(m.sum()))
