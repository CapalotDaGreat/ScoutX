"""Stages 2-4 orchestration: tracklets -> number reading -> identity -> timeline -> stats.

Usage:
  python -m scoutx_tracker.analyze --runs runs/full/c_* --number 20 --kit orange --kit2 white \
      --out runs/full/orange20 [--anchor 242.0:800,620]
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import cv2
import numpy as np

from .identity import Target, resolve_identity
from .stats import build_timeline, compute_stats
from .tracklets import build_tracklets, load_runs, tracklet_features


def select_ocr_crops(summary: list[dict], kit_min: float = 0.22, min_h: int = 90, min_gap: int = 4,
                     per_tracklet: int = 16, min_len: int = 8) -> dict[int, list[str]]:
    """Close-up crops worth reading, per target-team tracklet: biggest first, spread in time."""
    out = {}
    for s in summary:
        if s["kit1"] + 0.5 * s["kit2"] < kit_min or s["n"] < min_len or not s["crops"]:
            continue
        sized = []
        for c in s["crops"]:
            img = cv2.imread(c, cv2.IMREAD_REDUCED_GRAYSCALE_4)
            if img is not None and img.shape[0] * 4 >= min_h:
                sized.append((img.shape[0], int(Path(c).stem.split("_")[0]), c))
        sized.sort(reverse=True)
        sel, used = [], []
        for _, f, c in sized:
            if all(abs(f - u) >= min_gap for u in used):
                sel.append(c)
                used.append(f)
            if len(sel) >= per_tracklet:
                break
        if sel:
            out[s["tid"]] = sel
    return out


def run_ocr(crops_by_tid: dict[int, list[str]], cache_path: Path, number_len: int = 2, log=print) -> dict[str, list]:
    """Reads crops tracklet by tracklet; stops early once a tracklet's number is settled."""
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    reader = None
    t, done = time.time(), 0
    total = sum(len(v) for v in crops_by_tid.values())
    for k, (tid, crops) in enumerate(crops_by_tid.items()):
        counts: dict[str, int] = {}
        for c in crops:
            if c not in cache:
                if reader is None:
                    from .ocr import NumberReader  # noqa: PLC0415

                    reader = NumberReader()
                img = cv2.imread(c)
                num, conf, band = reader.read(img) if img is not None else (None, 0.0, None)
                cache[c] = [num, conf, band]
                done += 1
                if done % 100 == 0:
                    cache_path.write_text(json.dumps(cache))
                    log(f"reading numbers: {done} crops ({(time.time() - t) / done:.2f}s each), tracklet {k + 1}/{len(crops_by_tid)}")
            num = cache[c][0]
            if num and len(num) == number_len:
                counts[num] = counts.get(num, 0) + 1
                if counts[num] >= 2:
                    break
    cache_path.write_text(json.dumps(cache))
    return cache


def analyze(run_dirs: list[str], out_dir: str, number: str | None, kit: str, kit2: str = "",
            anchors: list[tuple[float, float, float]] | None = None, ocr: bool = True, log=print,
            rejects: list[tuple[float, float, float]] | None = None) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    t = time.time()
    D = load_runs(run_dirs)
    T = build_tracklets(D, kit, kit2)
    log(f"tracklets: {len(T.summary)} from {len(D.dets)} detections in {time.time() - t:.1f}s")
    reads: dict[int, list] = {}
    if ocr and number:
        crops = select_ocr_crops(T.summary)
        log(f"ocr crops: {sum(len(v) for v in crops.values())} across {len(crops)} tracklets")
        cache = run_ocr(crops, Path(run_dirs[0]).parent / "ocr_cache.json", len(number), log)
        for tid, cs in crops.items():
            for c in cs:
                if c not in cache:
                    continue
                num, conf, band = cache[c]
                if num:
                    reads.setdefault(tid, []).append((int(Path(c).stem.split("_")[0]), num, conf, band))
    target = Target(number=number, kit_primary=kit, kit_secondary=kit2, anchors=anchors or [], rejects=rejects or [])
    feats = tracklet_features(D, T)
    from .features import kit_score  # noqa: PLC0415

    row_kit = np.array([kit_score(D.sigs[int(d)], kit) for d in T.rows[:, 8]]) if kit else None
    res = resolve_identity(T.summary, reads, target, D.fps, T.rows, T.by_tid, feats, row_kit=row_kit)
    log(f"identity: {res.iterations[-1]} seeds={len(res.seeds)} candidates={len(res.candidates)}")
    tl = build_timeline(D, T, res, row_kit=row_kit)
    stats = compute_stats(D, T, tl, D.fps, res)
    speed = stats.pop("speed")
    np.savez_compressed(out / "timeline.npz", times=tl.times, present=tl.present, boxes=tl.boxes,
                        conf=tl.conf, evidence=tl.evidence.astype(str), speed=speed, segment=tl.segment)
    tracklets = [{"tid": T.summary[k]["tid"], "t0": T.summary[k]["t0"], "t1": T.summary[k]["t1"],
                  "evidence": res.evidence[k], "confidence": round(res.confidence[k], 3),
                  "reads": reads.get(T.summary[k]["tid"], [])} for k in res.chosen]
    report = {"target": {"number": number, "kit": kit, "kit2": kit2, "anchors": anchors or [], "rejects": rejects or []},
              "stats": stats, "tracklets": tracklets, "identity": res.iterations,
              "reviewQuestions": res.questions,
              "excluded": [{"tid": T.summary[k]["tid"], "t0": T.summary[k]["t0"], "t1": T.summary[k]["t1"], "why": why}
                           for k, why in res.excluded.items()],
              "numberReads": {str(k): v for k, v in reads.items()}}
    (out / "result.json").write_text(json.dumps(report, indent=2, default=float))
    return report


def parse_anchor(s: str) -> tuple[float, float, float]:
    t, xy = s.split(":", 1) if s.count(":") == 1 else (s.rsplit(":", 1))
    x, y = xy.split(",")
    return float(t), float(x), float(y)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--number")
    ap.add_argument("--kit", required=True)
    ap.add_argument("--kit2", default="")
    ap.add_argument("--anchor", action="append", default=[], help="seconds:x,y (image pixels)")
    ap.add_argument("--reject", action="append", default=[], help="seconds:x,y - not my player")
    ap.add_argument("--no-ocr", action="store_true")
    a = ap.parse_args()
    rep = analyze(a.runs, a.out, a.number, a.kit, a.kit2, [parse_anchor(s) for s in a.anchor], not a.no_ocr,
                  rejects=[parse_anchor(s) for s in a.reject])
    s = dict(rep["stats"])
    for k in ("buckets", "involvementList", "sprintList"):
        s.pop(k, None)
    print(json.dumps(s, indent=2))


if __name__ == "__main__":
    main()
