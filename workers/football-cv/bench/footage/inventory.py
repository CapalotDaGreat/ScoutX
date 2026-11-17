"""Scan the iCloud Photos folder without triggering downloads; probe files that are already local.

Usage (owner PC VM): python3 inventory.py PHOTOS_DIR MANIFEST.jsonl [--hash] [--decode] [--only NAME ...]
- A cloud placeholder fails to open with EINVAL inside the VM; we record it as `cloud` and never retry
  in a way that could download it. Readable files get ffprobe metadata, capture date and (optionally)
  SHA-256 and a decode check at 3 points. Re-runs skip files whose size+mtime are unchanged.
"""
from __future__ import annotations

import argparse
import errno
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from library import Manifest, capture_date, number_hint

VIDEO_EXT = {".mov", ".mp4", ".m4v"}
MATCH_MIN_SEC = 600.0


def availability(p: Path) -> str:
    try:
        fd = os.open(p, os.O_RDONLY)
    except OSError as e:
        return "cloud" if e.errno == errno.EINVAL else f"error:{errno.errorcode.get(e.errno, e.errno)}"
    try:
        os.read(fd, 1)
        return "local"
    except OSError as e:
        return "cloud" if e.errno == errno.EINVAL else f"error:{errno.errorcode.get(e.errno, e.errno)}"
    finally:
        os.close(fd)


def ffprobe(p: Path) -> dict:
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(p)],
                       capture_output=True, text=True, timeout=120, check=False)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-300:])
    return json.loads(r.stdout)


def summarize(pr: dict) -> dict:
    v = next((s for s in pr.get("streams", []) if s.get("codec_type") == "video"), {})
    rot = None
    for sd in v.get("side_data_list") or []:
        if "rotation" in sd:
            rot = sd["rotation"]
    rot = rot if rot is not None else (v.get("tags") or {}).get("rotate")
    num, _, den = (v.get("avg_frame_rate") or "0/1").partition("/")
    fps = float(num) / float(den or 1) if float(den or 1) else None
    dur = float((pr.get("format") or {}).get("duration") or 0) or None
    tags = (pr.get("format") or {}).get("tags") or {}
    return {"durationSec": dur, "width": v.get("width"), "height": v.get("height"), "rotation": rot,
            "fps": round(fps, 3) if fps else None, "codec": v.get("codec_name"), "profile": v.get("profile"),
            "pixFmt": v.get("pix_fmt"), "colorTransfer": v.get("color_transfer"), "colorPrimaries": v.get("color_primaries"),
            "audioStreams": sum(1 for s in pr.get("streams", []) if s.get("codec_type") == "audio"),
            "make": tags.get("com.apple.quicktime.make"), "model": tags.get("com.apple.quicktime.model"),
            "hasLocation": any("location" in k for k in tags), "kind": "match-length" if (dur or 0) >= MATCH_MIN_SEC else "clip"}


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for b in iter(lambda: fh.read(8 << 20), b""):
            h.update(b)
    return h.hexdigest()


def decode_check(p: Path, dur: float) -> dict:
    res = {}
    for frac in (0.02, 0.5, 0.97):
        t = max(0.0, dur * frac - 1)
        r = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", str(p), "-map", "0:v:0", "-t", "1",
                            "-f", "null", "-"], capture_output=True, text=True, timeout=300, check=False)
        res[f"{frac}"] = "ok" if r.returncode == 0 and not r.stderr.strip() else (r.stderr.strip()[-200:] or f"rc {r.returncode}")
    return {"decodeOk": all(v == "ok" for v in res.values()), "decodePoints": res}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("root")
    ap.add_argument("manifest")
    ap.add_argument("--hash", action="store_true")
    ap.add_argument("--decode", action="store_true")
    ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    root = Path(a.root)
    m = Manifest(a.manifest)
    files = sorted(p for p in root.rglob("*") if p.suffix.lower() in VIDEO_EXT and p.is_file())
    if a.only:
        files = [p for p in files if p.stem in set(a.only) or p.name in set(a.only)]
    counts = {}
    for p in files:
        key = p.relative_to(root).as_posix()
        st = p.stat()
        prev = m.get(key) or {}
        avail = availability(p)
        rec = {"name": p.name, "sizeBytes": st.st_size, "mtime": int(st.st_mtime), "availability": avail}
        same = (prev.get("sizeBytes") == st.st_size and prev.get("mtime") == int(st.st_mtime)
                and prev.get("availability") == avail)
        if avail == "local" and not (same and prev.get("probe")):
            try:
                pr = ffprobe(p)
                cd = capture_date(pr, st.st_mtime)
                rec.update(probe=summarize(pr), captureDate=cd,
                           numberHint=number_hint(cd.get("localDate"), cd.get("localDateRange")),
                           rawTags=(pr.get("format") or {}).get("tags"))
            except Exception as e:  # noqa: BLE001 - recorded per file, run continues
                # A readable file can still be mid-download (e.g. "moov atom not found"): never hash or trust it.
                rec.update(probeError=str(e)[-300:], availability="incomplete", probe=None, sha256=None)
        probe = {} if rec.get("availability") == "incomplete" else (rec.get("probe") or prev.get("probe") or {})
        avail = rec["availability"]
        if avail == "local" and probe and a.hash and not (same and prev.get("sha256")):
            rec["sha256"] = sha256(p)
        if avail == "local" and a.decode and probe.get("durationSec") and not (same and "decodeOk" in prev):
            rec.update(decode_check(p, probe["durationSec"]))
        if rec != {k: prev.get(k) for k in rec}:
            m.put(key, **rec)
        counts[avail] = counts.get(avail, 0) + 1
    print(json.dumps({"files": len(files), "availability": counts}))


if __name__ == "__main__":
    main()
