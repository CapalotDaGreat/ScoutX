"""Decode-path probe (5.3): hashes of frames START..START+COUNT-1 decoded exactly like stage 1 / the fp32
harness (cv2.VideoCapture, seek CAP_PROP_POS_FRAMES, sequential read), the VideoCapture backend actually used,
and per-channel statistics of three frames. Writes JSON only (no images). Compare two machines with --compare.

    python bench/decode_probe.py --video IMG_4809_proxy_10fps.mp4 --out decode_windows.json
    python bench/decode_probe.py --compare decode_linux.json decode_windows.json
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys


def probe(video: str, start: int, count: int) -> dict:
    import cv2  # noqa: PLC0415
    import numpy as np  # noqa: PLC0415

    cap = cv2.VideoCapture(video)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start)
    out = {"cv2": cv2.__version__, "backend": cap.getBackendName(), "platform": platform.platform(),
           "python": sys.version.split()[0], "start": start, "hashes": {}, "stats": {}}
    marks = {start, start + count // 2, start + count - 1}
    for _ in range(count):
        ok, f = cap.read()
        if not ok:
            break
        k = str(round(cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1)
        out["hashes"][k] = hashlib.sha256(f.tobytes()).hexdigest()
        if int(k) in marks:
            hist = [np.bincount(f[..., c].ravel(), minlength=256).tolist() for c in range(3)]
            out["stats"][k] = {"meanBGR": [round(float(f[..., c].mean()), 4) for c in range(3)],
                               "stdBGR": [round(float(f[..., c].std()), 4) for c in range(3)], "histBGR": hist}
    cap.release()
    return out


def compare(a: dict, b: dict) -> dict:
    import numpy as np  # noqa: PLC0415

    common = sorted(set(a["hashes"]) & set(b["hashes"]), key=int)
    res = {"backends": [a["backend"], b["backend"]], "cv2": [a["cv2"], b["cv2"]], "framesCompared": len(common),
           "identicalFrames": sum(a["hashes"][k] == b["hashes"][k] for k in common), "frames": {}}
    for k in sorted(set(a["stats"]) & set(b["stats"]), key=int):
        ha, hb = (np.array(x["histBGR"], float) for x in (a["stats"][k], b["stats"][k]))
        res["frames"][k] = {"meanDiffBGR": [round(y - x, 4) for x, y in zip(a["stats"][k]["meanBGR"], b["stats"][k]["meanBGR"])],
                            "histL1ShareBGR": [round(float(np.abs(ha[c] - hb[c]).sum() / (2 * ha[c].sum())), 4) for c in range(3)]}
    return res


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--video")
    ap.add_argument("--out")
    ap.add_argument("--start", type=int, default=11500)
    ap.add_argument("--count", type=int, default=301)
    ap.add_argument("--compare", nargs=2)
    a = ap.parse_args(argv)
    if a.compare:
        r = compare(*(json.load(open(p)) for p in a.compare))
    else:
        r = probe(a.video, a.start, a.count)
        json.dump(r, open(a.out, "w"))
    print(json.dumps({k: v for k, v in r.items() if k not in ("hashes", "stats")}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
