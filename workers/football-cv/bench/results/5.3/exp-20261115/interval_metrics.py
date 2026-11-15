"""Per-interval acquisition delay and fragmentation from a timeline (corrected label basis). argv: tree timeline.npz..."""
import json, sys
from pathlib import Path
tree = sys.argv[1]; sys.path[:0] = [tree + "/bench", tree]
import numpy as np, pp_bench
from audit_claim_outcomes import classify_claim
gt = pp_bench.apply_time_basis(json.loads(Path(tree + "/bench/results/5.1/gt_img4809_intervals.json").read_text()),
                               json.loads(Path(tree + "/bench/references/gt_time_basis_corrections.json").read_text()))
for tl in sys.argv[2:]:
    z = np.load(tl); times = z["times"]; rows = []
    for i, (a, b) in enumerate(gt["intervals"]):
        fr = sorted(((gt["times"][k], v) for k, v in gt["frames"].items() if a <= gt["times"][k] <= b and any(x["label"] == "T" for x in v)), key=lambda x: x[0])
        if not fr: continue
        outs = []
        for t, labels in fr:
            j = int(np.argmin(abs(times - t))); claim = (str(z["states"][j]), z["boxes"][j]) if z["present"][j] else None
            outs.append((t, classify_claim(claim, labels)))
        first = fr[0][0]; acq = next((t - first for t, o in outs if o == "correctClaim"), None)
        segs = sum(1 for k, (t, o) in enumerate(outs) if o == "correctClaim" and (k == 0 or outs[k - 1][1] != "correctClaim" or t - outs[k - 1][0] > 0.15))
        rows.append(f"i{i}:{len(fr)}f acq={'-' if acq is None else round(acq,1)}s segs={segs}")
    print(Path(tl).parts[-4] if 'work' in tl else Path(tl).parts[-4], ' '.join(rows))
