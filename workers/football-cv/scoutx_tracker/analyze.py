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
from .stats import build_timeline
from .tracklets import build_tracklets, load_runs, tracklet_features


def select_ocr_crops(summary: list[dict], kit_min: float = 0.22, min_h: int = 90, min_gap: int = 4,
                     per_tracklet: int = 16, min_len: int = 8) -> dict[int, list[str]]:
    """Close-up crops worth reading, per target-team tracklet: biggest first, spread in time."""
    out = {}
    for s in summary:
        if s["kit1"] + 0.5 * s["kit2"] < kit_min or s["n"] < min_len or not s["crops"]:
            continue
        sized = []
        heights = s.get("crop_h")
        for i, c in enumerate(s["crops"]):
            if heights is not None:
                hgt = heights[i]
            else:  # older tracklet summaries: read the image size
                img = cv2.imread(c, cv2.IMREAD_REDUCED_GRAYSCALE_4)
                hgt = img.shape[0] * 4 if img is not None else 0
            if hgt >= min_h:
                sized.append((hgt, int(Path(c).stem.split("_")[0]), c))
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


def crop_key(path: str) -> str:
    """Location-independent cache key for a crop: '<stage1 part dir>/<file>'."""
    parts = str(path).replace("\\", "/").rsplit("/", 3)
    if len(parts) >= 3 and parts[-2] == "crops":
        return f"{parts[-3]}/{parts[-1]}"
    return path  # already a key


# 5.1: per-process memo for everything a correction recomputes although it depends only on the
# stage-1 artifacts (cached per worker process in tracking_v3._D_CACHE) or on the assembled
# tracklets: tracking rows, panorama transforms, crop-key maps, tracklets per (kit, number reads),
# appearance features, per-detection kit scores, camera states. Bounded (LRU); never persisted.
from collections import OrderedDict  # noqa: E402

_MEMO: "OrderedDict[tuple, object]" = OrderedDict()
MEMO_SIZE = 24


def _token(obj) -> str:
    if isinstance(obj, np.ndarray):  # arrays carry no attributes: key by content
        import hashlib  # noqa: PLC0415

        return hashlib.blake2b(np.ascontiguousarray(obj).view(np.uint8), digest_size=12).hexdigest()
    tok = getattr(obj, "_memo_token", None)
    if tok is None:
        import uuid  # noqa: PLC0415

        tok = uuid.uuid4().hex
        try:
            obj._memo_token = tok
        except AttributeError:
            return str(id(obj))
    return tok


def memo(key: tuple, fn):
    if key in _MEMO:
        _MEMO.move_to_end(key)
        return _MEMO[key]
    val = fn()
    _MEMO[key] = val
    while len(_MEMO) > MEMO_SIZE:
        _MEMO.popitem(last=False)
    return val


def det_of_crop(D) -> dict:
    return memo(("det_of", _token(D)), lambda: {crop_key(v): k for k, v in D.crops.items()})


def load_ocr_cache(cache_path: Path) -> dict:
    raw = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    return {crop_key(k): v for k, v in raw.items()}


def run_ocr(crops_by_tid: dict[int, list[str]], cache_path: Path, number_len: int = 2, log=print,
            early_stop: bool = True, budget_sec: float | None = None, skipped: list | None = None,
            max_new: int | None = None, read_new: list | None = None) -> dict[str, list]:
    """Reads crops tracklet by tracklet; stops early once a tracklet's number is settled.
    5.1: `budget_sec` bounds the time spent reading crops that are not cached yet (a correction
    must answer in seconds; the first resolve after extraction fills the cache without a budget).
    Crops left unread are counted in `skipped` and read by a later unbudgeted resolve.
    5.2: `max_new` bounds the NUMBER of uncached crops read (deferred-OCR follow-up); the crop
    order is deterministic, so repeated follow-ups make progress and never loop."""
    cache = load_ocr_cache(cache_path)
    t_budget = time.time()
    n_new = 0
    reader = None
    t, done = time.time(), 0
    total = sum(len(v) for v in crops_by_tid.values())
    for k, (tid, crops) in enumerate(crops_by_tid.items()):
        counts: dict[str, int] = {}
        for c in crops:
            key = crop_key(c)
            if key not in cache and ((budget_sec is not None and time.time() - t_budget > budget_sec)
                                     or (max_new is not None and n_new >= max_new)):
                if skipped is not None:
                    skipped.append(key)
                continue
            if key not in cache:
                if reader is None:
                    from .ocr import shared_reader  # noqa: PLC0415

                    reader = shared_reader()
                img = cv2.imread(c)
                num, conf, band = reader.read(img) if img is not None else (None, 0.0, None)
                cache[key] = [num, conf, band]
                done += 1
                n_new += 1
                if read_new is not None:
                    read_new.append(key)
                if done % 100 == 0:
                    cache_path.write_text(json.dumps(cache))
                    log(f"reading numbers: {done} crops ({(time.time() - t) / done:.2f}s each), tracklet {k + 1}/{len(crops_by_tid)}")
            num = cache[key][0]
            if num and len(num) == number_len:
                counts[num] = counts.get(num, 0) + 1
                if early_stop and counts[num] >= 2:
                    break
    if done:
        cache_path.write_text(json.dumps(cache))
    return cache


SCHEMA = "pitchproof.tracking.v3"
OCR_DENSE = {"min_h": 120, "min_gap": 4, "per_tracklet": 10**6, "min_len": 3}


def cached_tracklets(D, kit: str, kit2: str, det_reads: dict | None, cache_dir: Path):
    """Tracking rows depend only on stage-1 output - never on kit, number reads or user answers -
    so they are computed once per match; corrections only re-run the cheap assembly (splits,
    summaries). Measured on IMG_4809 (34 min, CPU): 40 s once, then ~3 s per correction."""
    import hashlib  # noqa: PLC0415

    from .tracklets import CONTACT_SPLIT, TRACKLET_ALGO_VERSION, assemble, panorama_transforms, track_rows  # noqa: PLC0415

    reads_key = hash(tuple(sorted(det_reads.items()))) if det_reads else None
    key = ("tracklets", _token(D), kit, kit2, reads_key, CONTACT_SPLIT, TRACKLET_ALGO_VERSION, str(cache_dir))
    if key in _MEMO:
        return memo(key, lambda: None)
    h = hashlib.sha256()
    h.update(f"{len(D.dets)}|{D.dets[:, :7].sum():.6f}|{cache_dir.resolve()}|{TRACKLET_ALGO_VERSION}".encode())
    path = cache_dir / f"trackrows_{h.hexdigest()[:16]}.npy"
    rows = None
    if path.exists():
        try:
            rows = np.load(path, allow_pickle=False)
        except Exception:  # noqa: BLE001 - a broken cache is rebuilt
            rows = None
    if rows is None:
        rows = track_rows(D)
        try:
            np.save(path, rows, allow_pickle=False)
        except OSError:
            pass
    P = memo(("pano", _token(D)), lambda: panorama_transforms(D.warps, D.segment))
    return memo(key, lambda: assemble(D, rows, kit, kit2, det_reads, P=P))


def attach_sightings(reads: dict, sightings: list[dict], number: str, D, T) -> int:
    rows = T.rows
    by_frame: dict[int, list[int]] = {}
    for i, f in enumerate(rows[:, 0].astype(int)):
        by_frame.setdefault(f, []).append(i)
    added = 0
    for s_ in sightings:
        if str(s_.get("number")) != number or int(s_.get("frames", 1)) < 1:
            continue  # 5.0: weak-only sightings (torso-region reads) never become identity evidence
        g0 = int(np.argmin(np.abs(D.times - float(s_["t"]))))
        if abs(D.times[g0] - float(s_["t"])) > 0.06:
            continue
        b = s_["box"]
        # 5.0: discovery may decode with ffmpeg and stage 1 with OpenCV; their frame grids can
        # differ by one frame, so the read is matched on the nearest frame or its neighbours
        # (best overlap, still >= 0.5 IoU with one detection).
        best, best_iou, g = None, 0.0, g0
        for gg in (g0, g0 - 1, g0 + 1):
            for i in by_frame.get(gg, []):
                x1, y1, x2, y2 = rows[i, 3:7]
                ix = max(0.0, min(x2, b[2]) - max(x1, b[0])) * max(0.0, min(y2, b[3]) - max(y1, b[1]))
                u = (x2 - x1) * (y2 - y1) + (b[2] - b[0]) * (b[3] - b[1]) - ix
                iou = ix / u if u > 0 else 0.0
                if iou > best_iou + (0.05 if gg != g0 else 0.0):
                    best, best_iou, g = i, iou, gg
        if best is None or best_iou < 0.5:
            continue
        tid = int(rows[best, 2])
        existing = reads.setdefault(tid, [])
        if any(e[0] == g and e[1] == number for e in existing):
            continue  # this frame already has the read (dense OCR or an earlier attach)
        existing.append((g, number, float(s_.get("conf", 0.95)), "discovery"))
        added += 1
    return added


def _frame_of(D, t: float) -> int:
    """Local (per stage-1 part) frame index of source time t, matching crop file names."""
    g = int(np.argmin(np.abs(D.times - t)))
    for _video, first, n, _start in D.sources:
        if first <= g < first + n:
            return g - first
    return g


def frame_activity(T, n_frames: int) -> np.ndarray:
    """Share of confidently detected people moving faster than ~0.8 body-heights/s, per frame."""
    R, P = T.rows, T.pano
    moving = np.zeros(n_frames)
    total = np.zeros(n_frames)
    for ix in T.by_tid.values():
        if len(ix) < 3:
            continue
        d = np.hypot(np.diff(P[ix, 0]), np.diff(P[ix, 1])) / np.maximum(P[ix[1:], 2], 8)
        sp = d / np.maximum(np.diff(R[ix, 1]), 0.05)
        fr = R[ix[1:], 0].astype(int)
        ok = R[ix[1:], 7] >= 0.4
        np.add.at(total, fr[ok], 1)
        np.add.at(moving, fr[ok], (sp[ok] > 0.8).astype(float))
    return np.where(total > 0, moving / np.maximum(total, 1), np.nan)


def analyze(run_dirs: list[str], out_dir: str, number: str | None, kit: str, kit2: str = "",
            anchors: list[tuple[float, float, float]] | None = None, ocr: bool = True, log=print,
            rejects: list[tuple[float, float, float]] | None = None, feedback: dict | None = None,
            position: str = "unknown", age_group: str = "", ocr_dense: bool = True, D=None,
            sightings: list[dict] | None = None, ocr_budget_sec: float | None = None,
            ocr_max_new: int | None = None) -> dict:
    from .ball import ball_events  # noqa: PLC0415
    from .moments import build_moments  # noqa: PLC0415
    from .invariants import check  # noqa: PLC0415
    from .metrics import Thresholds, physical_metrics  # noqa: PLC0415
    from .periods import camera_states, detect_periods  # noqa: PLC0415
    from .states import coverage, frame_states  # noqa: PLC0415
    from .tracklets import panorama_transforms  # noqa: PLC0415

    timings: dict[str, float] = {}
    feedback = feedback or {}
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    t = time.time()
    D = load_runs(run_dirs) if D is None else D
    timings["load"] = time.time() - t
    t = time.time()
    T = cached_tracklets(D, kit, kit2, None, Path(run_dirs[0]).parent)
    timings["tracklets"] = time.time() - t
    log(f"tracklets: {len(T.summary)} from {len(D.dets)} detections in {timings['tracklets']:.1f}s")
    t = time.time()
    reads: dict[int, list] = {}
    if ocr and number:
        # Dense temporal OCR (3.2): every target-kit close-up >= 120 px, one per 0.4 s, no early
        # stop - shirt numbers are visible in only a few moments, and reads inside a tracklet are
        # also how identity swaps between team-mates are found. Measured on IMG_4809: keeps 187/192
        # full-number reads (7/7 target reads) of reading every close-up, at 48 % of the crops.
        crops = select_ocr_crops(T.summary, **OCR_DENSE) if ocr_dense else select_ocr_crops(T.summary)
        log(f"ocr crops: {sum(len(v) for v in crops.values())} across {len(crops)} tracklets")
        ocr_skipped: list = []
        t_ocr0 = time.time()
        ocr_new: list = []
        cache = run_ocr(crops, Path(run_dirs[0]).parent / "ocr_cache.json", len(number), log, early_stop=not ocr_dense,
                        budget_sec=ocr_budget_sec, skipped=ocr_skipped, max_new=ocr_max_new, read_new=ocr_new)
        det_of = det_of_crop(D)
        det_reads = {det_of[c]: v[0] for c, v in cache.items() if v[0] and c in det_of}
        # Same-team identity swaps are invisible to colour: split where shirt numbers conflict.
        T = cached_tracklets(D, kit, kit2, det_reads, Path(run_dirs[0]).parent)
        log(f"number-conflict splits: {T.number_splits}")
        row_of_det = memo(("row_of_det", _token(T)), lambda: {int(d): i for i, d in enumerate(T.rows[:, 8])})
        for c, (num, conf, band) in ((c, cache[c]) for c in det_of if c in cache):
            if not num:
                continue
            r = row_of_det.get(det_of[c])
            if r is not None:
                reads.setdefault(int(T.rows[r, 2]), []).append((int(T.rows[r, 0]), num, conf, band))
    # 4.1: number sightings from the discovery pass are the same kind of evidence as a dense-OCR
    # read (the target number read on that player's shirt) - attach each to the detection it
    # shows (same frame, box overlap) so identity resolution can use it.
    if number and sightings:
        added_s = attach_sightings(reads, sightings, number, D, T)
        log(f"discovery sightings attached: {added_s}/{len(sightings)}")
    timings["numbers"] = time.time() - t
    t = time.time()
    target = Target(number=number, kit_primary=kit, kit_secondary=kit2, anchors=anchors or [], rejects=rejects or [],
                    asked=[tuple(x) for x in feedback.get("asked", [])])
    from .features import kit_scores  # noqa: PLC0415

    feats = memo(("feats", _token(T)), lambda: tracklet_features(D, T))
    row_kit = memo(("row_kit", _token(T), kit), lambda: kit_scores(D.sigs[T.rows[:, 8].astype(int)], kit)) if kit else None
    res = resolve_identity(T.summary, reads, target, D.fps, T.rows, T.by_tid, feats, row_kit=row_kit,
                         links=T.links, contact_pre=T.contact_pre)
    # Pass 2 - targeted refinement: before asking the user, read every close-up crop of the
    # candidate tracklets behind the questions (and of chain members without hard evidence).
    # A clearly read other number answers the question automatically.
    refined: set[int] = set()
    for _pass in range(3 if (ocr and number) else 0):
        focus = {q["tid"] for q in res.questions}
        focus |= {T.summary[k]["tid"] for k in res.chosen if res.evidence.get(k) in ("appearance", "continuity", "anchored", "contact_unclear")}
        focus -= refined
        if not focus:
            break
        refined |= focus
        extra = select_ocr_crops([s_ for s_ in T.summary if s_["tid"] in focus], per_tracklet=40, min_gap=2, min_h=90)
        before = sum(len(v) for v in reads.values())
        cache = run_ocr(extra, Path(run_dirs[0]).parent / "ocr_cache.json", len(number), log, early_stop=False,
                        budget_sec=None if ocr_budget_sec is None else max(0.0, ocr_budget_sec - (time.time() - t_ocr0)),
                        skipped=ocr_skipped if (ocr and number) else None,
                        max_new=None if ocr_max_new is None else max(0, ocr_max_new - len(ocr_new)), read_new=ocr_new)
        row_of_det = memo(("row_of_det", _token(T)), lambda: {int(d): i for i, d in enumerate(T.rows[:, 8])})
        det_of = det_of_crop(D)
        seen = {(tid, f) for tid, rs in reads.items() for f, *_ in rs}
        for c in (c for cs in extra.values() for c in cs):
            num = cache.get(crop_key(c), [None])[0]
            r = row_of_det.get(det_of.get(crop_key(c), -1))
            if num and r is not None and (int(T.rows[r, 2]), int(T.rows[r, 0])) not in seen:
                v = cache[crop_key(c)]
                reads.setdefault(int(T.rows[r, 2]), []).append((int(T.rows[r, 0]), v[0], v[1], v[2]))
        added = sum(len(v) for v in reads.values()) - before
        log(f"refinement: {sum(len(v) for v in extra.values())} focused crops, {added} new number reads")
        if not added:
            break
        res = resolve_identity(T.summary, reads, target, D.fps, T.rows, T.by_tid, feats, row_kit=row_kit,
                         links=T.links, contact_pre=T.contact_pre)
    timings["identity"] = time.time() - t
    log(f"identity: {res.iterations[-1]} seeds={len(res.seeds)} candidates={len(res.candidates)}")

    # Images for the review cards: nearest close-up crop of each question's tracklet, and a
    # reference crop of a hard-evidence (number-read) target sighting.
    by_tid_summary = {s_["tid"]: s_ for s_ in T.summary}
    for q in res.questions:
        crops = by_tid_summary.get(q["tid"], {}).get("crops", [])
        if crops:
            q["crop"] = min(crops, key=lambda c: abs(int(Path(c).stem.split("_")[0]) - _frame_of(D, q["t"])))
    # Reference image: the largest close-up whose own crop was READ as the target number (the
    # clearest proof of who we follow); falls back to the nearest crop to any target read.
    reference, best_h = None, -1.0
    for k in res.chosen:
        if res.evidence.get(k) != "number":
            continue
        s_ = T.summary[k]
        target_frames = {f for f, num, _, _ in reads.get(s_["tid"], []) if num == number}
        heights = s_.get("crop_h") or [0.0] * len(s_["crops"])
        for c, h_ in zip(s_["crops"], heights):
            f_local = int(Path(c).stem.split("_")[0])
            g_ = next((g for g in target_frames if _frame_of(D, float(D.times[g])) == f_local), None)
            if g_ is not None and h_ > best_h:
                reference, best_h = c, h_
    if reference is None:
        for k in res.chosen:
            if res.evidence.get(k) == "number" and T.summary[k]["crops"]:
                ev_t = res.evidence_times.get(k, [])
                crops = T.summary[k]["crops"]
                reference = min(crops, key=lambda c: min((abs(int(Path(c).stem.split("_")[0]) - _frame_of(D, et)) for et in ev_t),
                                                         default=0))
                break

    t = time.time()
    F = len(D.times)
    grass = D.grass if D.grass is not None and not np.isnan(D.grass).all() else np.ones(F)
    camera = memo(("camera", _token(D)), lambda: camera_states(np.nan_to_num(grass, nan=1.0), D.dets, F, D.height))
    activity = memo(("activity", _token(T)), lambda: frame_activity(T, F))
    timeline = detect_periods(D.times, camera, activity, corrections=feedback.get("periods"))
    period_kind = timeline.kind_at(D.times)
    tl = build_timeline(D, T, res, row_kit=row_kit)
    states, competitor = frame_states(T, res, tl, period_kind, camera,
                                      [tuple(x) for x in feedback.get("offPitch", [])])
    cov = coverage(D.times, states, period_kind, camera)
    P = memo(("pano", _token(D)), lambda: panorama_transforms(D.warps, D.segment))
    calib = apply_calibrations(feedback.get("calibrations", []), D, P, tl, states)
    phys, speed = physical_metrics(tl, D.fps, states, camera, D.warps[:, 6], period_kind,
                                   Thresholds.for_age_group(age_group), D.width or 1920,
                                   positions=calib["positions"] if calib["calibratedFrames"] else None)
    events, ball = ball_events(D, T, tl, states, P, camera, D.fps)
    timings["timeline_metrics_events"] = time.time() - t
    # Off-ball observations (4.1): distances to nearest opponent/team-mate on confirmed frames only.
    from .ball import team_of  # noqa: PLC0415
    from .offball import offball_observations, sequence_observations  # noqa: PLC0415

    teams = {s_["tid"]: team_of(s_, 0.22) for s_ in T.summary}
    offball = offball_observations(tl.times, states, tl.boxes, tl.present, T.rows, teams, D.fps)
    # 5.0: narrow clip-level observations from continuous confirmed sequences (>= 6 s)
    offball["sequences"] = sequence_observations(tl.times, states, tl.boxes, tl.present, T.rows, teams, D.fps)
    # Moments: watchable clip windows around the target's own (already measured) actions.
    want = {c for k in res.chosen for c in T.summary[k].get("crops", [])}
    crop_times = sorted((float(D.times[int(D.dets[di, 0])]), c) for di, c in D.crops.items() if c in want)
    moments = build_moments(tl.times, states, tl.present, tl.boxes, tl.segment, period_kind, events,
                            chunk_starts={int(first) for _v, first, _n, _s in D.sources},
                            crop_times=crop_times, width=D.width or 1920, height=D.height or 1080)

    np.savez_compressed(out / "timeline.npz", times=tl.times, present=tl.present, boxes=tl.boxes,
                        conf=tl.conf, evidence=tl.evidence.astype(str), speed=speed, segment=tl.segment,
                        states=states.astype(str), camera=camera.astype(str), period=period_kind.astype(str))
    tracklets = [{"tid": T.summary[k]["tid"], "t0": T.summary[k]["t0"], "t1": T.summary[k]["t1"],
                  "evidence": res.evidence[k], "score": round(res.score.get(k, 0.0), 3), "scoreKind": "uncalibrated",
                  "reads": reads.get(T.summary[k]["tid"], [])} for k in res.chosen]
    state_sec = {s: round(float(np.count_nonzero(states == s)) / D.fps, 1) for s in np.unique(states)}
    report = {
        "schema": SCHEMA,
        "engine": {"version": __import__("scoutx_tracker").__version__, "timingsSec": {k: round(v, 1) for k, v in timings.items()},
                   "ocrDeferred": len(set(ocr_skipped) - set(ocr_new)) if (ocr and number) else 0,
                   "ocrRead": len(ocr_new) if (ocr and number) else 0},
        "target": {"number": number, "kit": kit, "kit2": kit2, "position": position, "ageGroup": age_group,
                   "anchors": anchors or [], "rejects": rejects or []},
        "timeline": {"periods": timeline.to_json(),
                     "cameraStatesSec": {s: round(float(np.count_nonzero(camera == s)) / D.fps, 1) for s in np.unique(camera)}},
        "coverage": cov,
        "identity": {"statesSec": state_sec, "iterations": res.iterations,
                     "numberSightings": sum(1 for k in res.chosen if res.evidence.get(k) == "number"),
                     "confirmedByUser": sum(1 for k in res.chosen if res.evidence.get(k) == "anchor"),
                     "scoreNote": "Identity scores are uncalibrated (not probabilities)."},
        "physical": phys,
        "calibration": {k: v for k, v in calib.items() if k != "positions"},
        "heatmap": calib["heatmap"],
        "ball": ball,
        "events": events,
        "moments": moments,
        "offball": offball,
        "videoSize": {"width": int(D.width or 1920), "height": int(D.height or 1080)},
        "analysedRange": {"startSec": round(float(D.times[0]), 2) if len(D.times) else 0.0,
                          "endSec": round(float(D.times[-1]), 2) if len(D.times) else 0.0,
                          "parts": len(D.sources)},
        "tracklets": tracklets,
        "reviewQuestions": res.questions,
        "referenceCrop": reference,
        "excluded": [{"tid": T.summary[k]["tid"], "t0": T.summary[k]["t0"], "t1": T.summary[k]["t1"], "why": why}
                     for k, why in res.excluded.items()],
        "numberReads": {str(k): v for k, v in reads.items()},
    }
    report["invariants"] = {"violations": check(report)}
    report["invariants"]["ok"] = not report["invariants"]["violations"]
    if report["invariants"]["violations"]:
        log(f"INVARIANT VIOLATIONS: {report['invariants']['violations']}")
    (out / "result.json").write_text(json.dumps(report, indent=2, default=float))
    return report


def apply_calibrations(cals: list[dict], D, P, tl, states) -> dict:
    """User calibrations {t, names[], points[[x,y]]} -> per-frame pitch positions of the claimed
    target (nan where no valid propagated homography). Invalid calibrations are reported, never used."""
    from .calibration import fit_manual, observed_heatmap, pitch_positions, propagate  # noqa: PLC0415
    from .states import CONFIRMED_VISIBLE, LIKELY_VISIBLE  # noqa: PLC0415

    H_by_frame: dict[int, np.ndarray] = {}
    dist_ref: dict[int, float] = {}
    cal_of: dict[int, str] = {}
    report = []
    for i, c in enumerate(cals or []):
        g = int(np.argmin(np.abs(D.times - float(c.get("t", -1)))))
        cal = fit_manual(f"cal_{i + 1}", g, [tuple(p) for p in c.get("points", [])], list(c.get("names", [])))
        frames = propagate(cal, P, D.segment, D.times, D.warps[:, 6]) if cal.status == "valid" else {}
        for f, H in frames.items():
            d = abs(float(D.times[f] - D.times[g]))
            if f not in H_by_frame or d < dist_ref[f]:  # nearest reference wins (least drift)
                H_by_frame[f], dist_ref[f], cal_of[f] = H, d, cal.id
        report.append({"id": cal.id, "t": round(float(D.times[g]), 2), "status": cal.status, "reason": cal.reason,
                       "reprojectionM": None if cal.reprojection_m is None else round(cal.reprojection_m, 3),
                       "propagatedSec": round(len(frames) / D.fps, 1)})
    claimed = np.asarray(tl.present, bool) & np.isin(states, [CONFIRMED_VISIBLE, LIKELY_VISIBLE])
    pos, _prov = pitch_positions(tl.boxes, claimed, H_by_frame, cal_of)
    ok = ~np.isnan(pos[:, 0])
    return {"calibrations": report, "calibratedFrames": int(ok.sum()), "calibratedSec": round(float(ok.sum()) / D.fps, 1),
            "positions": pos,
            "heatmap": observed_heatmap(pos) if ok.any() else
            {"status": "unavailable", "reason": "No validated pitch calibration covers the player's visible time."}}


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
    print(json.dumps({k: rep[k] for k in ("coverage", "invariants")}, indent=2))

if __name__ == "__main__":
    main()
