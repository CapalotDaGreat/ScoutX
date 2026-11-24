"""Offline A/B/C parity: A->B permits layout, B->C scheduling, A->C both. Never runs inference.

python bench/compare_b26.py --a A/record.json --b B/record.json --c C/record.json \
    --ground-truth labels.json --reference-sha256 <frozen-A-record-hash> --out comparison.json

Exit 0 passed, 3 accuracy/agreement failed, 5 invalid/not comparable, 7 missing/incomplete input.
The older same-layout comparator and its comparability rules are deliberately unchanged.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from scoutx_tracker.b26_export import (  # noqa: E402
    CLAIMS_SCHEMA, SCHEMA, digest, file_digest, local_file, number, sha, validate_frames, validate_metadata, validate_plan,
)
from bench import pp_bench  # noqa: E402


def load_bundle(path: Path) -> dict:
    r = json.loads(path.read_text(encoding="utf-8"))
    if r.get("schema") != SCHEMA or r.get("status") != "complete":
        raise ValueError("not a complete B-26 export (legacy/downsampled records are not full claims)")
    if r.get("provenanceKind") != "server-attested-context-and-verified-checkpoints" or any(
        not sha(r.get(k)) for k in ("contextSha256", "checkpointSourceSha256", "reportSummarySha256")
    ):
        raise ValueError("missing export provenance")
    validate_metadata(r["metadata"])
    validate_plan(r["segmentPlan"], r["metadata"]["input"]["durationSec"])
    if r.get("segmentPlanSha256") != digest(r["segmentPlan"]):
        raise ValueError("segment plan hash mismatch")
    if r.get("schedule") not in {"sequential", "orchestrated"}:
        raise ValueError("missing explicit schedule")
    descriptor = r["claimsFile"]
    claims = local_file(path.parent, descriptor["file"])
    if file_digest(claims) != descriptor["sha256"]:
        raise ValueError("claims hash mismatch")
    data = json.loads(claims.read_text(encoding="utf-8"))
    if data.get("schema") != CLAIMS_SCHEMA:
        raise ValueError("not a full-claims sidecar")
    frames = validate_frames(data["frames"], r["metadata"])
    if type(descriptor["frames"]) is not int or descriptor["frames"] != len(frames):
        raise ValueError("claims frame count mismatch")
    return {"record": r, "recordSha256": file_digest(path),
            "claims": [[t, state, box if present else []] for t, state, box, present in frames]}


def different(a, b, prefix="metadata") -> list[str]:
    if isinstance(a, dict) and isinstance(b, dict):
        out = []
        for key in sorted(set(a) | set(b)):
            if key not in a or key not in b:
                out.append(prefix + "." + key)
            else:
                out.extend(different(a[key], b[key], prefix + "." + key))
        return out
    return [] if a == b and type(a) is type(b) else [prefix]


def compare_pair(a: dict, b: dict, gt: dict, gate: dict, allowed: set[str]) -> tuple[dict, int]:
    ra, rb = a["record"], b["record"]
    why = different(ra["metadata"], rb["metadata"])
    if "layout" not in allowed and ra["segmentPlan"] != rb["segmentPlan"]:
        why.append("segmentPlan differs")
    if "schedule" not in allowed and ra["schedule"] != rb["schedule"]:
        why.append("schedule differs")
    out = {"referenceSha256": a["recordSha256"], "candidateSha256": b["recordSha256"],
           "referencePlanSha256": ra["segmentPlanSha256"], "candidatePlanSha256": rb["segmentPlanSha256"],
           "allowedChanges": sorted(allowed), "notComparable": why}
    if why:
        return {**out, "result": "NOT_COMPARABLE"}, 5
    dims = ra["metadata"]["input"]
    labels = ra["metadata"]["groundTruth"]
    size = (dims["width"], dims["height"])
    gt_size = (labels["width"], labels["height"])
    aa = pp_bench.accuracy(a["claims"], gt, size, gt_size=gt_size)
    ab = pp_bench.accuracy(b["claims"], gt, size, gt_size=gt_size)
    agreement = pp_bench.claims_agreement(a["claims"], b["claims"])
    g = pp_bench.evaluate_gate(ab, gate, aa)
    if not aa.get("claimedCorrectSec") or not aa.get("targetLabelledSec"):
        g["failures"].append("reference has no correctly claimed labelled target evidence")
    # Both the baseline and candidate must meet the absolute rules; never inherit stored accuracy.
    g["failures"].extend("reference: " + f for f in pp_bench.evaluate_gate(aa, gate)["failures"])
    g["failures"].extend(pp_bench.agreement_failures(agreement, gate))
    g["passed"] = not g["failures"]
    return {**out, "referenceAccuracy": aa, "candidateAccuracy": ab, "agreement": agreement,
            "gate": g, "result": "PASSED" if g["passed"] else "FAILED"}, 0 if g["passed"] else 3


def compare_all(paths: list[Path], truth: Path, gate_path: Path, reference_sha256: str,
                corrections: Path | None = None) -> tuple[dict, int]:
    if len(paths) != 3:
        raise ValueError("exactly three A/B/C exports required")
    bundles = [load_bundle(p) for p in paths]
    if not sha(reference_sha256) or bundles[0]["recordSha256"] != reference_sha256:
        raise ValueError("A record differs from the frozen reference hash")
    gt = json.loads(truth.read_text(encoding="utf-8"))
    if not number(gt.get("fps")) or gt["fps"] <= 0:
        raise ValueError("invalid ground truth fps")
    ground_truth = {"sha256": file_digest(truth), "timeBasis": file_digest(corrections) if corrections else "unshifted"}
    for bundle in bundles:
        recorded = bundle["record"]["metadata"]["groundTruth"]
        if any(recorded.get(k) != v for k, v in ground_truth.items()):
            raise ValueError("ground truth/time basis differs from frozen metadata")
    if corrections:
        gt = pp_bench.apply_time_basis(gt, json.loads(corrections.read_text(encoding="utf-8")))
    gate = json.loads(gate_path.read_text(encoding="utf-8"))
    # Refuse vacuous gates: the authoritative file must contain all three kinds of rules.
    if any(not gate.get(k) for k in ("absolute", "relativeToBaseline", "agreementWithBaseline")):
        raise ValueError("incomplete gate")
    results, codes = {}, []
    for label, i, j, allowed in (("A_to_B", 0, 1, {"layout"}), ("B_to_C", 1, 2, {"schedule"}),
                                  ("A_to_C", 0, 2, {"layout", "schedule"})):
        results[label], code = compare_pair(bundles[i], bundles[j], gt, gate, allowed)
        codes.append(code)
    code = 5 if 5 in codes else 3 if 3 in codes else 0
    return {"schema": "pitchproof.b26.parity.v1", "gateSha256": file_digest(gate_path),
            "groundTruth": ground_truth, "comparisons": results,
            "result": "PASSED" if code == 0 else "NOT_COMPARABLE" if code == 5 else "FAILED", "exitCode": code}, code


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    for name in ("a", "b", "c", "ground-truth", "reference-sha256", "out"):
        ap.add_argument("--" + name, required=True)
    ap.add_argument("--corrections")
    args = ap.parse_args(argv)
    gate = ROOT / "bench/gates/balanced_5.2.json"
    # Never destroy frozen evidence (including sidecars) when writing the result.
    output = Path(args.out).resolve()
    inputs = [Path(p) for p in (args.a, args.b, args.c, args.ground_truth)] + [gate]
    if args.corrections:
        inputs.append(Path(args.corrections))
    if output in {p.resolve() for p in inputs} or any(output.parent == Path(p).resolve().parent for p in (args.a, args.b, args.c)):
        print(json.dumps({"result": "NOT_COMPARABLE", "exitCode": 5, "reason": "output must be outside frozen export bundles and inputs"}))
        return 5
    try:
        result, code = compare_all([Path(args.a), Path(args.b), Path(args.c)], Path(args.ground_truth), gate,
                                   args.reference_sha256, Path(args.corrections) if args.corrections else None)
    except FileNotFoundError:
        result, code = {"result": "INCOMPLETE", "reason": "missing export/claims/labels input", "exitCode": 7}, 7
    except (ValueError, KeyError, TypeError, OSError) as error:
        result, code = {"result": "NOT_COMPARABLE", "reason": str(error), "exitCode": 5}, 5
    Path(args.out).write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    print(json.dumps({"result": result["result"], "exitCode": code}))
    return code


if __name__ == "__main__":
    sys.exit(main())
