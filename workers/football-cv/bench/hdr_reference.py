"""Documented decoding reference CANDIDATE for BT.2100 HLG footage (5.3 HDR audit). Experimental, bench-only.

It is not ground truth and is not used by inference. Stages, each with its assumption:

  1. Native samples: H.264 High 10 decoded to yuv420p10le planes without any conversion (bit-exact across decoder
     builds - checked, not assumed - see `native_planes` and the report).
  2. Chroma 4:2:0 -> 4:4:4: bilinear, honouring chroma_sample_loc_type 0 (H.264 default when the VUI does not
     signal it: horizontally co-sited with even luma columns, vertically midway between rows). ASSUMPTION: filter.
  3. Y'CbCr -> R'G'B' with the signalled matrix (H.273 matrix_coefficients 9 = BT.2020/BT.2100 non-constant
     luminance, Kr 0.2627, Kb 0.0593) and range (video_full_range_flag 0: 10-bit Y' 64..940, Cb/Cr 64..960 about 512).
     Result: non-linear HLG R'G'B' signal (transfer 18 = ARIB STD-B67 / BT.2100 HLG), BT.2020 primaries.
  4. Rendering for an 8-bit SDR BT.709 model input - the HLG "backward-compatible" display rendering: the HLG signal is
     shown as an SDR gamma-2.2 signal (BBC/ITU description of HLG compatibility with SDR displays), primaries are
     converted BT.2020 -> BT.709 in that display-linear light with the matrix derived from the BT.2020 and BT.709
     primaries and D65, negative / >1 values are hard-clipped, and the result is re-encoded with gamma 1/2.2 (neutral colours keep their signal value to within one 8-bit code).
     ASSUMPTIONS: no HLG OOTF / peak-luminance choice, no highlight tone mapping, gamma 2.2 (2.4 is reported as a
     sensitivity variant), hard gamut clipping.
  5. Quantisation: 8-bit full range, round half up, BGR order (what the models receive from OpenCV).

`zscale_filter` gives an independent implementation of the same chain with zimg (FFmpeg zscale), used as a
cross-check. Rendered frames are never written to disk by this module.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np

KR, KB = 0.2627, 0.0593                       # BT.2020 / BT.2100 NCL luma coefficients
PRIMARIES = {"bt2020": ((0.708, 0.292), (0.170, 0.797), (0.131, 0.046)),
             "bt709": ((0.640, 0.330), (0.300, 0.600), (0.150, 0.060))}
D65 = (0.3127, 0.3290)
REFERENCE = {"name": "hlg-bc709-g2.2-v1", "matrix": "bt2020nc", "range": "limited", "chroma": "bilinear, loc 0 (left)",
             "rendering": "HLG signal as SDR gamma 2.2 display signal", "gamut": "BT.2020->BT.709 linear matrix, hard clip",
             "gamma": 2.2, "output": "8-bit full-range BGR, round half up"}


def npm(primaries, white=D65) -> np.ndarray:
    """RGB -> XYZ normalised primary matrix (SMPTE RP 177 construction)."""
    xyz = lambda x, y: np.array([x / y, 1.0, (1 - x - y) / y])  # noqa: E731
    P = np.stack([xyz(*p) for p in primaries], 1)
    S = np.linalg.solve(P, xyz(*white))
    return P * S


def bt2020_to_bt709() -> np.ndarray:
    return np.linalg.inv(npm(PRIMARIES["bt709"])) @ npm(PRIMARIES["bt2020"])


def ycbcr10_narrow_to_rgb(y: np.ndarray, cb: np.ndarray, cr: np.ndarray, kr: float = KR, kb: float = KB) -> np.ndarray:
    """10-bit narrow-range Y'CbCr codes (any shape, 4:4:4) -> non-linear R'G'B' (float64, unclipped)."""
    yn = (np.asarray(y, np.float64) - 64.0) / 876.0
    pb = (np.asarray(cb, np.float64) - 512.0) / 896.0
    pr = (np.asarray(cr, np.float64) - 512.0) / 896.0
    kg = 1.0 - kr - kb
    r = yn + 2 * (1 - kr) * pr
    b = yn + 2 * (1 - kb) * pb
    g = (yn - kr * r - kb * b) / kg
    return np.stack([r, g, b], -1)


def upsample_chroma_420_loc0(c: np.ndarray, h: int, w: int) -> np.ndarray:
    """Bilinear 4:2:0 -> 4:4:4 for chroma_sample_loc_type 0 (edges replicated)."""
    c = np.asarray(c, np.float64)
    # horizontal: chroma sample j sits on luma column 2j
    hc = np.empty((c.shape[0], w))
    hc[:, 0::2] = c[:, : (w + 1) // 2]
    right = np.concatenate([c[:, 1:], c[:, -1:]], 1)
    hc[:, 1::2] = 0.5 * (c[:, : w // 2] + right[:, : w // 2])
    # vertical: chroma row i sits between luma rows 2i and 2i+1 (at 2i + 0.5)
    up = np.concatenate([hc[:1], hc[:-1]], 0)
    down = np.concatenate([hc[1:], hc[-1:]], 0)
    out = np.empty((h, w))
    out[0::2] = 0.75 * hc + 0.25 * up
    out[1::2] = 0.75 * hc + 0.25 * down
    return out


def render(rgb_signal: np.ndarray, gamma: float = 2.2) -> np.ndarray:
    """HLG R'G'B' (BT.2020) -> 8-bit full-range BGR via the backward-compatible SDR rendering above."""
    lin = np.clip(rgb_signal, 0.0, 1.0) ** gamma
    lin709 = np.clip(lin @ bt2020_to_bt709().T, 0.0, 1.0)
    sig = lin709 ** (1.0 / gamma)
    q = np.floor(sig * 255.0 + 0.5).astype(np.uint8)
    return q[..., ::-1]


def frame_from_planes(flat: np.ndarray, w: int = 1920, h: int = 1080) -> dict:
    y = flat[: w * h].reshape(h, w)
    cb = flat[w * h: w * h + w * h // 4].reshape(h // 2, w // 2)
    cr = flat[w * h + w * h // 4:].reshape(h // 2, w // 2)
    return {"y": y, "cb": cb, "cr": cr}


def reference_bgr(planes: dict, gamma: float = 2.2) -> tuple[np.ndarray, dict]:
    h, w = planes["y"].shape
    rgb = ycbcr10_narrow_to_rgb(planes["y"], upsample_chroma_420_loc0(planes["cb"], h, w),
                                upsample_chroma_420_loc0(planes["cr"], h, w))
    lin = np.clip(rgb, 0, 1) ** gamma
    m = lin @ bt2020_to_bt709().T
    diag = {"signalBelow0": float((rgb < 0).mean()), "signalAbove1": float((rgb > 1).mean()),
            "gamutClipBelow0": float((m < 0).mean()), "gamutClipAbove1": float((m > 1).mean())}
    return render(rgb, gamma), diag


SUPPORTED = {"color_transfer": "arib-std-b67", "color_primaries": "bt2020", "color_space": "bt2020nc",
             "color_range": "tv", "pix_fmt": "yuv420p10le"}


class UnsupportedSource(ValueError):
    """The reference is defined only for signalled BT.2100 HLG, BT.2020 NCL, narrow range, 4:2:0 10-bit."""


def source_metadata(video: str) -> dict:
    """Stream and first-frame colour metadata as reported by ffprobe (bitstream VUI / container 'colr')."""
    q = lambda extra: json.loads(subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", *extra, "-of", "json", video],  # noqa: E731
                                                capture_output=True, text=True, check=True).stdout)
    s = q(["-show_streams"])["streams"][0]
    f = (q(["-read_intervals", "%+#10", "-show_frames"]).get("frames") or [{}])[0]   # first decoded frame
    keys = ("codec_name", "profile", "pix_fmt", "color_range", "color_space", "color_transfer", "color_primaries",
            "chroma_location", "width", "height", "r_frame_rate")
    return {"stream": {k: s.get(k) for k in keys},
            "firstFrame": {k: f.get(k) for k in ("pix_fmt", "color_range", "color_space", "color_transfer", "color_primaries")},
            "sideData": [x.get("side_data_type") for x in s.get("side_data_list", [])],
            "dolbyVisionProfile": next((x.get("dv_profile") for x in s.get("side_data_list", []) if "dv_profile" in x), None)}


def check_source(meta: dict) -> list[str]:
    """Raises UnsupportedSource unless stream AND first frame signal exactly the supported HLG format. Missing or
    'unknown'/'unspecified' values are refused, never guessed. Returns warnings (e.g. ignored Dolby Vision RPU)."""
    problems = []
    for where in ("stream", "firstFrame"):
        for k, v in SUPPORTED.items():
            got = meta.get(where, {}).get(k)
            if got != v:
                problems.append(f"{where}.{k}={got!r} (reference needs {v!r})")
    if problems:
        raise UnsupportedSource("; ".join(problems))
    warnings = []
    if meta.get("dolbyVisionProfile") is not None:
        warnings.append(f"Dolby Vision profile {meta['dolbyVisionProfile']} present: RPU ignored, HLG base layer rendered")
    if meta["stream"].get("chroma_location") not in (None, "left", "unspecified"):
        warnings.append(f"chroma_location {meta['stream']['chroma_location']}: reference assumes loc 0 (left)")
    return warnings


def native_planes(video: str, first: int, count: int, fps: float = 10.0, w: int = 1920, h: int = 1080):
    """Yields (source frame index, flat uint16 planes) - FFmpeg CLI, no pixel-format conversion."""
    p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{first / fps:.6f}", "-i", video, "-frames:v", str(count),
                          "-pix_fmt", "yuv420p10le", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    n = w * h * 3 // 2
    try:
        for k in range(first, first + count):
            b = p.stdout.read(n * 2)
            if len(b) < n * 2:
                return
            yield k, np.frombuffer(b, np.uint16)
    finally:
        p.stdout.close()
        p.wait()


class ReferenceCapture:
    """cv2.VideoCapture stand-in for EXPERIMENTS: frames rendered by the frozen reference candidate. Refuses
    sources outside the supported HLG format. Never used by inference code."""

    def __init__(self, path, *_a, **_k):
        import cv2  # noqa: PLC0415

        self._cv2 = cv2
        self.path = str(path)
        self.meta = source_metadata(self.path)
        self.warnings = check_source(self.meta)
        st = self.meta["stream"]
        self.w, self.h = int(st["width"]), int(st["height"])
        num, den = st["r_frame_rate"].split("/")
        self.fps = float(num) / float(den)
        cnt = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames",
                              "-of", "csv=p=0", self.path], capture_output=True, text=True).stdout.strip()
        self.count = float(cnt) if cnt.isdigit() else 0.0
        self.pos, self.gen, self.frame = 0, None, None

    def isOpened(self):
        return True

    def getBackendName(self):
        return "hdr_reference:" + REFERENCE["name"]

    def get(self, prop):
        c = self._cv2
        return {c.CAP_PROP_FPS: self.fps, c.CAP_PROP_FRAME_WIDTH: float(self.w), c.CAP_PROP_FRAME_HEIGHT: float(self.h),
                c.CAP_PROP_POS_FRAMES: float(self.pos), c.CAP_PROP_FRAME_COUNT: self.count,
                c.CAP_PROP_POS_MSEC: 1000.0 * self.pos / self.fps}.get(prop, 0.0)

    def set(self, prop, value):
        c = self._cv2
        if prop == c.CAP_PROP_POS_FRAMES:
            self.pos = int(round(value))
        elif prop == c.CAP_PROP_POS_MSEC:
            self.pos = int(round(value / 1000.0 * self.fps))
        else:
            return False
        self.release()
        return True

    def grab(self):
        if self.gen is None:
            self.gen = native_planes(self.path, self.pos, max(1, int(self.count) - self.pos) if self.count else 10 ** 7,
                                     self.fps, self.w, self.h)
        nxt = next(self.gen, None)
        if nxt is None:
            self.frame = None
            return False
        self.frame, _ = reference_bgr(frame_from_planes(nxt[1], self.w, self.h), REFERENCE["gamma"])
        self.frame = np.ascontiguousarray(self.frame)
        self.pos += 1
        return True

    def retrieve(self, *_a, **_k):
        return (self.frame is not None), self.frame

    def read(self, *_a, **_k):
        ok = self.grab()
        return ok, self.frame

    def release(self):
        if self.gen is not None:
            self.gen.close()
            self.gen = None


def zscale_filter(gamma_tag: str = "470m") -> str:
    """zimg implementation of the same chain (gamma 2.2 = H.273 transfer 4, 'bt470m')."""
    return ("zscale=matrixin=2020_ncl:rangein=limited:chromal=left:filter=bilinear:"
            f"transferin={gamma_tag}:primariesin=2020:"
            f"transfer={gamma_tag}:primaries=709:matrix=709:range=full:dither=none,format=gbrpf32le,"
            "format=bgr24")


def pixel_error(a: np.ndarray, b: np.ndarray) -> dict:
    d = np.abs(a.astype(np.int16) - b.astype(np.int16))
    return {"meanAbs": round(float(d.mean()), 4), "p99Abs": int(np.percentile(d, 99)), "maxAbs": int(d.max()),
            "shareExact": round(float((d == 0).mean()), 4), "shareWithin1": round(float((d <= 1).mean()), 4),
            "meanSignedBGR": [round(float((a[..., c].astype(np.int16) - b[..., c]).mean()), 3) for c in range(3)]}


def stats(a: np.ndarray) -> dict:
    return {"meanBGR": [round(float(a[..., c].mean()), 3) for c in range(3)],
            "stdBGR": [round(float(a[..., c].std()), 3) for c in range(3)],
            "share0": round(float((a == 0).mean()), 5), "share255": round(float((a == 255).mean()), 5)}


def sha(a: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(a).tobytes()).hexdigest()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video", required=True)
    ap.add_argument("--start", type=int, default=11500)
    ap.add_argument("--count", type=int, default=301)
    ap.add_argument("--gamma", type=float, default=2.2)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    hashes, diags = {}, {}
    marks = {a.start, a.start + a.count // 2, a.start + a.count - 1}
    st = {}
    for k, flat in native_planes(a.video, a.start, a.count):
        bgr, d = reference_bgr(frame_from_planes(flat), a.gamma)
        hashes[str(k)] = sha(bgr)
        if k in marks:
            diags[str(k)] = d
            st[str(k)] = {**stats(bgr), "histBGR": [np.bincount(bgr[..., c].ravel(), minlength=256).tolist() for c in range(3)]}
    out = {"cv2": None, "backend": f"hdr_reference {REFERENCE['name']} gamma={a.gamma}", "reference": {**REFERENCE, "gamma": a.gamma},
           "start": a.start, "hashes": hashes, "stats": st, "renderDiagnostics": diags}
    Path(a.out).write_text(json.dumps(out))
    print(json.dumps({"frames": len(hashes), "renderDiagnostics": diags}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
