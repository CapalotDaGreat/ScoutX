"""Early discovery pass (4.1): find the selected player's shirt-number sightings fast and turn
each one into a playable moment, long before full identity resolution finishes.

Why: the full pipeline processes every frame at 10 fps with a 1280 px detector and only confirms
identity where the shirt number was read. On IMG_4809 the number "20" is readable in just a
handful of moments, so a chronological first part often contains no evidence and the first
report is empty. Discovery inverts the order of work:

  * sparse sampling: detection every `sample_every` decoded frames (default 2 fps) at 640 px,
    which is enough for the large, close-to-camera players whose numbers can be read;
  * adaptive density: only around a large target-kit player is the detector re-run on the
    neighbouring frames and every crop read (multi-frame OCR with voting);
  * a sighting is accepted only when the target number is read and no frame of the same
    sighting reads a different number (a conflict abstains);
  * each sighting becomes a clip (context-aware: never across a camera cut) with a target
    outline and the read crop as thumbnail - direct visual proof of who is shown.

Nothing here infers identity from appearance: a discovery moment always shows the number read.
"""

from __future__ import annotations

import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

import cv2
import numpy as np

from .cmc import scene_cut
from .features import colour_signature, ground_green, kit_score

LEAD_SEC, TAIL_SEC = 5.0, 4.0
MIN_CONFIRM_READS = 2


def is_confirmed(strong: int, weak: int) -> bool:
    """>= 2 main-reader reads, or 1 main-reader read backed by >= 2 weak (torso-region) reads of
    the same number in other frames of the same sighting. Weak reads alone never confirm."""
    return strong >= MIN_CONFIRM_READS or (strong >= 1 and weak >= 2)
CLUSTER_GAP_SEC = 1.5


@dataclass
class DiscoveryConfig:
    fps: float = 10.0              # decode rate (source is resampled to this)
    sample_every: int = 5          # detector on every 5th decoded frame -> 2 fps
    det_size: int = 416            # informational: the caller's detector input size
    min_kit: float = 0.30          # shirt share of the target kit colour
    min_ground: float = 0.25       # 5.0: pitch-green share around the feet (spectators in front are not players)
    min_h: int = 110               # px; smaller players' numbers are not readable
    neighbours: tuple[int, ...] = (2, 4)  # adaptive extra frames after a candidate (0.2, 0.4 s)
    max_ocr_per_sample: int = 2    # largest candidates first
    reread_sec: float = 1.5        # the same player (overlap) is read again only after this ...
    reread_growth: float = 1.2     # ... or when he appears clearly larger (closer) than last time
    dense_min_h: int = 160         # extra neighbour reads only for players this large
    close_min_h: int = 240         # very close players: every following frame, re-read every 0.5 s
    close_neighbours: tuple[int, ...] = (1, 2, 3, 4)
    # 5.0: neighbour frames are read only when the sample itself gave evidence for the target
    # (its number, or one of its digits as a partial read) or the player is very close; the
    # neighbours are found by re-detecting inside a region around the player, not the whole frame.
    evidence_densify: bool = True
    roi_det: bool = True
    roi_scale: float = 2.2
    # 5.0: when the main reader abstains, ask PARSeq on colour torso regions whether this is
    # exactly the target number (weak evidence: can only create a moment to check)
    weak_verify: bool = True
    weak_min_conf: float = 0.95
    # 5.1: a player whose shirt read the same OTHER full number twice is settled: not re-read for
    # this long (unless he comes clearly closer). 0 = off.
    settled_sec: float = 0.0
    # 5.1 legibility gate (legibility.py); None = read every candidate (5.0 behaviour)
    gate: object | None = None
    # 5.1: main read + weak torso check in one PARSeq batch (same results, fewer model calls)
    batch_verify: bool = True


@dataclass
class Sighting:
    t: float
    box: list[float]               # x1, y1, x2, y2 (px)
    number: str
    conf: float
    frames: int                    # frames that read the number (main reader)
    crop: str | None = None
    weak_frames: int = 0           # 5.0: frames with only weak (torso-region) evidence


@dataclass
class DiscoveryResult:
    sightings: list[Sighting] = field(default_factory=list)
    moments: list[dict] = field(default_factory=list)
    timings: dict = field(default_factory=dict)
    width: int = 1920
    height: int = 1080
    frames: int = 0
    first_sighting_wall_sec: float | None = None
    # diagnostics (worker-internal, never returned by the API): reads per recognised number
    read_counts: dict = field(default_factory=dict)
    # 5.1 diagnostics (benchmarks only, never returned by the API): one record per OCR attempt
    read_log: list = field(default_factory=list)


def cv2_frames(src: str, start: float, end: float, fps: float):
    """Yields (t, get_frame) at `fps`. Frames are only *grabbed* (decoded, 0.017 s/frame on
    2 vCPU for 1080p 10-bit) and converted to BGR (0.06 s/frame, the expensive part) only when
    the caller asks for them - discovery needs a small fraction. OpenCV's conversion is kept
    because the kit-colour model was calibrated on it (ffmpeg's CLI conversion of this HDR
    footage differs by ~22 grey levels)."""
    cap = cv2.VideoCapture(src)
    fps_src = cap.get(cv2.CAP_PROP_FPS) or fps
    step = max(1, int(round(fps_src / fps)))
    k0 = int(round(start * fps_src))
    if k0 > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, k0)
    k = k0
    try:
        while k / fps_src < end:
            if not cap.grab():
                break
            if (k - k0) % step == 0:
                t = k / fps_src
                yield t, (lambda c=cap: c.retrieve()[1])
            k += 1
    finally:
        cap.release()


def ffmpeg_frames(src: str, start: float, end: float, fps: float, select_every: int = 1):
    """Yields (t, frame) decoded by ffmpeg (multi-threaded, runs in parallel with inference) and
    converted explicitly to the working colour space (5.0, see colour.py). `select_every` keeps
    one frame in N before conversion."""
    from .colour import decode_command, probe  # noqa: PLC0415

    info = probe(src)
    w, h = info.width, info.height
    hw = os.environ.get("SCOUTX_HWACCEL", "").strip()  # e.g. "cuda" on GPU hosts (NVDEC)
    cmd = decode_command(src, start, end, fps, info, hwaccel=hw, select_every=select_every)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, bufsize=w * h * 3 * 4)
    size = w * h * 3
    k = 0
    try:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            yield start + k * select_every / fps, np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            k += 1
    finally:
        proc.stdout.close()
        proc.kill()
        proc.wait()


def default_frames(src: str, start: float, end: float, fps: float):
    """Decoder choice for discovery: SCOUTX_DECODER=cv2|ffmpeg|auto (default auto = ffmpeg with
    explicit colour handling when ffmpeg/zscale are installed, else OpenCV)."""
    from .colour import ffmpeg_available, zscale_available  # noqa: PLC0415

    choice = os.environ.get("SCOUTX_DECODER", "auto").strip().lower()
    if choice == "ffmpeg" or (choice == "auto" and ffmpeg_available() and zscale_available()):
        return ffmpeg_frames(src, start, end, fps)
    return cv2_frames(src, start, end, fps)


def _iou(a, b) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    return inter / max(1e-6, (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter)


def _crop(frame, box):
    H, W = frame.shape[:2]
    x1, y1, x2, y2 = (int(v) for v in box)
    pad = int(0.05 * (y2 - y1))
    return frame[max(0, y1 - pad): min(H, y2), max(0, x1 - pad): min(W, x2 + pad)]


def discover(src: str, start: float, end: float, number: str, kit: str, detector, reader,
             cfg: DiscoveryConfig | None = None, crops_dir: str | None = None, on_sighting=None,
             frames=None, progress=None, roi_detector=None, log_reads_dir: str | None = None) -> DiscoveryResult:
    """`detector(frame) -> (person boxes, scores)`, `reader.read(crop) -> (number, conf, where)`.
    `frames`: iterable of (t, frame or zero-arg getter) overriding the decoder (tests).
    `on_sighting(sighting, wall_sec)` streams results as soon as a sighting is settled."""
    cfg = cfg or DiscoveryConfig()
    t_wall = time.time()
    tm = {"decode": 0.0, "convert": 0.0, "detect": 0.0, "kit": 0.0, "ocr": 0.0}
    res = DiscoveryResult()
    track: list[tuple[float, list[float]]] = []  # target-kit boxes at sample times (for indicators)
    cuts: list[float] = []
    reads: list[tuple[float, list[float], str | None, float, str | None, int]] = []
    active: list[dict] = []  # adaptive windows: candidate box + frames still to read
    last_read: list[dict] = []  # throttle: recently read players (box, time, height)
    stats = {"samples": 0, "candidates": 0, "reads": 0, "skipped": 0}
    emitted: set[float] = set()
    prev_small = None
    it = iter(frames) if frames is not None else default_frames(src, start, end, cfg.fps)
    digits = set(number)
    forward = sorted(d for d in cfg.neighbours if d > 0)

    def detect(frame):
        _t = time.perf_counter()
        out = detector(frame)
        tm["detect"] += time.perf_counter() - _t
        return out

    def target_boxes(frame, boxes, scores):
        _t = time.perf_counter()
        out = []
        for b, sc in zip(boxes, scores):
            if sc < 0.3 or b[3] - b[1] < 36:
                continue
            sig, _ = colour_signature(frame, b)
            if kit_score(sig, kit) >= cfg.min_kit and (cfg.min_ground <= 0 or ground_green(frame, b) >= cfg.min_ground):
                out.append(b)
        tm["kit"] += time.perf_counter() - _t
        return out

    def roi_detect(frame, box):
        """Person boxes near `box` (frame coordinates) from a detection on the surrounding region."""
        H, W = frame.shape[:2]
        x1, y1, x2, y2 = box
        cx, cy, bw, bh = (x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1), (y2 - y1)
        half_w, half_h = max(bw, bh * 0.6) * cfg.roi_scale / 2, bh * cfg.roi_scale / 2 * 0.8
        rx1, ry1 = int(max(0, cx - half_w)), int(max(0, cy - half_h))
        rx2, ry2 = int(min(W, cx + half_w)), int(min(H, cy + half_h))
        if rx2 - rx1 < 16 or ry2 - ry1 < 16:
            return np.zeros((0, 4)), np.zeros(0)
        # 16:9 canvas: the detector input keeps the frame's shape (fixed-shape ONNX graphs)
        cw = int(max(rx2 - rx1, (ry2 - ry1) * 16 / 9)) + 1
        canvas = np.full((int(cw * 9 / 16) + 1, cw, 3), 114, np.uint8)
        canvas[: ry2 - ry1, : rx2 - rx1] = frame[ry1:ry2, rx1:rx2]
        _t = time.perf_counter()
        b, sc = (roi_detector or detector)(canvas)
        tm["detect"] += time.perf_counter() - _t
        b = np.asarray(b, float).reshape(-1, 4) + np.array([rx1, ry1, rx1, ry1], float)
        return b, np.asarray(sc, float)

    def ocr(idx, t, frame, box):
        crop = _crop(frame, box)
        if crop.size == 0:
            return None
        _t = time.perf_counter()
        leg = None
        if cfg.gate is not None:
            from .legibility import features as _leg  # noqa: PLC0415

            leg = _leg(crop)
            if not cfg.gate.main(leg):
                stats["gated"] = stats.get("gated", 0) + 1
                tm["ocr"] += time.perf_counter() - _t
                return None
        weak_conf = None
        want_weak = cfg.weak_verify and hasattr(reader, "parseq") and (leg is None or cfg.gate.weak(leg))
        if want_weak and cfg.batch_verify and hasattr(reader, "read_and_verify"):
            # 5.1: one PARSeq batch for the main read and the weak torso check
            num, conf, where, wc = reader.read_and_verify(crop, number)
            t_main = time.perf_counter() - _t
            if num is None:
                weak_conf = wc
                if wc >= cfg.weak_min_conf:
                    num, conf, where = number, wc, "weak:torso"
        else:
            num, conf, where = reader.read(crop)
            t_main = time.perf_counter() - _t
            if num is None and want_weak:
                from .ocr import target_roi_confidence  # noqa: PLC0415

                wc = weak_conf = target_roi_confidence(reader, crop, number)
                if wc >= cfg.weak_min_conf:
                    num, conf, where = number, wc, "weak:torso"
        t_total = time.perf_counter() - _t
        tm["ocr"] += t_total
        if log_reads_dir is not None:
            i = len(res.read_log)
            Path(log_reads_dir).mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(Path(log_reads_dir) / f"r_{i:06d}.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
            res.read_log.append({"i": i, "t": round(t, 2), "k": idx, "box": [round(float(v), 1) for v in box], "num": num,
                                 "conf": round(float(conf), 4), "where": where, "weakConf": weak_conf,
                                 "msMain": round(1000 * t_main, 1), "msTotal": round(1000 * t_total, 1)})
        stats["reads"] += 1
        reads.append((t, [float(v) for v in box], num, float(conf), where, idx))
        if num == number and crops_dir:
            Path(crops_dir).mkdir(parents=True, exist_ok=True)
            cv2.imwrite(str(Path(crops_dir) / f"s_{int(round(t * 10)):06d}.jpg"), crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
        return num

    def flush(final: bool, now_t: float) -> None:
        if not reads:
            return
        for sg in _cluster(reads, number, CLUSTER_GAP_SEC):
            if sg.t in emitted or (not final and now_t - sg.t < CLUSTER_GAP_SEC):
                continue
            emitted.add(sg.t)
            if crops_dir:
                p = Path(crops_dir) / f"s_{int(round(sg.t * 10)):06d}.jpg"
                sg.crop = str(p) if p.exists() else None
            res.sightings.append(sg)
            wall = time.time() - t_wall
            if res.first_sighting_wall_sec is None:
                res.first_sighting_wall_sec = round(wall, 1)
            if on_sighting:
                on_sighting(sg, wall)

    k = -1
    t = start
    while True:
        _t = time.perf_counter()
        nxt = next(it, None)
        tm["decode"] += time.perf_counter() - _t
        if nxt is None:
            break
        k += 1
        t, item = nxt
        sample = k % cfg.sample_every == 0
        due = [w for w in active if k in w["want"]]
        if not sample and not due:
            continue
        _t = time.perf_counter()
        frame = item() if callable(item) else item
        tm["convert"] += time.perf_counter() - _t
        if frame is None:
            continue
        res.height, res.width = frame.shape[:2]
        boxes, scores = detect(frame) if (sample or not cfg.roi_det) else (None, None)
        if sample:
            small = cv2.cvtColor(cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2HSV)
            if scene_cut(prev_small, small):
                cuts.append(t)
                active.clear()
                due = []
            prev_small = small
            tb = target_boxes(frame, boxes, scores)
            for b in tb:
                track.append((t, [float(v) for v in b]))
            cands = sorted((b for b in tb if b[3] - b[1] >= cfg.min_h), key=lambda b: -(b[3] - b[1]))
            stats["samples"] += 1
            stats["candidates"] += len(cands)
            last_read[:] = [r for r in last_read if t - r["t"] <= max(cfg.reread_sec * 2, cfg.settled_sec)]
            for b in cands[: cfg.max_ocr_per_sample]:
                h = b[3] - b[1]
                prev = next((r for r in last_read if _iou(b, r["box"]) >= 0.3), None)
                close = h >= cfg.close_min_h
                if prev and t - prev["t"] < (0.5 if close else cfg.reread_sec) and h < prev["h"] * cfg.reread_growth:
                    prev["box"] = b
                    stats["skipped"] += 1
                    continue
                if (prev and cfg.settled_sec > 0 and prev.get("settled") and t - prev["settled"] < cfg.settled_sec
                        and h < prev["h"] * cfg.reread_growth):
                    prev["box"] = b
                    stats["settled"] = stats.get("settled", 0) + 1
                    continue
                got = ocr(k, t, frame, b)
                if prev:
                    prev.update(box=b, t=t, h=h)
                else:
                    prev = {"box": b, "t": t, "h": h}
                    last_read.append(prev)
                if got and len(got) == len(number) and got != number:
                    seen = prev.setdefault("others", {})
                    seen[got] = seen.get(got, 0) + 1
                    if seen[got] >= 2:
                        prev["settled"] = t
                nb = sorted(d for d in cfg.close_neighbours if d > 0) if close else forward
                evidence = got == number or (got is not None and len(got) == 1 and got in digits)
                wanted = (evidence or close) if cfg.evidence_densify else h >= cfg.dense_min_h
                if nb and wanted and not any(_iou(b, w["box"]) >= 0.3 for w in active):
                    active.append({"box": b, "want": {k + d for d in nb}})
        for w in due:
            # adaptive density: same player (overlap) on the following frames, read again
            wb, ws = (boxes, scores) if boxes is not None else roi_detect(frame, w["box"])
            if len(wb):
                ious = [_iou(w["box"], x) for x in wb]
                m = int(np.argmax(ious))
                if ious[m] >= 0.3 and target_boxes(frame, [wb[m]], [1.0]):
                    # 5.0: the followed box must still look like a target-kit player on the pitch
                    # (a window can otherwise drift onto a spectator or another person)
                    w["box"] = wb[m]
                    got = ocr(k, t, frame, wb[m])
                    if cfg.evidence_densify and (got == number or (got and len(got) == 1 and got in digits)):
                        # keep following a player who keeps showing (part of) the number
                        last = max(w["want"] | {k})
                        w["want"] |= {last + 1, last + 2} if last - k < 8 else set()
            w["want"].discard(k)
        active[:] = [w for w in active if w["want"]]
        if sample:
            flush(final=False, now_t=t)
            if progress and stats["samples"] % 200 == 0:
                progress(t, time.time() - t_wall, dict(stats))
    flush(final=True, now_t=t)
    res.frames = k + 1
    for r_ in reads:
        if r_[2]:
            res.read_counts[r_[2]] = res.read_counts.get(r_[2], 0) + 1
    res.moments = merge_overlapping([sighting_moment(sg, track, cuts, start, end, res.width, res.height)
                                     for sg in res.sightings])
    res.timings = {k_: round(v, 2) for k_, v in tm.items()} | {"wall": round(time.time() - t_wall, 1)} | stats
    return res


def _cluster(reads, number: str, gap: float) -> list[Sighting]:
    """Groups reads of the same player (time gap + box overlap); a cluster with any other
    full-length number abstains (lone digits are ignored). Only clusters that read the target number become sightings."""
    groups: list[list] = []
    for r in sorted(reads, key=lambda r: r[0]):
        for g in groups:
            last = g[-1]
            if r[0] - last[0] <= gap and _iou(r[1], last[1]) >= 0.1:
                g.append(r)
                break
        else:
            groups.append([r])
    out = []
    for g in groups:
        # Only full-length reads count as evidence or conflict; a lone digit is a partial view of
        # a number (e.g. the "1" or "2" of a turning #20) and is ignored, as in identity resolution.
        nums = {r[2] for r in g if r[2] and len(r[2]) == len(number)}
        if nums != {number}:
            continue
        hits = [r for r in g if r[2] == number]
        strong = [r for r in hits if not str(r[4] or "").startswith("weak")]
        best = max(strong or hits, key=lambda r: r[3])
        out.append(Sighting(t=round(best[0], 2), box=best[1], number=number, conf=round(best[3], 3), frames=len(strong),
                            weak_frames=len(hits) - len(strong)))
    return out


def sighting_moment(s: Sighting, track, cuts, start: float, end: float, width: int, height: int) -> dict:
    """Clip window around a sighting, cut at camera cuts, with the target outline followed by
    box overlap through the sampled detections (stops when the chain breaks)."""
    lo = max([start] + [c for c in cuts if c <= s.t])
    hi = min([end] + [c for c in cuts if c > s.t])
    c0, c1 = max(lo, s.t - LEAD_SEC), min(hi, s.t + TAIL_SEC)
    if c1 - c0 < 3.0:
        c1 = min(hi, c0 + 3.0)
    by_t: dict[float, list] = {}
    for t, b in track:
        if c0 <= t <= c1:
            by_t.setdefault(round(t, 2), []).append(b)
    indicator = [[s.t, *_norm(s.box, width, height)]]
    for direction in (1, -1):
        cur = s.box
        times = sorted((t for t in by_t if (t - s.t) * direction > 0), key=lambda t: abs(t - s.t))
        for t in times:
            cands = by_t[t]
            ious = [_iou(cur, b) for b in cands]
            m = int(np.argmax(ious))
            if ious[m] < 0.2:
                break
            cur = cands[m]
            indicator.append([t, *_norm(cur, width, height)])
    indicator.sort(key=lambda p: p[0])
    # 5.0: one read is not enough to confirm. On a second recording (IMG_5105) single reads at
    # 0.90-0.95 confidence were wrong 3 times in 20 minutes ("19" on a #17, "11" on a spectator,
    # "41" on a side view). A sighting is CONFIRMED only with >= MIN_CONFIRM_READS agreeing reads
    # in different frames; a single read is a moment to check ("Is this you?").
    confirmed = is_confirmed(s.frames, s.weak_frames)
    return {"id": f"d_{int(round(s.t * 10))}", "kind": "sighting", "start": s.t, "end": s.t,
            "clipStart": round(c0, 2), "clipEnd": round(c1, 2),
            "identityState": "CONFIRMED_VISIBLE" if confirmed else "LIKELY_VISIBLE",
            "evidence": "number_read", "number": s.number, "readFrames": s.frames, "weakFrames": s.weak_frames,
            "candidate": not confirmed,
            "indicator": [[round(v, 4) if i else round(v, 2) for i, v in enumerate(p)] for p in indicator][:40],
            "thumbCrop": s.crop}


def merge_overlapping(moments: list[dict], max_clip: float = 20.0) -> list[dict]:
    """Sightings of the same moment (overlapping clips) become one moment: the best-read one is
    kept, its clip widened to cover both (never beyond `max_clip`)."""
    out: list[dict] = []
    for m in sorted(moments, key=lambda m: m["clipStart"]):
        prev = out[-1] if out else None
        if prev and m["clipStart"] <= prev["clipEnd"] and max(m["clipEnd"], prev["clipEnd"]) - prev["clipStart"] <= max_clip:
            keep = m if m["readFrames"] > prev["readFrames"] else prev
            frames = prev["readFrames"] + m["readFrames"]
            weak = prev.get("weakFrames", 0) + m.get("weakFrames", 0)
            ok = is_confirmed(frames, weak)
            merged = dict(keep, clipStart=prev["clipStart"], clipEnd=max(m["clipEnd"], prev["clipEnd"]),
                          readFrames=frames, weakFrames=weak, identityState="CONFIRMED_VISIBLE" if ok else "LIKELY_VISIBLE",
                          candidate=not ok,
                          indicator=sorted(prev["indicator"] + [p for p in m["indicator"] if p[0] not in {q[0] for q in prev["indicator"]}])[:40])
            out[-1] = merged
        else:
            out.append(m)
    return out


def _norm(b, w, h):
    return [b[0] / w, b[1] / h, (b[2] - b[0]) / w, (b[3] - b[1]) / h]


def sighting_priority(sightings: list[float], segments: list[tuple[float, float]]) -> list[int]:
    """Prioritised segment order for the full pass: segments containing sightings first (they
    anchor identity), in match order; then the rest in match order."""
    hit = [i for i, (a, b) in enumerate(segments) if any(a <= t < b for t in sightings)]
    return hit + [i for i in range(len(segments)) if i not in hit]
