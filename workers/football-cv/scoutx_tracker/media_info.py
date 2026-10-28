"""5.2: input-video metadata for benchmarks and checkpoints.

Everything a reader needs to know whether two runs processed the same input: container, codec,
profile, pixel format and colour transfer (HDR changes the decoding path), resolution, frame rate,
duration, exact frame count, size and a SHA-256 of the file.
"""

from __future__ import annotations

import json
import subprocess
from fractions import Fraction
from pathlib import Path

from .envinfo import sha256_file

HDR_TRANSFERS = {"arib-std-b67": "HLG", "smpte2084": "PQ"}


def _rate(s: str | None) -> float | None:
    try:
        f = Fraction(s)
        return float(f) if f else None
    except (TypeError, ValueError, ZeroDivisionError):
        return None


def probe(video: str | Path, count_frames: bool = True) -> dict:
    """ffprobe facts of the first video stream. `count_frames` demuxes the file once to count packets
    when the container has no frame count (seconds for a match-length file; no decoding)."""
    cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
           "stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,avg_frame_rate,nb_frames,color_transfer,"
           "color_primaries,color_space,bit_rate:stream_side_data=rotation:format=duration,size,format_name,bit_rate",
           "-of", "json", str(video)]
    d = json.loads(subprocess.run(cmd, capture_output=True, text=True, check=True).stdout)
    s = (d.get("streams") or [{}])[0]
    f = d.get("format", {})
    frames = int(s["nb_frames"]) if str(s.get("nb_frames", "")).isdigit() else None
    if frames is None and count_frames:
        c = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries",
                            "stream=nb_read_packets", "-of", "csv=p=0", str(video)], capture_output=True, text=True)
        frames = int(c.stdout.strip()) if c.returncode == 0 and c.stdout.strip().isdigit() else None
    transfer = s.get("color_transfer")
    rot = next((sd.get("rotation") for sd in s.get("side_data_list", []) if "rotation" in sd), None)
    return {
        "container": f.get("format_name"), "codec": s.get("codec_name"), "profile": s.get("profile"),
        "pixFmt": s.get("pix_fmt"), "colorTransfer": transfer, "colorPrimaries": s.get("color_primaries"),
        "colorSpace": s.get("color_space"), "hdr": HDR_TRANSFERS.get(transfer or ""),
        "width": s.get("width"), "height": s.get("height"), "rotation": rot,
        "fps": _rate(s.get("r_frame_rate")), "avgFps": _rate(s.get("avg_frame_rate")),
        "frames": frames, "durationSec": float(f["duration"]) if f.get("duration") else None,
        "sizeBytes": int(f["size"]) if f.get("size") else Path(video).stat().st_size,
        "bitRate": int(f["bit_rate"]) if str(f.get("bit_rate", "")).isdigit() else None,
    }


def describe(video: str | Path, with_hash: bool = True) -> dict:
    info = {"basename": Path(video).name, **probe(video)}
    if with_hash:
        info["sha256"] = sha256_file(video)
    return info


def match_reference(info: dict, reference: dict) -> dict:
    """Is `info` exactly the validated reference recording? Byte identity (SHA-256) decides; the other
    fields explain a mismatch."""
    fields = ("sha256", "sizeBytes", "codec", "width", "height", "fps", "frames", "durationSec")
    diff = {k: {"input": info.get(k), "reference": reference.get(k)} for k in fields
            if reference.get(k) is not None and info.get(k) != reference.get(k)}
    return {"isReference": info.get("sha256") == reference.get("sha256") and not diff, "reference": reference.get("name"),
            "differences": diff}
