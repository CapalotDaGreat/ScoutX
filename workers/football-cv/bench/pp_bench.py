"""5.2 benchmark library: identity accuracy, executable accuracy gates, CPU-vs-GPU run comparison
and the cost model. Pure functions (no GPU, no network) so every rule is unit-tested.

Accuracy definitions (frame level, against interval ground truth in the format of
bench/results/5.1/gt_img4809_intervals.json; claims are (t, state, box) of CONFIRMED/LIKELY frames):
  * a claimed frame is matched to the labelled box it overlaps most (IoU >= 0.5);
  * matched to the target ("T")                  -> correct;
  * matched to another player ("N") and the claimed box does NOT also overlap the target's box
    (IoU < OVERLAP_IOU)                           -> WRONG IDENTITY (a real misattribution);
  * matched to "N" while the claimed box also overlaps the target's box (two players overlapping,
    the box sits between them)                    -> OVERLAP-AMBIGUOUS (the annotation cannot decide);
  * "?" labels and unlabelled boxes are excluded.
"""

from __future__ import annotations

import bisect
import json
from pathlib import Path

CLAIM = ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")
OVERLAP_IOU = 0.3


def iou(a, b) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    i = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    u = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i
    return i / u if u > 0 else 0.0


def accuracy(claims: list, gt: dict, size: tuple[int, int], gt_size: tuple[int, int] = (1920, 1080), tol: float = 0.051) -> dict:
    sx, sy = gt_size[0] / size[0], gt_size[1] / size[1]
    claims = sorted(claims, key=lambda c: c[0])
    ts = [c[0] for c in claims]
    fps = float(gt.get("fps", 10.0))
    tgt = correct = wrong = ambiguous = conf_wrong = conf_correct = 0
    wrong_t: list[float] = []
    for fs, labels in gt["frames"].items():
        t = float(gt["times"][fs])
        tgt += any(x["label"] == "T" for x in labels)
        k = bisect.bisect_left(ts, t - tol)
        c = claims[k] if k < len(claims) and abs(claims[k][0] - t) <= tol else None
        if c is None or c[1] not in CLAIM:
            continue
        box = [c[2][0] * sx, c[2][1] * sy, c[2][2] * sx, c[2][3] * sy]
        best = max(labels, key=lambda x: iou(box, x["box"]), default=None)
        if best is None or iou(box, best["box"]) < 0.5:
            continue
        if best["label"] == "T":
            correct += 1
            conf_correct += c[1] == "CONFIRMED_VISIBLE"
        elif best["label"] == "N":
            if any(x["label"] == "T" and iou(box, x["box"]) >= OVERLAP_IOU for x in labels):
                ambiguous += 1
            else:
                wrong += 1
                conf_wrong += c[1] == "CONFIRMED_VISIBLE"
                wrong_t.append(round(t, 1))
    idf1 = 2 * correct / (2 * correct + wrong + ambiguous + (tgt - correct)) if tgt else None
    return {"targetLabelledSec": round(tgt / fps, 1), "claimedCorrectSec": round(correct / fps, 1),
            "confirmedCorrectSec": round(conf_correct / fps, 1),
            "wrongIdentitySec": round(wrong / fps, 1), "confirmedWrongIdentitySec": round(conf_wrong / fps, 1),
            "overlapAmbiguousSec": round(ambiguous / fps, 1),
            "falseAttributionSec": round((wrong + ambiguous) / fps, 1),   # 5.1/5.2 report definition (both)
            "claimedRecall": round(correct / tgt, 3) if tgt else None,
            "IDF1": round(idf1, 3) if idf1 is not None else None,
            "wrongIdentityTimes": wrong_t[:50]}


# ---------------------------------------------------------------- gates

def load_gate(path: str | Path) -> dict:
    return json.loads(Path(path).read_text())


def evaluate_gate(acc: dict, gate: dict, baseline: dict | None = None) -> dict:
    """Absolute rules (`max` / `min` on accuracy fields) and, with a baseline accuracy block of the
    reference run (same recording + ground truth), relative rules (`maxDrop` / `maxRise`)."""
    failures, checks = [], []
    for field, rule in gate.get("absolute", {}).items():
        v = acc.get(field)
        if v is None:
            failures.append(f"{field}: missing")
            continue
        if "max" in rule and v > rule["max"]:
            failures.append(f"{field} = {v} > max {rule['max']}")
        if "min" in rule and v < rule["min"]:
            failures.append(f"{field} = {v} < min {rule['min']}")
        checks.append(field)
    if baseline is not None:
        for field, rule in gate.get("relativeToBaseline", {}).items():
            v, b = acc.get(field), baseline.get(field)
            if v is None or b is None:
                failures.append(f"{field}: missing in run or baseline")
                continue
            if "maxDrop" in rule and b - v > rule["maxDrop"] + 1e-9:
                failures.append(f"{field} dropped {b} -> {v} (> {rule['maxDrop']})")
            if "maxRise" in rule and v - b > rule["maxRise"] + 1e-9:
                failures.append(f"{field} rose {b} -> {v} (> {rule['maxRise']})")
            checks.append(f"{field} vs baseline")
    return {"gate": gate.get("name"), "passed": not failures, "failures": failures, "checked": checks,
            "baselineUsed": baseline is not None}


# ---------------------------------------------------------------- run comparison

COMPARABLE_KEYS = (("input", "videoStreamSha256"), ("target",), ("configuration", "chunkSec"), ("configuration", "mode"),
                   ("environment", "engineVersion"), ("models", "files"), ("groundTruth", "sha256"))


def _get(d: dict, path: tuple):
    for k in path:
        if not isinstance(d, dict):
            return None
        d = d.get(k)
    return d


def _model_digests(rec: dict) -> dict | None:
    f = _get(rec, ("models", "files"))
    return {k: v.get("sha256") for k, v in f.items()} if isinstance(f, dict) else None


def comparable(a: dict, b: dict) -> list[str]:
    """Reasons two benchmark records are NOT comparable (empty list = comparable). Device, backend and
    batch may differ - that is what is being compared; everything that defines the task may not."""
    out = []
    for path in COMPARABLE_KEYS:
        va, vb = (_model_digests(a), _model_digests(b)) if path == ("models", "files") else (_get(a, path), _get(b, path))
        if va is None or vb is None:
            out.append(f"{'.'.join(path)} missing")
        elif va != vb:
            out.append(f"{'.'.join(path)} differs")
    sa, sb = _get(a, ("configuration", "stage1Settings")), _get(b, ("configuration", "stage1Settings"))
    if sa and sb:
        for k in ("SCOUTX_DETECTOR", "SCOUTX_KEYFRAME_EVERY", "SCOUTX_PROP_SCORE_CAP", "SCOUTX_OCR_ENHANCE"):
            if sa["env"].get(k) != sb["env"].get(k):
                out.append(f"stage1Settings.env.{k} differs")
        for k in ("imgsz", "stride", "discoveryImgsz"):
            if sa.get(k) != sb.get(k):
                out.append(f"stage1Settings.{k} differs")
    return out


def claims_agreement(ca: list, cb: list, tol: float = 0.051) -> dict:
    """Frame-level agreement of two claim timelines: same state, and for claimed frames the same box."""
    bt = sorted(cb, key=lambda c: c[0])
    ts = [c[0] for c in bt]
    n = same_state = both_claim = same_box = only_a = only_b = 0
    for t, s, box in ca:
        k = bisect.bisect_left(ts, t - tol)
        o = bt[k] if k < len(bt) and abs(bt[k][0] - t) <= tol else None
        if o is None:
            continue
        n += 1
        same_state += s == o[1]
        ca_, cb_ = s in CLAIM, o[1] in CLAIM
        if ca_ and cb_:
            both_claim += 1
            same_box += iou(box, o[2]) >= 0.5
        only_a += ca_ and not cb_
        only_b += cb_ and not ca_
    return {"framesCompared": n, "stateAgreement": round(same_state / n, 4) if n else None,
            "boxAgreementWhenBothClaim": round(same_box / both_claim, 4) if both_claim else None,
            "claimedOnlyInFirst": only_a, "claimedOnlyInSecond": only_b}


# ---------------------------------------------------------------- cost

def cost_breakdown(prices: dict | None, measured_compute_sec: float, vm: dict | None = None, storage: dict | None = None,
                   transfer: dict | None = None, video_sec: float | None = None, per_match_sec: tuple = (2040, 5400, 8400)) -> dict:
    """Every number here is an ESTIMATE from list prices x measured durations - never an invoice.
    prices: {"vmUsdPerHour": float, "storageUsdPerGbMonth": float, "egressUsdPerGb": float, "source": str, "retrieved": str}
    vm: {"uptimeSec": float (boot -> results uploaded), "imageBuildSec", "driverWaitSec", "videoDownloadSec"}
    storage: {"gb": float, "days": float}; transfer: {"gbEgress": float} (same-region GCS -> VM is free)."""
    if not prices or prices.get("vmUsdPerHour") is None:
        return {"status": "not_calculated", "reason": "no price list / rate supplied",
                "measuredComputeSec": round(measured_compute_sec, 1)}
    if measured_compute_sec < 0 or prices["vmUsdPerHour"] < 0:
        raise ValueError("durations and prices must be nonnegative")
    rate = float(prices["vmUsdPerHour"])
    usd = lambda sec: round(sec * rate / 3600, 4)  # noqa: E731
    out = {"status": "estimate", "label": "ESTIMATE from list prices x measured durations - not an invoice charge",
           "currency": "USD", "prices": prices,
           "measuredComputeSec": round(measured_compute_sec, 1), "computeUsd": usd(measured_compute_sec)}
    if vm:
        up = float(vm.get("uptimeSec") or 0)
        out["vm"] = {"uptimeSec": round(up, 1), "uptimeUsd": usd(up),
                     "overheadSec": {k: round(float(vm[k]), 1) for k in ("imageBuildSec", "driverWaitSec", "videoDownloadSec") if vm.get(k) is not None},
                     "notIncluded": "VM provisioning before boot and deletion after upload (billed, typically < 2 min)"}
        out["vm"]["overheadUsd"] = usd(sum(out["vm"]["overheadSec"].values()))
    if storage:
        gbm = float(storage["gb"]) * float(storage["days"]) / 30.0
        out["storage"] = {**storage, "usd": round(gbm * float(prices.get("storageUsdPerGbMonth") or 0.0), 4)}
    if transfer:
        out["transfer"] = {**transfer, "usd": round(float(transfer.get("gbEgress", 0.0)) * float(prices.get("egressUsdPerGb") or 0.0), 4),
                           "note": "same-region Cloud Storage -> VM reads are not charged; only egress counts"}
    if video_sec:
        per_sec = measured_compute_sec / video_sec
        out["recurringPerMatchEstimate"] = {
            "basis": "measured compute seconds per video second on THIS recording x match length; warm worker with the "
                     "image already built (no VM boot/build); excludes storage, queueing and idle capacity",
            "computeSecPerVideoSec": round(per_sec, 4),
            **{f"{int(s // 60)}min": {"computeSec": round(per_sec * s, 1), "usd": usd(per_sec * s)} for s in per_match_sec}}
    return out
