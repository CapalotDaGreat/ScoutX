"""Reproducible per-analysis cost model (2026-11-14). Prints ESTIMATES, never an invoice.

    python bench/cost_model.py --run full_match.json --prices bench/gcp/cost_model_prices_20261114.json [--scenario name]

Inputs are kept apart on purpose:
  measured   - wall seconds, peak memory and input size from one benchmark JSON (the run's own `timing`/`stages`);
  prices     - list prices with their official source URL and retrieval date (bench/gcp/cost_model_prices_*.json);
  scenario   - assumptions that were NOT measured (container start, model download, retries, idle minimum instances,
               jobs per month, transfer). Every assumption is printed next to the result.
A run whose `timingComplete` is false (checkpoints reused) is refused: its wall time is not a full measurement.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path


def cloud_run_job(wall_sec: float, p: dict, s: dict) -> dict:
    """One analysis on a Cloud Run GPU instance (instance-based billing: whole instance lifetime, >= 60 s, 100 ms)."""
    life = wall_sec + s["containerStartSec"] + s["modelLoadSec"] + s["shutdownSec"]
    life = max(60.0, math.ceil(life * 10) / 10)
    gpu = p["cloudRunL4UsdPerSec"][s["zonalRedundancy"]]
    per_sec = gpu + s["vcpu"] * p["cloudRunVcpuUsdPerSec"] + s["memGiB"] * p["cloudRunGiBUsdPerSec"]
    return {"billedInstanceSec": round(life, 1), "usd": life * per_sec, "usdPerInstanceSec": per_sec}


def vm_job(wall_sec: float, p: dict, s: dict) -> dict:
    life = wall_sec + s["vmBootSec"] + s["containerStartSec"] + s["modelLoadSec"] + s["shutdownSec"]
    life = max(60.0, life)  # Compute Engine bills per second after the first minute
    return {"billedVmSec": round(life, 1), "usd": life / 3600 * p["vmUsdPerHour"]}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True, help="full-match benchmark JSON with timingComplete true")
    ap.add_argument("--prices", required=True)
    ap.add_argument("--scenario", default="default")
    ap.add_argument("--wall-sec", type=float, help="override measured wall seconds (label the result as a scenario)")
    a = ap.parse_args()
    run = json.loads(Path(a.run).read_text())
    prices = json.loads(Path(a.prices).read_text())
    p, s = prices["prices"], prices["scenarios"][a.scenario]
    timing = run.get("timing") or {}
    if a.wall_sec is None and not timing.get("timingComplete", False):
        print("refused: the run reused checkpoints, so its wall time is not a full measurement (pass --wall-sec to model a scenario)")
        return 2
    wall = float(a.wall_sec if a.wall_sec is not None else timing["measuredTotalWallSec"])
    video_sec = float(run["input"]["durationSec"])
    size_gb = float(run["input"]["sizeBytes"]) / 1e9
    cr = cloud_run_job(wall, p, s)
    vm = vm_job(wall, p, s)
    llm = (s["llmInputTokens"] * p["llmUsdPerMInput"] + s["llmOutputTokens"] * p["llmUsdPerMOutput"]) / 1e6
    transfer = size_gb * (p.get("interRegionTransferUsdPerGb") or 0.0) if s["crossRegion"] else 0.0
    storage = size_gb * p["storageUsdPerGbMonth"] * s["storageDays"] / 30.0
    idle = s["minInstances"] * 3600 * 24 * 30 * (p["cloudRunL4UsdPerSec"][s["zonalRedundancy"]] + s["vcpu"] * p["cloudRunVcpuUsdPerSec"]
                                                  + s["memGiB"] * p["cloudRunGiBUsdPerSec"])
    idle_per_job = idle / max(1, s["jobsPerMonth"])
    retry = 1.0 / max(1e-9, 1.0 - s["failureRate"])  # expected attempts per VALID completed analysis
    capacity_ok = None
    if s["minInstances"] > 0:  # jobs run on the always-on instances: their time is inside the idle charge
        busy = s["jobsPerMonth"] * retry * wall
        capacity_ok = busy <= s["minInstances"] * 3600 * 24 * 30
        cr = {**cr, "usd": 0.0, "note": "covered by the minimum instance(s)" if capacity_ok else "EXCEEDS min-instance capacity"}
    out = {
        "schema": "pitchproof.cost-model.v1",
        "label": "ESTIMATE from list prices x measured or scenario durations - not an invoice, not a quote",
        "measured": {"run": Path(a.run).name, "wallSec": wall, "wallSource": "scenario --wall-sec" if a.wall_sec is not None else "measured",
                     "videoSec": video_sec, "inputGb": round(size_gb, 3), "peakRssMiB": run.get("peakRssMiB")},
        "pricesSource": prices["sources"], "pricesRetrieved": prices["retrieved"],
        "scenario": {"name": a.scenario, **s},
        "perValidAnalysisUsd": {
            "cloudRunCompute": round(cr["usd"] * retry, 4),
            "computeEngineVmCompute": round(vm["usd"] * retry, 4),
            "llm": round(llm * retry, 5),
            "storage": round(storage, 5),
            "transfer": round(transfer * retry, 5) if p.get("interRegionTransferUsdPerGb") is not None else "UNKNOWN (price not verified)",
            "idleMinInstancesShare": round(idle_per_job, 4),
        },
        "cloudRun": cr, "vm": vm, "minInstanceCapacityOk": capacity_ok,
    }
    known = [v for v in out["perValidAnalysisUsd"].values() if isinstance(v, (int, float))]
    out["totalCloudRunUsd"] = round(sum(known) - out["perValidAnalysisUsd"]["computeEngineVmCompute"], 4)
    out["totalVmUsd"] = round(sum(known) - out["perValidAnalysisUsd"]["cloudRunCompute"] - out["perValidAnalysisUsd"]["idleMinInstancesShare"], 4)
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
