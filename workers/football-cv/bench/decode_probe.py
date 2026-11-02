"""Decode-path probe (5.3): hashes of frames START..START+COUNT-1 decoded exactly like stage 1 / the fp32
harness (cv2.VideoCapture, seek CAP_PROP_POS_FRAMES, sequential read), the VideoCapture backend actually used,
and per-channel statistics of three frames. Writes JSON only (no images). Compare two machines with --compare.
Also records OpenCV's bundled FFmpeg library versions and, with ffprobe on PATH, the stream colour metadata.

--ffmpeg-vf decodes the same frames through the FFmpeg CLI with an explicit filter instead (a documented decode
path), e.g. "scale=in_color_matrix=bt601:in_range=tv": that path reproduced all 301 hashes of the 2026-10-30
Windows run (OpenCV 5.0.0 prebuilt FFmpeg) with Linux FFmpeg 6.1.1. Matching hashes identify the conversion; they
do not make it the correct one for this HLG source.

    python bench/decode_probe.py --video IMG_4809_proxy_10fps.mp4 --out decode_windows.json
    python bench/decode_probe.py --video IMG_4809_proxy_10fps.mp4 --ffmpeg-vf "scale=in_color_matrix=bt601:in_range=tv" --out bt601.json
    python bench/decode_probe.py --compare decode_linux.json decode_windows.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys

MARK_STATS = 3


def _stats(f) -> dict:
    import numpy as np  # noqa: PLC0415

    return {"meanBGR": [round(float(f[..., c].mean()), 4) for c in range(3)],
            "stdBGR": [round(float(f[..., c].std()), 4) for c in range(3)],
            "histBGR": [np.bincount(f[..., c].ravel(), minlength=256).tolist() for c in range(3)]}


def stream_colour(video: str) -> dict | None:
    if not shutil.which("ffprobe"):
        return None
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=codec_name,profile,pix_fmt,color_range,color_space,color_transfer,color_primaries,"
                        "width,height,r_frame_rate", "-of", "json", video], capture_output=True, text=True)
    return (json.loads(r.stdout).get("streams") or [None])[0] if r.returncode == 0 else None


def cv2_ffmpeg_build() -> list[str]:
    import cv2  # noqa: PLC0415

    keys = ("FFMPEG", "avcodec", "avformat", "avutil", "swscale", "avresample")
    return [ln.strip() for ln in cv2.getBuildInformation().splitlines() if ln.strip().split(":")[0] in keys]


def probe_ffmpeg(video: str, start: int, count: int, vf: str) -> dict:
    """Same frames and JSON schema as probe(), decoded by the FFmpeg CLI with an explicit filter."""
    import hashlib as _h  # noqa: PLC0415

    import numpy as np  # noqa: PLC0415

    st = stream_colour(video) or {}
    w, h = int(st.get("width", 1920)), int(st.get("height", 1080))
    num, den = (st.get("r_frame_rate") or "10/1").split("/")
    fps = float(num) / float(den)
    ver = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    out = {"cv2": None, "backend": f"FFMPEG-CLI vf={vf}", "ffmpeg": ver, "platform": platform.platform(),
           "python": sys.version.split()[0], "start": start, "streamColour": st or None, "hashes": {}, "stats": {}}
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{start / fps:.6f}", "-i", video, "-frames:v", str(count),
                          "-vf", vf, "-pix_fmt", "bgr24", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    marks = {start, start + count // 2, start + count - 1}
    n = w * h * 3
    for k in range(start, start + count):
        b = p.stdout.read(n)
        if len(b) < n:
            break
        out["hashes"][str(k)] = _h.sha256(b).hexdigest()
        if k in marks:
            out["stats"][str(k)] = _stats(np.frombuffer(b, np.uint8).reshape(h, w, 3))
    p.stdout.close()
    p.wait()
    return out


def probe(video: str, start: int, count: int) -> dict:
    import cv2  # noqa: PLC0415

    cap = cv2.VideoCapture(video)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    out = {"cv2": cv2.__version__, "backend": cap.getBackendName(), "cv2FfmpegBuild": cv2_ffmpeg_build(),
           "platform": platform.platform(), "python": sys.version.split()[0], "start": start,
           "streamColour": stream_colour(video), "hashes": {}, "stats": {}}
    marks = {start, start + count // 2, start + count - 1}
    for _ in range(count):
        ok, f = cap.read()
        if not ok:
            break
        k = str(round(cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1)
        out["hashes"][k] = hashlib.sha256(f.tobytes()).hexdigest()
        if int(k) in marks:
            out["stats"][k] = _stats(f)
    cap.release()
    return out


def compare(a: dict, b: dict) -> dict:
    import numpy as np  # noqa: PLC0415

    common = sorted(set(a["hashes"]) & set(b["hashes"]), key=int)
    res = {"backends": [a["backend"], b["backend"]], "cv2": [a.get("cv2"), b.get("cv2")], "framesCompared": len(common),
           "identicalFrames": sum(a["hashes"][k] == b["hashes"][k] for k in common),
           # a frame-offset check: pixel differences must not hide misaligned frame numbering
           "identicalAtOffset": {str(d): sum(b["hashes"].get(str(int(k) + d)) == a["hashes"][k] for k in common)
                                 for d in (-2, -1, 1, 2)}, "frames": {}}
    for k in sorted(set(a["stats"]) & set(b["stats"]), key=int):
        ha, hb = (np.array(x["histBGR"], float) for x in (a["stats"][k], b["stats"][k]))
        res["frames"][k] = {"meanDiffBGR": [round(y - x, 4) for x, y in zip(a["stats"][k]["meanBGR"], b["stats"][k]["meanBGR"])],
                            "histL1ShareBGR": [round(float(np.abs(ha[c] - hb[c]).sum() / (2 * ha[c].sum())), 4) for c in range(3)]}
    res["note"] = "histL1ShareBGR is a distribution distance (share of pixels in differing bins), not a per-pixel error"
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video")
    ap.add_argument("--out")
    ap.add_argument("--start", type=int, default=11500)
    ap.add_argument("--count", type=int, default=301)
    ap.add_argument("--ffmpeg-vf", help="decode via the FFmpeg CLI with this filter instead of cv2.VideoCapture")
    ap.add_argument("--compare", nargs=2)
    a = ap.parse_args(argv)
    if a.compare:
        r = compare(*(json.load(open(p)) for p in a.compare))
    else:
        r = probe_ffmpeg(a.video, a.start, a.count, a.ffmpeg_vf) if a.ffmpeg_vf else probe(a.video, a.start, a.count)
        json.dump(r, open(a.out, "w"))
    print(json.dumps({k: v for k, v in r.items() if k not in ("hashes", "stats")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
