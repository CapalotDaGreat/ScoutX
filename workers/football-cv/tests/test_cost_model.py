"""2026-11-14: the cost model refuses resumed runs and keeps unverified prices out of totals."""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
PRICES = HERE / "bench/gcp/cost_model_prices_20261114.json"


def _run(tmp_path, timing, extra=()):
    run = {"timing": timing, "input": {"durationSec": 2035.0, "sizeBytes": 1_413_632_177}, "peakRssMiB": 1}
    f = tmp_path / "run.json"
    f.write_text(json.dumps(run))
    return subprocess.run([sys.executable, str(HERE / "bench/cost_model.py"), "--run", str(f), "--prices", str(PRICES), *extra],
                          capture_output=True, text=True)


def test_resumed_run_is_refused(tmp_path):
    r = _run(tmp_path, {"timingComplete": False, "measuredTotalWallSec": 100})
    assert r.returncode == 2 and "not a full measurement" in r.stdout


def test_measured_run_cost_and_unknown_transfer(tmp_path):
    r = _run(tmp_path, {"timingComplete": True, "measuredTotalWallSec": 1853.86})
    d = json.loads(r.stdout)
    assert d["perValidAnalysisUsd"]["transfer"].startswith("UNKNOWN")
    # 1853.86 + 80 s start/load/stop on 8 vCPU / 32 GiB non-zonal, / 0.95 success
    per_sec = 0.0001867 + 8 * 0.000018 + 32 * 0.000002
    assert abs(d["perValidAnalysisUsd"]["cloudRunCompute"] - round((1853.9 * per_sec + 80 * per_sec) / 0.95, 4)) < 2e-3


def test_scenario_override_is_labelled(tmp_path):
    r = _run(tmp_path, {"timingComplete": False}, ("--wall-sec", "1200"))
    assert json.loads(r.stdout)["measured"]["wallSource"] == "scenario --wall-sec"
