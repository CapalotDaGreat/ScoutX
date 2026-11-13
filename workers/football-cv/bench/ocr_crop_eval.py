"""Offline jersey-reader comparison on the crops a stage-1 run already saved (2026-11-14 experiment E2).

    python bench/ocr_crop_eval.py --stage1 <work>/stage1 --ground-truth bench/results/5.1/gt_img4809_intervals.json \
        --time-basis bench/references/gt_time_basis_corrections.json --out ocr_eval.json [--limit N]

Every saved person crop whose detection matches a labelled box (IoU >= 0.5, same frame time on the corrected label
time basis) is read by:
  * baseline  - scoutx_tracker.ocr NumberReader.read (binarised masks; the production reader),
  * colour    - colour_agreement_read (colour torso/shorts regions, same two-recogniser acceptance rule),
  * combined  - baseline first, colour only when baseline abstains, abstain on a conflict (as combined_read).

Labels: T = the target (#20), N = another orange player (same kit), ? = unsure (excluded). The crop is attached to its
detection, so this measures RECOGNITION on correctly associated crops; association errors are a separate question
(the identity replay). A "20" read on an N crop is the dangerous error: it would put the target's number on a
team-mate. Results are per crop and per labelled piece (a piece is one continuous labelled player track, so frames
of one piece are not independent votes). No images or crops are written to the output; crop SHA-256 only.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import pp_bench  # noqa: E402
from scoutx_tracker.ocr import colour_agreement_read, shared_reader  # noqa: E402


def iou(a, b) -> float:
    x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    ua = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / ua if ua > 0 else 0.0


def combine(base: tuple, colour: tuple) -> tuple:
    """Same rule as scoutx_tracker.ocr.combined_read."""
    if base[0] is not None and colour[0] is not None and colour[0] != base[0]:
        return (None, 0.0, None)
    return base if base[0] is not None else colour


def labelled_crops(stage1: Path, gt: dict) -> list[dict]:
    by_time: dict[float, list[dict]] = defaultdict(list)
    for k, boxes in gt["frames"].items():
        t = round(float(gt["times"][k]), 1)
        for b in boxes:
            if b["label"] in ("T", "N"):
                by_time[t].append(b)
    out = []
    for chunk in sorted(stage1.glob("c_*")):
        d = np.load(chunk / "detections.npz")
        dets = d["dets"]
        crops = {p.name: p for p in (chunk / "crops").glob("*.jpg")}
        for name, path in crops.items():
            fi, di = (int(x) for x in name[:-4].split("_"))
            row = dets[di]
            if int(row[0]) != fi:
                raise SystemExit(f"{chunk.name}/{name}: crop index does not match its detection row")
            t = round(float(row[1]), 1)
            labels = by_time.get(t)
            if not labels:
                continue
            box = [float(v) for v in row[2:6]]
            best = max(labels, key=lambda b: iou(box, b["box"]))
            if iou(box, best["box"]) < 0.5:
                continue
            out.append({"chunk": chunk.name, "crop": name, "path": str(path), "t": t, "label": best["label"],
                        "piece": best["piece"], "boxHeightPx": round(box[3] - box[1], 1),
                        "iou": round(iou(box, best["box"]), 3)})
    return sorted(out, key=lambda r: (r["t"], r["crop"]))


def summarise(rows: list[dict], reader: str, number: str) -> dict:
    s = {"T": defaultdict(int), "N": defaultdict(int)}
    pieces: dict[tuple, set] = defaultdict(set)
    for r in rows:
        v = r["reads"][reader]["number"]
        lab = r["label"]
        if v is None:
            kind = "none"
        elif lab == "T":
            kind = "correct" if v == number else "wrongNumber"
        else:
            kind = "targetNumberOnOtherPlayer" if v == number else "otherNumber"
        s[lab][kind] += 1
        s[lab]["crops"] += 1
        pieces[(lab, r["piece"])].add(kind)
    per_piece = {"T": defaultdict(int), "N": defaultdict(int)}
    for (lab, _), kinds in pieces.items():
        per_piece[lab]["pieces"] += 1
        for k in kinds - {"none"}:
            per_piece[lab]["piecesWith_" + k] += 1
    return {"crops": {k: dict(v) for k, v in s.items()}, "pieces": {k: dict(v) for k, v in per_piece.items()}}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage1", required=True)
    ap.add_argument("--ground-truth", required=True)
    ap.add_argument("--time-basis")
    ap.add_argument("--number", default="20")
    ap.add_argument("--out", required=True)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--count-only", action="store_true")
    a = ap.parse_args()
    gt = json.loads(Path(a.ground_truth).read_text())
    if a.time_basis:
        gt = pp_bench.apply_time_basis(gt, json.loads(Path(a.time_basis).read_text()))
    rows = labelled_crops(Path(a.stage1), gt)
    if a.limit:
        rows = rows[: a.limit]
    if a.count_only:
        from collections import Counter  # noqa: PLC0415

        print(json.dumps({"crops": len(rows), "byLabel": Counter(r["label"] for r in rows),
                          "pieces": Counter(r["label"] for r in {(r["label"], r["piece"]): r for r in rows}.values())}))
        return 0
    reader = shared_reader()
    timing = {"baseline": 0.0, "colour": 0.0}
    for i, r in enumerate(rows):
        img = cv2.imread(r.pop("path"))
        r["cropSha256"] = hashlib.sha256(cv2.imencode(".png", img)[1].tobytes()).hexdigest()
        t0 = time.perf_counter()
        b = reader.read(img)
        timing["baseline"] += time.perf_counter() - t0
        t0 = time.perf_counter()
        c = colour_agreement_read(reader, img)
        timing["colour"] += time.perf_counter() - t0
        m = combine(b, c)
        r["reads"] = {k: {"number": v[0], "conf": round(float(v[1]), 4), "where": v[2]}
                      for k, v in (("baseline", b), ("colour", c), ("combined", m))}
        if i % 200 == 0:
            print(f"{i}/{len(rows)}", flush=True)
    record = {
        "schema": "pitchproof.ocr-crop-eval.v1",
        "groundTruth": {"file": Path(a.ground_truth).name, "sha256": hashlib.sha256(Path(a.ground_truth).read_bytes()).hexdigest(),
                        "timeBasis": Path(a.time_basis).name if a.time_basis else None},
        "stage1": str(a.stage1), "number": a.number, "cropsEvaluated": len(rows),
        "readerDevices": reader.device_report if hasattr(reader, "device_report") else None,
        "secondsTotal": {k: round(v, 2) for k, v in timing.items()},
        "summary": {k: summarise(rows, k, a.number) for k in ("baseline", "colour", "combined")},
        "scope": "Recognition on correctly associated crops of one development recording (IMG_4809); developer labels; "
                 "not independent validation and not identity accuracy.",
        "rows": rows,
    }
    Path(a.out).write_text(json.dumps(record, indent=1))
    print(json.dumps(record["summary"], indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
