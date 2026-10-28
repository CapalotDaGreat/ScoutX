"""Cost summary of one VM benchmark session (5.2): measured pipeline compute per run + VM uptime and its
overheads (driver wait, image build, video download) from timestamps.json, priced with the price list.
ESTIMATES from list prices x measured durations - never an invoice (check the billing export for that).

    python bench/vm_cost.py --timestamps timestamps.json --prices bench/gcp/prices_europe-west6.json \
        --run cpu=/out/cpu/full_match.json --run gpu=/out/gpu/full_match.json --out cost_summary.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pp_bench  # noqa: E402
from full_match_benchmark import vm_overheads  # noqa: E402


def summarise(timestamps: dict, prices: dict, runs: dict[str, dict]) -> dict:
    vm = vm_overheads(timestamps)
    session = pp_bench.cost_breakdown(prices, 0.0, vm=vm)
    out = {"label": "ESTIMATE from list prices x measured durations - not an invoice charge",
           "vmSession": session.get("vm"), "vmUsdPerHour": prices.get("vmUsdPerHour"), "runs": {}}
    for name, rec in runs.items():
        t = rec.get("timing") or {}
        inp = rec.get("input") or {}
        c = pp_bench.cost_breakdown(prices, float(t.get("measuredTotalWallSec") or 0.0),
                                    storage={"gb": round((inp.get("sizeBytes") or 0) / 1e9, 3), "days": 1},
                                    video_sec=inp.get("durationSec") if t.get("timingComplete") else None)
        out["runs"][name] = {"status": rec.get("status"), "timingComplete": t.get("timingComplete"),
                             "device": ((rec.get("configuration") or {}).get("stage1Settings") or {}).get("device"),
                             "measuredComputeSec": c.get("measuredComputeSec"), "computeUsd": c.get("computeUsd"),
                             "recurringPerMatchEstimate": c.get("recurringPerMatchEstimate"),
                             "gatePassed": (rec.get("gate") or {}).get("passed")}
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--timestamps", required=True)
    ap.add_argument("--prices", required=True)
    ap.add_argument("--run", action="append", default=[], help="name=path/to/full_match.json")
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    runs = {}
    for r in a.run:
        name, path = r.split("=", 1)
        if Path(path).is_file():
            runs[name] = json.loads(Path(path).read_text())
    s = summarise(json.loads(Path(a.timestamps).read_text()), json.loads(Path(a.prices).read_text()), runs)
    Path(a.out).write_text(json.dumps(s, indent=2))
    print(json.dumps(s, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
