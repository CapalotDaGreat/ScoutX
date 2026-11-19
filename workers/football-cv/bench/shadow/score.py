"""Predeclared scoring for the two-match shadow evaluation (rules frozen by hash in the freeze record).

    python3 bench/shadow/score.py --plan plan.json --labels labels.csv --run NAME=timeline.npz ... --out scores.json
        [--changed-against NAME]

Labels (labels.csv, one row per planned frame; see labels_template.csv): state is one of
  target_visible (box x,y,w,h in proxy pixels required), absent, occluded, uncertain.
Per frame and run, the claim is the timeline sample within 0.05 s (no sample -> missing_output):
  claim = present and state in {CONFIRMED_VISIBLE, LIKELY_VISIBLE}
Outcomes (each split by claim state CONFIRMED / LIKELY where a claim exists):
  target_visible: correct (IoU >= 0.5) | wrong_player (IoU < 0.5: the claim is on someone or something else)
                  | abstain (no claim)  - abstentions stay in the recall denominator
  absent/occluded: claim_without_target (a claim when the labeller saw no target) | no_claim
  uncertain:      unverified_claim | no_claim   - never scored as correct or wrong
Reported per run and per sampling method (fixed, difficult, sequence, all):
  recall = correct / target_visible frames;  claim precision = correct / (correct + wrong_player + claim_without_target)
  wrong-player CONFIRMED and LIKELY counts, unverified claims, abstentions, missing output, and all denominators.
--changed-against lists every frame whose outcome differs from that run (post-run review, reported separately
from the predeclared scores; reviewing it never changes them).
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

import numpy as np

CLAIM = {"CONFIRMED_VISIBLE", "LIKELY_VISIBLE"}
STATES = {"target_visible", "absent", "occluded", "uncertain"}


def iou(a: list[float], b: list[float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix, iy = max(0.0, min(ax + aw, bx + bw) - max(ax, bx)), max(0.0, min(ay + ah, by + bh) - max(ay, by))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def load_labels(path: Path) -> list[dict]:
    rows = []
    with path.open(newline="") as f:
        for r in csv.DictReader(f):
            st = r["state"].strip()
            if st not in STATES:
                raise SystemExit(f"label {r['sample_id']}: state {st!r} not in {sorted(STATES)}")
            box = None
            if st == "target_visible":
                try:
                    box = [float(r[k]) for k in ("box_x", "box_y", "box_w", "box_h")]
                except (KeyError, ValueError):
                    raise SystemExit(f"label {r['sample_id']}: target_visible needs box_x, box_y, box_w, box_h")
            rows.append({"id": r["sample_id"], "method": r["method"], "t": float(r["proxy_t"]), "state": st, "box": box,
                         "labeller": r.get("labeller", ""), "labellerRole": r.get("labeller_role", ""),
                         "exposure": r.get("exposure", "")})
    return rows


def outcome(z, lab: dict) -> tuple[str, str]:
    t = z["times"]
    j = int(np.argmin(np.abs(t - lab["t"])))
    if abs(float(t[j]) - lab["t"]) > 0.051:
        return "missing_output", ""
    st = str(z["states"][j])
    claim = bool(z["present"][j]) and st in CLAIM
    box = [float(x) for x in z["boxes"][j][:4]]
    if lab["state"] == "target_visible":
        if not claim:
            return "abstain", st
        return ("correct" if iou(box, lab["box"]) >= 0.5 else "wrong_player"), st
    if lab["state"] == "uncertain":
        return ("unverified_claim" if claim else "no_claim"), st
    return ("claim_without_target" if claim else "no_claim"), st


def summarise(items: list[tuple[dict, tuple[str, str]]]) -> dict:
    c = Counter(o for _, (o, _) in items)
    by_state = Counter(f"{o}:{s}" for _, (o, s) in items if s in CLAIM)
    tv = sum(1 for lab, _ in items if lab["state"] == "target_visible")
    claims_scored = c["correct"] + c["wrong_player"] + c["claim_without_target"]
    return {
        "frames": len(items), "targetVisible": tv,
        "labelStates": dict(Counter(lab["state"] for lab, _ in items)),
        "outcomes": dict(c), "claimsByState": dict(by_state),
        "wrongPlayerConfirmed": by_state["wrong_player:CONFIRMED_VISIBLE"], "wrongPlayerLikely": by_state["wrong_player:LIKELY_VISIBLE"],
        "claimWithoutTargetConfirmed": by_state["claim_without_target:CONFIRMED_VISIBLE"],
        "recall": round(c["correct"] / tv, 4) if tv else None, "recallDenominator": tv,
        "claimPrecision": round(c["correct"] / claims_scored, 4) if claims_scored else None, "claimPrecisionDenominator": claims_scored,
        "abstainOnVisibleTarget": c["abstain"], "unverifiedClaims": c["unverified_claim"], "missingOutput": c["missing_output"],
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", required=True)
    ap.add_argument("--labels", required=True)
    ap.add_argument("--run", action="append", required=True, help="NAME=timeline.npz")
    ap.add_argument("--out", required=True)
    ap.add_argument("--changed-against")
    a = ap.parse_args()
    plan = json.loads(Path(a.plan).read_text())
    labels = load_labels(Path(a.labels))
    planned = {round(t, 2) for t in plan["fixed"]} | {round(t, 2) for s in plan["sequences"] for t in s["frames"]}
    missing_labels = sorted(planned - {round(lab["t"], 2) for lab in labels if lab["method"] in ("fixed", "sequence")})
    runs = {}
    per_frame = {}
    for spec in a.run:
        name, path = spec.split("=", 1)
        z = np.load(path)
        items = [(lab, outcome(z, lab)) for lab in labels]
        per_frame[name] = {lab["id"]: o for lab, o in items}
        runs[name] = {"timeline": path, "timelineSha256": hashlib.sha256(Path(path).read_bytes()).hexdigest(),
                      "all": summarise(items),
                      **{m: summarise([x for x in items if x[0]["method"] == m]) for m in ("fixed", "difficult", "sequence")}}
    out = {"schema": "pitchproof.shadow-scores.v1", "group": plan["group"], "scoringRulesSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
           "labelsSha256": hashlib.sha256(Path(a.labels).read_bytes()).hexdigest(), "plannedFramesWithoutLabel": missing_labels,
           "labellers": sorted({(lab["labeller"], lab["labellerRole"], lab["exposure"]) for lab in labels}), "runs": runs}
    if a.changed_against:
        base = per_frame[a.changed_against]
        out["postRunChangedClaims"] = {n: [{"id": k, "t": next(l["t"] for l in labels if l["id"] == k), "base": list(base[k]), "run": list(v)}
                                           for k, v in pf.items() if v != base[k]] for n, pf in per_frame.items() if n != a.changed_against}
    Path(a.out).write_text(json.dumps(out, indent=1))
    print(json.dumps({n: {k: r["all"][k] for k in ("recall", "claimPrecision", "wrongPlayerConfirmed", "wrongPlayerLikely")} for n, r in runs.items()}))


if __name__ == "__main__":
    main()
