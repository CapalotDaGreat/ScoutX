"""Score a finished report timeline on the corrected label basis, with anchor_replay's own helpers. argv: tree timeline.npz"""
import json, sys
from pathlib import Path
tree, tl = sys.argv[1], Path(sys.argv[2])
sys.path[:0] = [tree + "/bench", tree]
import numpy as np, pp_bench
from audit_claim_outcomes import audit
R = tree
gt0 = json.loads(Path(R + "/bench/results/5.1/gt_img4809_intervals.json").read_text())
gt = pp_bench.apply_time_basis(gt0, json.loads(Path(R + "/bench/references/gt_time_basis_corrections.json").read_text()))
with np.load(tl, allow_pickle=False) as z:
    claims = [[round(float(z["times"][k]), 2), str(z["states"][k]), [round(float(v), 1) for v in z["boxes"][k]]] for k in range(len(z["times"])) if z["present"][k]]
for name, g in (("stored", gt0), ("corrected", gt)):
    acc = pp_bench.accuracy(claims, g, (1920, 1080)); o = audit(tl, g)
    print(name, json.dumps({"wrongSec": acc["wrongIdentitySec"], "confWrongSec": acc["confirmedWrongIdentitySec"], "target": o["targetVisibleLabelledFrames"], "wrongP": o["allLabelledFrames"].get("wrongPlayerClaim", 0), "sha": o["timelineSha256"][:16]}))
