"""Compare two finished full-match benchmark runs offline (5.3): comparability, accuracy gate relative
to the reference, per-frame agreement, speed-up and per-chunk stage-1 speed. Used when the reference
(normally CPU) finishes after the candidate (normally GPU), so the gate could not be applied live.

    python bench/compare_runs.py --reference cpu/full_match.json --candidate gpu/full_match.json \
        --gate bench/gates/balanced_5.2.json --out comparison.json

Exit codes: 0 gate passed, 3 gate failed, 5 not comparable, 7 reference incomplete (only partial
per-chunk speed comparison possible - never presented as a full comparison).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pp_bench  # noqa: E402


def chunk_speed(ref: dict, cand: dict) -> list[dict]:
    """Per-chunk stage-1 wall time where BOTH runs measured the same chunk (not resumed)."""
    rc = {c["index"]: c for c in ((ref.get("stages") or {}).get("extraction") or {}).get("chunks", [])}
    out = []
    for c in ((cand.get("stages") or {}).get("extraction") or {}).get("chunks", []):
        r = rc.get(c["index"])
        if r and r.get("status") == "extracted" and c.get("status") == "extracted" and c.get("wallSec"):
            out.append({"index": c["index"], "startSec": c["startSec"], "endSec": c["endSec"], "referenceSec": r["wallSec"],
                        "candidateSec": c["wallSec"], "speedup": round(r["wallSec"] / c["wallSec"], 2),
                        "referenceStages": r.get("stageSeconds"), "candidateStages": c.get("stageSeconds")})
    return out


def compare(ref: dict, cand: dict, ref_claims: list | None, cand_claims: list | None, gate: dict | None) -> tuple[dict, int]:
    why = pp_bench.comparable(cand, ref)
    out: dict = {"reference": {"status": ref.get("status"), "device": (ref.get("configuration") or {}).get("stage1Settings", {}).get("device")},
                 "candidate": {"status": cand.get("status"), "device": (cand.get("configuration") or {}).get("stage1Settings", {}).get("device")},
                 "notComparable": why, "chunkSpeed": chunk_speed(ref, cand)}
    if why:
        return out, 5
    tr, tc = ref.get("timing") or {}, cand.get("timing") or {}
    full = ref.get("status") in ("complete", "gate_failed") and cand.get("status") in ("complete", "gate_failed") \
        and tr.get("timingComplete") and tc.get("timingComplete")
    if tr.get("measuredTotalWallSec") and tc.get("measuredTotalWallSec") and full:
        out["speedup"] = round(tr["measuredTotalWallSec"] / tc["measuredTotalWallSec"], 2)
    if ref.get("status") not in ("complete", "gate_failed") or not ref.get("accuracy"):
        out["result"] = "INCOMPLETE: the reference run did not finish - only per-chunk stage-1 speed is compared"
        return out, 7
    if cand.get("status") not in ("complete", "gate_failed") or not cand.get("accuracy"):
        out["result"] = "INCOMPLETE: the candidate run did not finish or has no accuracy results"
        return out, 7
    if ref_claims is not None and cand_claims is not None:
        out["agreement"] = pp_bench.claims_agreement(ref_claims, cand_claims)
    if gate:
        g = pp_bench.evaluate_gate(cand.get("accuracy") or {}, gate, ref.get("accuracy"))
        g["failures"].extend(pp_bench.agreement_failures(out.get("agreement"), gate))
        g["passed"] = not g["failures"]
        out["gate"] = g
        out["result"] = "PASSED" if g["passed"] else "FAILED"
        return out, 0 if g["passed"] else 3
    out["result"] = "compared (no gate)"
    return out, 0


def _claims(rec_path: Path, rec: dict) -> list | None:
    f = rec_path.parent / ((rec.get("claimsFile") or {}).get("file") or "")
    return json.loads(f.read_text()) if f.is_file() else None


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--candidate", required=True)
    ap.add_argument("--gate", default=None)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    rp, cp = Path(a.reference), Path(a.candidate)
    if not rp.is_file() or not cp.is_file():
        Path(a.out).write_text(json.dumps({"result": "INCOMPLETE: a run produced no JSON", "reference": rp.is_file(),
                                           "candidate": cp.is_file()}, indent=2))
        return 7
    ref, cand = json.loads(rp.read_text()), json.loads(cp.read_text())
    res, rc = compare(ref, cand, _claims(rp, ref), _claims(cp, cand), json.loads(Path(a.gate).read_text()) if a.gate else None)
    res["exitCode"] = rc
    Path(a.out).write_text(json.dumps(res, indent=2, default=str))
    print(json.dumps({k: res.get(k) for k in ("result", "speedup", "notComparable", "exitCode")}, indent=2))
    return rc


if __name__ == "__main__":
    sys.exit(main())
