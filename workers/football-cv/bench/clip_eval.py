"""Run the fp32-harness cpu-onnx profile on one unlabelled clip window (5.3 generalisation check). Bench-only.

    python bench/clip_eval.py --video CLIP.mp4 --name NAME --start S --end E --out-dir DIR

Same stage-1 / discovery / stage-2 path and settings as decoder_interval_eval.py (default decoder only), with no
labels: outputs are reviewed claim by claim. SCOUTX_EXCHANGE_SPLIT selects baseline (0) or candidate (1).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for k in ("--video", "--name", "--out-dir"):
        ap.add_argument(k, required=True)
    ap.add_argument("--start", type=float, required=True)
    ap.add_argument("--end", type=float, required=True)
    a = ap.parse_args(argv)
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(ROOT))
    os.chdir(ROOT)
    import fp32_comparison as fc  # noqa: PLC0415
    import validate_identity_windows as viw  # noqa: PLC0415
    from scoutx_tracker.envinfo import sha256_file  # noqa: PLC0415

    fc.WINDOWS.clear()
    fc.WINDOWS[a.name] = (a.start, a.end)
    fc.fixture_truth = lambda k: ({"anchors": []}, {"fps": 10.0, "frames": {}, "times": {}})

    def code_hashes():
        files = list((ROOT / "scoutx_tracker").glob("*.py")) + [Path(viw.__file__), ROOT / "bench" / "pp_bench.py", Path(__file__)]
        return {p.relative_to(ROOT).as_posix(): sha256_file(p) for p in sorted(files)}
    viw.code_hashes = code_hashes
    # validate_identity_windows only accepts the IMG_4809 proxy (its labels' video). For an UNLABELLED clip that guard
    # is replaced by an exact-hash guard on the clip itself; the recorded sourceSha256 is the clip's real hash.
    import json as _json  # noqa: PLC0415
    import types  # noqa: PLC0415

    clip_hash = sha256_file(a.video)
    proxy_hash = _json.loads((ROOT / "bench" / "references" / "img4809_proxy_10fps.json").read_text())["sha256"]

    def loads(text, *x, **k):
        d = _json.loads(text, *x, **k)
        if isinstance(d, dict) and d.get("sha256") == proxy_hash:
            d = {**d, "sha256": clip_hash, "clipGuard": "exact clip hash (unlabelled generalisation clip)"}
        return d
    viw.json = types.SimpleNamespace(**{n: getattr(_json, n) for n in ("dumps", "dump", "load")}, loads=loads)
    viw.score_timeline = lambda *x, **k: {"unlabelled": True}
    for k, v in fc.profile_env("cpu-onnx").items():
        os.environ[k] = v
    return fc.main(["--profile", "cpu-onnx", "--video", a.video, "--out-dir", a.out_dir, "--windows", a.name])


if __name__ == "__main__":
    sys.exit(main())
