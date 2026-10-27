"""5.0: explicit colour handling for decoding (SDR, HLG and PQ recordings).

Every colour-dependent feature (kit palette, team separation) works on 8-bit BT.709 SDR BGR. The
decoder must therefore turn each recording into that one working space *explicitly*:

* SDR (BT.709 / BT.601 / untagged, 8 or 10 bit): plain YCbCr -> RGB with the tagged matrix and
  range. Measured: ffmpeg's conversion is bit-identical to OpenCV's on 8-bit BT.709 footage.
* HLG (ARIB STD-B67, e.g. iPhone HDR video): HLG -> display light with the BT.2408 reference
  white (203 cd/m2), BT.2020 -> BT.709 primaries, BT.709 transfer, full range. No extra tone
  mapping is needed for HLG at reference white.
* PQ (SMPTE ST 2084, HDR10): linearise, BT.2020 -> BT.709 primaries, Hable tone mapping, BT.709.

OpenCV's FFmpeg backend converts 10-bit HLG with an undocumented path (≈ 20 grey levels mean
difference from any standard conversion we tried). On 94 randomly sampled, developer-labelled
detections from IMG_4809 the explicit HLG conversion classified the target kit at least as well as
OpenCV at the calibrated threshold (recall 0.83 vs 0.80, 0 vs 1 false positive at kit >= 0.30), so
the kit thresholds are unchanged. See docs/video/intelligence-5.0-report for the measurement.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from dataclasses import dataclass

HLG = {"arib-std-b67"}
PQ = {"smpte2084"}


@dataclass(frozen=True)
class ColourInfo:
    width: int
    height: int
    pix_fmt: str
    transfer: str
    primaries: str
    matrix: str
    range: str
    fps: float
    duration: float

    @property
    def bit_depth(self) -> int:
        return 10 if ("10" in self.pix_fmt or "p010" in self.pix_fmt) else 12 if "12" in self.pix_fmt else 8

    @property
    def dynamic_range(self) -> str:
        """'hlg' | 'pq' | 'sdr'."""
        if self.transfer in HLG:
            return "hlg"
        if self.transfer in PQ:
            return "pq"
        return "sdr"


def _rate(v: str) -> float:
    try:
        n, d = v.split("/")
        return float(n) / float(d) if float(d) else 0.0
    except (ValueError, ZeroDivisionError):
        return 0.0


def probe(src: str) -> ColourInfo:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                          "stream=width,height,pix_fmt,color_transfer,color_primaries,color_space,color_range,avg_frame_rate"
                          ":format=duration", "-of", "json", src], capture_output=True, text=True, check=True)
    j = json.loads(out.stdout)
    s = (j.get("streams") or [{}])[0]
    return ColourInfo(width=int(s.get("width", 0)), height=int(s.get("height", 0)), pix_fmt=s.get("pix_fmt", ""),
                      transfer=s.get("color_transfer", "unknown"), primaries=s.get("color_primaries", "unknown"),
                      matrix=s.get("color_space", "unknown"), range=s.get("color_range", "tv"),
                      fps=_rate(s.get("avg_frame_rate", "0/1")), duration=float(j.get("format", {}).get("duration", 0) or 0))


_ZMAT = {"bt2020nc": "2020_ncl", "bt2020c": "2020_cl", "bt709": "709", "smpte170m": "170m", "bt470bg": "470bg"}
_SMAT = {"bt2020nc": "bt2020", "bt2020c": "bt2020", "bt709": "bt709", "smpte170m": "bt601", "bt470bg": "bt601"}


def working_space_filter(info: ColourInfo) -> str:
    """ffmpeg filter chain that converts this recording to the working space (8-bit BT.709 SDR,
    full-range BGR). The caller appends nothing else that changes colour."""
    rin = "full" if info.range in ("pc", "jpeg") else "limited"
    dr = info.dynamic_range
    if dr == "hlg":
        m = _ZMAT.get(info.matrix, "2020_ncl")
        return (f"zscale=min={m}:rin={rin}:pin=2020:tin=arib-std-b67:npl=203"
                ":m=709:p=709:t=709:r=full,format=gbrp")
    if dr == "pq":
        m = _ZMAT.get(info.matrix, "2020_ncl")
        return (f"zscale=min={m}:rin={rin}:pin=2020:tin=smpte2084:t=linear:npl=203,format=gbrpf32le,"
                "zscale=p=709,tonemap=hable:desat=0,zscale=t=709:m=709:r=full,format=gbrp")
    # SDR: untagged HD defaults to BT.709 (as OpenCV/swscale do), untagged SD to BT.601.
    m = _SMAT.get(info.matrix) or ("bt709" if info.height >= 720 else "bt601")
    return f"scale=in_color_matrix={m}:in_range={'pc' if rin == 'full' else 'tv'}"


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def zscale_available() -> bool:
    if not ffmpeg_available():
        return False
    out = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True)
    return " zscale " in out.stdout


def decode_command(src: str, start: float, end: float, fps: float | None, info: ColourInfo,
                   hwaccel: str = "", select_every: int = 1, threads: int = 0) -> list[str]:
    """ffmpeg command yielding raw BGR frames in the working colour space.

    `fps` resamples to that rate (None keeps the source rate); `select_every` then keeps one frame
    in N *before* colour conversion, so sparse passes do not pay for converting skipped frames."""
    vf = []
    if fps:
        vf.append(f"fps={fps}")
    if select_every > 1:
        vf.append(f"select='not(mod(n\\,{select_every}))'")
    vf.append(working_space_filter(info))
    return ["ffmpeg", "-v", "error", *(["-hwaccel", hwaccel] if hwaccel else []),
            *(["-threads", str(threads)] if threads else []),
            "-ss", f"{start:.3f}", "-t", f"{max(0.0, end - start):.3f}", "-i", src,
            "-vf", ",".join(vf), "-fps_mode", "passthrough", "-f", "rawvideo", "-pix_fmt", "bgr24", "-"]
