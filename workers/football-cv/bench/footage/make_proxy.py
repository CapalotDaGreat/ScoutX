"""Product-equivalent 10 fps proxy, delivered as transfer-sized chunks with a timestamp map.

Usage (owner PC VM): python3 make_proxy.py SOURCE.MOV OUT_DIR [CHUNK_SEC=300]
(The owner-PC VM kills work at the end of each 180 s call, so it uses 60 s chunks; the only effect is an
extra keyframe at each chunk start, recorded in the manifest as chunkSec.)
Encoding matches scoutx_tracker.cli.make_proxies (the product path): per 300 s chunk,
  ffmpeg -ss START -t LEN -i SRC -map 0:v:0 -an -vf "fps=10,scale='min(1920,iw)':-2" -c:v libx264
         -preset veryfast -crf 24 -g 20
plus `-map_metadata -1` (drops location/device tags from the derivative; video bits are unchanged by it).
No colour conversion: HDR (HLG/PQ) stays in the stream exactly as the product proxy keeps it.
Chunks are concatenated with stream copy in the workspace (assemble.py) to rebuild ONE full-match proxy,
so identity context is never reset at chunk boundaries. A chunk above the transfer target is re-encoded
as halves. Re-runs reuse valid chunks.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from library import (
    TRANSFER_TARGET_BYTES,
    chunk_plan,
    split_for_size,
    validate_proxy,
)

FPS = 10


def probe_json(p: Path, count: bool = False) -> dict:
    cmd = ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams"]
    if count:
        cmd += ["-count_packets"]
    r = subprocess.run(cmd + [str(p)], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


def first_video_pts(src: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=start_time",
                        "-of", "default=nw=1:nk=1", str(src)], capture_output=True, text=True, check=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def stream_hash(args: list[str]) -> str:
    r = subprocess.run(["ffmpeg", "-v", "error", *args, "-map", "0:v:0", "-c", "copy", "-f", "streamhash",
                        "-hash", "sha256", "-"], capture_output=True, text=True, check=True)
    return r.stdout.strip().splitlines()[-1].split("SHA256=", 1)[1]


def file_sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as fh:
        for b in iter(lambda: fh.read(8 << 20), b""):
            h.update(b)
    return h.hexdigest()


def encode(src: Path, c: dict, out: Path) -> dict:
    tmp = out.with_suffix(".tmp.mp4")
    cmd = ["ffmpeg", "-y", "-v", "error", "-ss", f"{c['sourceStart']:.3f}", "-t", f"{c['sourceEnd'] - c['sourceStart']:.3f}",
           "-i", str(src), "-map", "0:v:0", "-an", "-map_metadata", "-1", "-vf", f"fps={FPS},scale='min(1920,iw)':-2",
           "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-g", "20", str(tmp)]
    t0 = time.time()
    subprocess.run(cmd, check=True)
    tmp.rename(out)
    pj = probe_json(out, count=True)
    v = next(s for s in pj["streams"] if s["codec_type"] == "video")
    num, _, den = v["avg_frame_rate"].partition("/")
    dec = subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-f", "null", "-"], capture_output=True, text=True, check=False)
    info = {"file": out.name, "sizeBytes": out.stat().st_size, "sha256": file_sha(out),
            "frames": int(v.get("nb_read_packets") or 0), "fps": float(num) / float(den), "width": v["width"],
            "height": v["height"], "pixFmt": v.get("pix_fmt"), "colorTransfer": v.get("color_transfer"),
            "audioStreams": sum(1 for s in pj["streams"] if s["codec_type"] == "audio"),
            "formatTags": sorted((pj.get("format") or {}).get("tags", {}).keys()),
            "decodeOk": dec.returncode == 0 and not dec.stderr.strip(), "encodeSec": round(time.time() - t0, 1),
            "command": cmd}
    info["problems"] = validate_proxy(info, duration=c["sourceEnd"] - c["sourceStart"], fps=FPS)
    return info


def main() -> None:
    src, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    chunk_sec = float(sys.argv[3]) if len(sys.argv) > 3 else 300.0
    out_dir.mkdir(parents=True, exist_ok=True)
    mpath = out_dir / "proxy_manifest.json"
    old = json.loads(mpath.read_text()) if mpath.exists() else {}
    src_probe = probe_json(src)
    dur = float(src_probe["format"]["duration"])
    plan = chunk_plan(dur, chunk_sec)
    done = {(c["sourceStart"], c["sourceEnd"]): c for c in old.get("chunks", []) if not c.get("problems")}
    chunks, queue = [], list(plan)
    while queue:
        c = queue.pop(0)
        name = f"p_{c['sourceStart']:09.3f}_{c['sourceEnd']:09.3f}.mp4".replace(".", "_", 1)
        prev = done.get((c["sourceStart"], c["sourceEnd"]))
        if prev and (out_dir / prev["file"]).exists() and (out_dir / prev["file"]).stat().st_size == prev["sizeBytes"]:
            chunks.append(prev)
            continue
        info = encode(src, c, out_dir / name)
        parts = split_for_size(c, info["sizeBytes"], TRANSFER_TARGET_BYTES)
        if len(parts) > 1:
            (out_dir / name).rename(out_dir / (name + ".oversize"))
            queue[:0] = parts
            continue
        chunks.append({**c, **info})
        mpath.write_text(json.dumps({"source": src.name, "chunks": chunks}, indent=1))
    chunks.sort(key=lambda c: c["sourceStart"])
    lst = out_dir / "concat.txt"
    lst.write_text("".join(f"file '{c['file']}'\n" for c in chunks))
    full_hash = stream_hash(["-f", "concat", "-safe", "0", "-i", str(lst)])
    total_frames = sum(c["frames"] for c in chunks)
    manifest = {"source": src.name, "sourceDurationSec": dur, "chunkSec": chunk_sec, "sourceFirstVideoPts": first_video_pts(src),
                "timeMapping": "proxy_t = source_t - sourceFirstVideoPts; chunk k covers [sourceStart, sourceEnd) "
                               "and is concatenated in order (stream copy) into one proxy",
                "fps": FPS, "chunks": chunks, "totalFrames": total_frames,
                "concatVideoStreamSha256": full_hash,
                "ffmpeg": subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, check=False).stdout.splitlines()[0],
                "problems": [f"{c['file']}: {p}" for c in chunks for p in c.get("problems", [])]}
    mpath.write_text(json.dumps(manifest, indent=1))
    print(json.dumps({k: manifest[k] for k in ("source", "totalFrames", "concatVideoStreamSha256", "problems")}))


if __name__ == "__main__":
    main()
