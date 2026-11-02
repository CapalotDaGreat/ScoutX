"""Run the fp32-harness cpu-onnx profile on labelled IMG_4809 intervals with an explicitly named decoder
(5.3 HDR reference validation). Local, bench-only; the inference code and its default decoder are unchanged.

    python bench/decoder_interval_eval.py --decoder {default,reference} --video V --out-dir DIR [--intervals 225 400 ...]

`default`   - cv2.VideoCapture as shipped (the production decode path).
`reference` - hdr_reference.ReferenceCapture (frozen experimental candidate) replaces cv2.VideoCapture in this
              process only. The harness still records every decoded frame's hash (precision_diagnostics.json).
Labels: bench/results/5.1/gt_img4809_intervals.json on its STORED time base, window-local frame keys; the time
basis is checked and scored separately (bench/frame_sets.py), never silently corrected here.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
GT = HERE / "results" / "5.1" / "gt_img4809_intervals.json"


def interval_truth(start: float, end: float) -> dict:
    g = json.loads(GT.read_text())
    truth = {"fps": g["fps"], "frames": {}, "times": {}}
    for k, labels in g["frames"].items():
        if start * 10 <= int(k) < end * 10:
            local = str(int(k) - int(round(start * 10)))
            truth["frames"][local] = [{"box": lab["box"], "label": lab["label"]} for lab in labels]
            truth["times"][local] = float(g["times"][k])
    return truth


def key(start: float) -> str:
    return f"i{int(start):04d}"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--decoder", choices=("default", "reference"), required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--intervals", nargs="+", type=int)
    a = ap.parse_args(argv)
    sys.path.insert(0, str(HERE))
    sys.path.insert(0, str(ROOT))
    os.chdir(ROOT)
    import fp32_comparison as fc  # noqa: PLC0415

    g = json.loads(GT.read_text())
    chosen = [(s, e) for s, e in g["intervals"] if a.intervals is None or s in a.intervals]
    fc.WINDOWS.clear()
    fc.WINDOWS.update({key(s): (float(s), float(e)) for s, e in chosen})

    def fixture_truth(k):
        s, e = fc.WINDOWS[k]
        return {"anchors": []}, interval_truth(s, e)
    fc.fixture_truth = fixture_truth
    import validate_identity_windows as viw  # noqa: PLC0415
    from scoutx_tracker.envinfo import sha256_file  # noqa: PLC0415

    def code_hashes():   # provenance: engine + evaluator + the label file these intervals come from
        files = list((ROOT / "scoutx_tracker").glob("*.py")) + [Path(viw.__file__), ROOT / "bench" / "pp_bench.py", GT,
                                                               Path(__file__), HERE / "hdr_reference.py"]
        return {p.relative_to(ROOT).as_posix(): sha256_file(p) for p in sorted(files)}
    viw.code_hashes = code_hashes
    if a.decoder == "reference":
        import cv2  # noqa: PLC0415

        import hdr_reference  # noqa: PLC0415
        cv2.VideoCapture = hdr_reference.ReferenceCapture
    for k, v in fc.profile_env("cpu-onnx").items():
        os.environ[k] = v
    return fc.main(["--profile", "cpu-onnx", "--video", a.video, "--out-dir", a.out_dir, "--windows", *fc.WINDOWS])


if __name__ == "__main__":
    sys.exit(main())
