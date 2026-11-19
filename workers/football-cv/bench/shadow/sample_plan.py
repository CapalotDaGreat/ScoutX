"""Predeclared sampling plan for one shadow-evaluation match (written BEFORE any prediction exists).

    python3 bench/shadow/sample_plan.py --proxy-json P.json --group GROUP --out plan.json [--interval 10]
        [--sequences 3 --sequence-sec 20 --sequence-fps 2] [--exclude START-END ...]

- fixed:     one frame every `interval` s of proxy time (default 10 s), first at interval/2.
- sequences: `sequences` continuous windows of `sequence-sec` s, labelled at `sequence-fps`; window starts are
  drawn with a seed derived from the proxy's video-stream SHA-256 and the group id, so nobody (including the
  person who later looks at predictions) can choose them. Windows never overlap and avoid --exclude ranges
  (e.g. pre-match or half-time chosen from the raw video).
- difficult: NOT drawn here. The labeller picks them from the raw proxy without overlays and records them in
  difficult_stretches.csv before inference; freeze.py hashes that file into the freeze record.
The plan is deterministic: running it twice on the same inputs gives the same file (checked by freeze.py).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path


def build(duration: float, stream_sha: str, group: str, interval: float, n_seq: int, seq_sec: float, seq_fps: float,
          exclude: list[tuple[float, float]]) -> dict:
    fixed = []
    t = interval / 2
    while t < duration:
        if not any(a <= t < b for a, b in exclude):
            fixed.append(round(t, 2))
        t += interval
    seed = int(hashlib.sha256(f"{stream_sha}|{group}|sequences-v1".encode()).hexdigest()[:16], 16)
    rng = random.Random(seed)
    seqs: list[tuple[float, float]] = []
    tries = 0
    while len(seqs) < n_seq and tries < 10000:
        tries += 1
        a = round(rng.uniform(0, max(0.0, duration - seq_sec)), 1)
        b = a + seq_sec
        if any(not (b <= x or a >= y) for x, y in exclude) or any(not (b <= x or a >= y) for x, y in seqs):
            continue
        seqs.append((a, b))
    seqs.sort()
    step = 1.0 / seq_fps
    sequences = [{"id": f"seq_{i + 1}", "start": a, "end": b,
                  "frames": [round(a + k * step, 2) for k in range(int(round(seq_sec * seq_fps)))]} for i, (a, b) in enumerate(seqs)]
    return {"schema": "pitchproof.shadow-sample-plan.v1", "group": group, "proxyVideoStreamSha256": stream_sha,
            "durationSec": duration, "interval": interval, "exclude": exclude, "seed": seed, "fixed": fixed,
            "sequences": sequences, "difficult": "chosen by the labeller without predictions (difficult_stretches.csv)"}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--proxy-json", required=True)
    ap.add_argument("--group", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--interval", type=float, default=10.0)
    ap.add_argument("--sequences", type=int, default=3)
    ap.add_argument("--sequence-sec", type=float, default=20.0)
    ap.add_argument("--sequence-fps", type=float, default=2.0)
    ap.add_argument("--exclude", nargs="*", default=[])
    a = ap.parse_args()
    meta = json.loads(Path(a.proxy_json).read_text())
    duration = float(meta["frames"]) / 10.0
    exclude = [tuple(float(x) for x in r.split("-")) for r in a.exclude]
    plan = build(duration, meta["videoStreamSha256"], a.group, a.interval, a.sequences, a.sequence_sec, a.sequence_fps, exclude)
    out = Path(a.out)
    if out.exists() and json.loads(out.read_text()) != json.loads(json.dumps(plan)):
        raise SystemExit(f"{out} exists with a different plan (plans are append-only; write a new file)")
    out.write_text(json.dumps(plan, indent=1))
    print(json.dumps({"fixed": len(plan["fixed"]), "sequences": [(s["start"], s["end"]) for s in plan["sequences"]]}))


if __name__ == "__main__":
    main()
