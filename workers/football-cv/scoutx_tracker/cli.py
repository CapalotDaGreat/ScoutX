"""One-command player tracking.

  python -m scoutx_tracker track MATCH.MOV --number 20 --kit orange --kit2 white

Optional help for the AI (only needed if it can't find the player on its own):
  python -m scoutx_tracker pick MATCH.MOV --at 4:02          -> writes a frame with numbered boxes
  python -m scoutx_tracker track MATCH.MOV ... --anchor 4:02#3   (player is box 3 at 4:02)

Everything is resumable: re-running skips finished steps.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

CHUNK_SEC = 300
FPS = 10


def parse_clock(s: str) -> float:
    parts = [float(p) for p in s.strip().split(":")]
    sec = 0.0
    for p in parts:
        sec = sec * 60 + p
    return sec


def probe_duration(video: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def make_proxies(video: str, out_dir: Path, log) -> list[tuple[str, float]]:
    """1080p / 10 fps H.264 chunks: fast to decode, sharp enough to read shirt numbers."""
    out_dir.mkdir(parents=True, exist_ok=True)
    dur = probe_duration(video)
    chunks = []
    for k, start in enumerate(np.arange(0, dur, CHUNK_SEC)):
        path = out_dir / f"p_{int(start):05d}.mp4"
        chunks.append((str(path), float(start)))
        if path.exists() and path.stat().st_size > 0:
            continue
        log(f"preparing video {k + 1}/{int(np.ceil(dur / CHUNK_SEC))}")
        tmp = path.with_suffix(".tmp.mp4")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(start), "-t", str(CHUNK_SEC), "-i", video,
                        "-map", "0:v:0", "-an", "-vf", f"fps={FPS},scale='min(1920,iw)':-2", "-c:v", "libx264",
                        "-preset", "veryfast", "-crf", "24", "-g", "20", str(tmp)], check=True)
        tmp.rename(path)
    return chunks


def _extract_one(args):
    from .extract import extract  # noqa: PLC0415

    video, t0, out = args
    if (Path(out) / "detections.npz").exists():
        return out
    extract(video, out, t0=t0)
    return out


def cmd_track(a) -> None:
    out = Path(a.out or Path(a.video).with_suffix("").as_posix() + "_scoutx")
    out.mkdir(parents=True, exist_ok=True)
    t_start = time.time()

    def log(msg):
        print(f"[{time.time() - t_start:6.0f}s] {msg}", flush=True)

    chunks = make_proxies(a.video, out / "proxy", log)
    jobs = [(v, t0, str(out / "stage1" / f"c_{int(t0):05d}")) for v, t0 in chunks]
    todo = [j for j in jobs if not (Path(j[2]) / "detections.npz").exists()]
    if todo:
        log(f"finding and following players in {len(todo)} part(s) with {a.workers} worker(s)...")
        with ProcessPoolExecutor(max_workers=a.workers) as ex:
            for i, done in enumerate(ex.map(_extract_one, todo), 1):
                log(f"  part {i}/{len(todo)} done")
    (out / "config.json").write_text(json.dumps({"video": a.video, "number": a.number, "kit": a.kit,
                                                  "kit2": a.kit2, "highlight_sec": a.highlight_sec,
                                                  "position": a.position, "age_group": a.age_group}, indent=2))
    anchors = [resolve_anchor(s, out, jobs) for s in a.anchor]
    feedback = load_feedback(out)
    anchors += [tuple(x) for x in feedback["yes"]]
    rejects = [tuple(x) for x in feedback["no"]]
    finish(out, jobs, a.number, a.kit, a.kit2, anchors, rejects, a.highlight_sec, log, feedback, a.position, a.age_group)


def load_feedback(out: Path) -> dict:
    p = out / "feedback.json"
    fb = json.loads(p.read_text()) if p.exists() else {}
    fb.setdefault("yes", [])
    fb.setdefault("no", [])
    return fb


def finish(out: Path, jobs, number, kit, kit2, anchors, rejects, highlight_sec, log, feedback=None,
           position="unknown", age_group="") -> None:
    from .analyze import analyze  # noqa: PLC0415
    from .render import contact_sheet, question_cards, render_windows  # noqa: PLC0415
    from .report import write_report  # noqa: PLC0415
    from .tracklets import load_runs  # noqa: PLC0415

    log("identifying the player across the match...")
    result = analyze([j[2] for j in jobs], str(out), number, kit, kit2, anchors, log=log, rejects=rejects,
                     feedback=feedback, position=position, age_group=age_group)
    z = np.load(out / "timeline.npz", allow_pickle=False)
    label = f"#{number}" if number else "player"
    D = load_runs([j[2] for j in jobs])
    states = z["states"]
    claim = np.isin(states, ["CONFIRMED_VISIBLE", "LIKELY_VISIBLE"])

    class TL:  # what the renderers need; only claimed frames are drawn as the player
        times = z["times"]; present = z["present"] & claim; boxes = z["boxes"]  # noqa: E702
        evidence = np.where(states == "CONFIRMED_VISIBLE", "number", np.where(claim, "appearance", ""))
        interpolated = z["evidence"] == "interpolated"

    log("drawing report...")
    contact_sheet(D, TL, str(out / "who_we_followed.jpg"), label=label)
    windows = [(e["start"] - 2.5, e["end"] + 2.5) for e in result["events"] if e["identityState"] in
               ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")]
    windows += [(e["start"] - 1.0, e["end"] + 1.0) for e in result["physical"].get("sprints", [])]
    windows = merge_windows(windows, max_total=highlight_sec)
    if windows:
        render_windows(D, TL, z["speed"], windows, str(out / "highlights.mp4"), label)
    qpath = out / "questions.jpg"
    if result.get("reviewQuestions"):
        question_cards(D, result["reviewQuestions"], str(qpath))
    elif qpath.exists():
        qpath.unlink()
    write_report(str(out / "report.html"), result, {"times": z["times"], "states": states},
                 str(out / "who_we_followed.jpg"), str(out / "highlights.mp4") if windows else None,
                 str(qpath) if qpath.exists() else None, str(out))
    log(f"done -> {out / 'report.html'}")
    print(json.dumps({"coverage": result["coverage"], "invariants": result["invariants"]}, indent=2))


def merge_windows(windows, max_total: float = 240.0):
    windows = sorted((max(0.0, a), b) for a, b in windows)
    merged = []
    for a, b in windows:
        if merged and a <= merged[-1][1] + 0.5:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    out, total = [], 0.0
    for a, b in merged:
        if total + (b - a) > max_total:
            break
        out.append((a, b))
        total += b - a
    return out


def _frame_dets(stage1_dir: str, t: float):
    z = np.load(Path(stage1_dir) / "detections.npz")
    meta = json.loads((Path(stage1_dir) / "meta.json").read_text())
    times = z["times"]
    f = int(np.argmin(np.abs(times - t)))
    d = z["dets"][(z["dets"][:, 0] == f) & (z["dets"][:, 6] >= 0.4)]
    return meta, f, float(times[f]), d


def resolve_anchor(spec: str, out: Path, jobs) -> tuple[float, float, float]:
    """'4:02#3' (box 3 of the pick image) or '4:02@x,y' (pixel position)."""
    if "#" in spec:
        clock, box = spec.split("#")
        t = parse_clock(clock)
        job = max((j for j in jobs if j[1] <= t), key=lambda j: j[1])
        _, _, tt, d = _frame_dets(job[2], t)
        b = d[int(box) - 1]
        return tt, float((b[2] + b[4]) / 2), float((b[3] + b[5]) / 2)
    clock, xy = spec.split("@")
    x, y = xy.split(",")
    return parse_clock(clock), float(x), float(y)


def _rerun(out: Path, fb: dict) -> None:
    cfg = json.loads((out / "config.json").read_text())
    jobs = sorted(((None, float(p.name[2:]), str(p)) for p in (out / "stage1").glob("c_*")), key=lambda j: j[1])
    t_start = time.time()

    def log(msg):
        print(f"[{time.time() - t_start:6.0f}s] {msg}", flush=True)

    finish(out, jobs, cfg["number"], cfg["kit"], cfg["kit2"], [tuple(x) for x in fb["yes"]],
           [tuple(x) for x in fb["no"]], cfg.get("highlight_sec", 240.0), log, fb,
           cfg.get("position", "unknown"), cfg.get("age_group", ""))


def cmd_answer(a) -> None:
    """Answer the report's questions: 3y (that's me), 3n (not me), 3u (unsure), 3s (skip).
    Re-solves identity in seconds - the video is not processed again."""
    out = Path(a.out)
    result = json.loads((out / "result.json").read_text())
    qs = result.get("reviewQuestions", [])
    fb = load_feedback(out)
    fb.setdefault("history", [])
    for ans in a.answers:
        if len(ans) < 2 or not ans[:-1].isdigit() or ans[-1].lower() not in "ynus":
            sys.exit(f"answer '{ans}' should look like 3y, 3n, 3u or 3s")
        num, kind = int(ans[:-1]), ans[-1].lower()
        if not 1 <= num <= len(qs):
            sys.exit(f"question {num} does not exist (1..{len(qs)})")
        q = qs[num - 1]
        x1, y1, x2, y2 = q["box"]
        point = [q["t"], (x1 + x2) / 2, (y1 + y2) / 2]
        if kind in "yn":
            fb["yes" if kind == "y" else "no"].append(point)
        fb["history"].append({"q": q["tid"], "t": q["t"], "answer": {"y": "yes", "n": "not_me", "u": "unsure",
                                                                    "s": "skip"}[kind], "point": point})
    (out / "feedback.json").write_text(json.dumps(fb, indent=2))
    _rerun(out, fb)


def cmd_undo(a) -> None:
    """Undo the last yes / not-me answer."""
    out = Path(a.out)
    fb = load_feedback(out)
    hist = [h for h in fb.get("history", []) if h["answer"] in ("yes", "not_me")]
    if not hist:
        sys.exit("nothing to undo")
    last = hist[-1]
    key = "yes" if last["answer"] == "yes" else "no"
    if last["point"] in fb[key]:
        fb[key].remove(last["point"])
    fb["history"].remove(last)
    (out / "feedback.json").write_text(json.dumps(fb, indent=2))
    _rerun(out, fb)


def cmd_periods(a) -> None:
    """Correct match boundaries, e.g. --kickoff 2:10 --halftime 47:30 --second-half 62:00 --fulltime 108:20."""
    out = Path(a.out)
    fb = load_feedback(out)
    per = fb.get("periods", {})
    for key, val in (("kickoff", a.kickoff), ("halftimeStart", a.halftime), ("secondHalfStart", a.second_half),
                     ("fulltime", a.fulltime)):
        if val:
            per[key] = parse_clock(val)
    fb["periods"] = per
    (out / "feedback.json").write_text(json.dumps(fb, indent=2))
    _rerun(out, fb)


def cmd_pick(a) -> None:
    import cv2  # noqa: PLC0415

    out = Path(a.out or Path(a.video).with_suffix("").as_posix() + "_scoutx")
    t = parse_clock(a.at)
    cap = cv2.VideoCapture(a.video)
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, frame = cap.read()
    if not ok:
        sys.exit("could not read that moment of the video")
    from .extract import Detector  # noqa: PLC0415

    pb, ps, _, _ = Detector()(frame)
    keep = ps >= 0.4
    pb = pb[keep]
    for i, b in enumerate(pb, 1):
        x1, y1, x2, y2 = (int(v) for v in b)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 255), 2)
        cv2.putText(frame, str(i), (x1, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 0), 5)
        cv2.putText(frame, str(i), (x1, y1 - 6), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"pick_{a.at.replace(':', '-')}.jpg"
    cv2.imwrite(str(path), frame)
    print(f"Open {path} and find your player's number box, then run:\n"
          f"  python -m scoutx_tracker track \"{a.video}\" --number N --kit COLOUR --anchor {a.at}#BOX")
    print("note: box numbers in this picture match the tracker's own detections at that moment")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="scoutx_tracker", description="Follow one player through a match video.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("track", help="track a player and produce stats + report")
    t.add_argument("video")
    t.add_argument("--number", help="shirt number, e.g. 20")
    t.add_argument("--kit", required=True, help="main shirt colour, e.g. orange")
    t.add_argument("--kit2", default="", help="second kit colour (sleeves/shorts), optional")
    t.add_argument("--anchor", action="append", default=[], help="help the AI: 4:02#3 or 4:02@x,y")
    t.add_argument("--out", help="output folder (default: next to the video)")
    t.add_argument("--workers", type=int, default=2)
    t.add_argument("--position", default="unknown",
                   help="goalkeeper, centre_back, full_back, defensive_midfielder, midfielder, winger, striker")
    t.add_argument("--age-group", default="", help="e.g. u14, u17, adult, pro (sets speed thresholds)")
    t.add_argument("--highlight-sec", type=float, default=240.0)
    t.set_defaults(func=cmd_track)
    u = sub.add_parser("undo", help="undo the last yes / not-me answer")
    u.add_argument("out")
    u.set_defaults(func=cmd_undo)
    pr = sub.add_parser("periods", help="correct kick-off / half-time / full-time")
    pr.add_argument("out")
    pr.add_argument("--kickoff")
    pr.add_argument("--halftime")
    pr.add_argument("--second-half")
    pr.add_argument("--fulltime")
    pr.set_defaults(func=cmd_periods)
    r = sub.add_parser("answer", help="answer the report's questions, e.g. 1y 2n 3u 4s")
    r.add_argument("out", help="the output folder of a previous track run")
    r.add_argument("answers", nargs="+")
    r.set_defaults(func=cmd_answer)
    p = sub.add_parser("pick", help="show numbered players at a moment so you can point at yours")
    p.add_argument("video")
    p.add_argument("--at", required=True, help="time, e.g. 4:02")
    p.add_argument("--out")
    p.set_defaults(func=cmd_pick)
    a = ap.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main()
