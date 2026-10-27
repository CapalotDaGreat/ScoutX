"""End-to-end pipeline benchmark (4.1): what a player waits for, on the hardware it runs on.

    python bench/pipeline_benchmark.py --video match.mp4 --number 20 --kit orange --out bench.json \
        [--segment 300] [--discovery-end 0] [--price-per-hour 1.05]

Measures (wall clock, this machine only - nothing is extrapolated except the labelled
`projection` block):
  1. discovery pass over [0, discovery-end] (0 = whole video): time to the first playable
     number sighting and total time;
  2. stage-1 extraction of one segment [0, segment] with the production detector/backend
     (batched on CUDA), seconds per video-second;
  3. a resolve over that segment: cold (models + OCR load) and warm (persistent worker);
  4. hardware (CPU model/cores, GPU name/memory) and, with --price-per-hour, cost per measured run.
Run it on the GPU host before quoting GPU numbers. Never quote the projection as a measurement.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def hardware() -> dict:
    info = {"platform": platform.platform(), "cpu": platform.processor() or platform.machine(), "cores": os.cpu_count()}
    try:
        out = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
                             capture_output=True, text=True, timeout=10)
        info["gpu"] = out.stdout.strip() or None
    except (OSError, subprocess.TimeoutExpired):
        info["gpu"] = None
    try:
        import torch  # noqa: PLC0415

        info["cuda"] = torch.cuda.is_available()
    except ImportError:
        info["cuda"] = False
    return info


def duration(video: str) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                         capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--number", required=True)
    ap.add_argument("--kit", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--segment", type=float, default=300.0)
    ap.add_argument("--discovery-end", type=float, default=0.0)
    ap.add_argument("--price-per-hour", type=float, default=None)
    a = ap.parse_args()
    total = duration(a.video)
    from scoutx_tracker.colour import probe, zscale_available  # noqa: PLC0415

    info = probe(a.video)
    res: dict = {"hardware": hardware(), "videoSec": round(total, 1), "measured": {},
                 "video": {"dynamicRange": info.dynamic_range, "bitDepth": info.bit_depth, "pixFmt": info.pix_fmt,
                           "size": [info.width, info.height], "fps": round(info.fps, 2)},
                 "decoder": os.environ.get("SCOUTX_DECODER", "auto"), "zscale": zscale_available()}
    work = Path(tempfile.mkdtemp(prefix="ppbench_"))

    # 1. discovery
    from scoutx_tracker.discovery import discover  # noqa: PLC0415
    from scoutx_tracker.extract import Detector, extract  # noqa: PLC0415
    from scoutx_tracker.ocr import shared_reader  # noqa: PLC0415

    t = time.time()
    det640 = Detector(imgsz=int(os.environ.get("SCOUTX_DISCOVERY_DET", "416")))
    reader = shared_reader()
    res["measured"]["modelInitSec"] = round(time.time() - t, 1)
    d_end = a.discovery_end or total
    first: list[float] = []
    t = time.time()
    dr = discover(a.video, 0.0, d_end, a.number, a.kit, lambda f: det640(f)[:2], reader,
                  crops_dir=str(work / "disc"), on_sighting=lambda s, w: first.append(w))
    res["measured"]["discovery"] = {"videoSec": round(d_end, 1), "wallSec": round(time.time() - t, 1),
                                    "firstPlayableMomentSec": round(first[0], 1) if first else None,
                                    "sightings": len(dr.sightings), "stageSeconds": dr.timings}

    # 2. extraction of one segment
    seg_end = min(a.segment, total)
    t = time.time()
    meta = extract(a.video, str(work / "stage1" / "c_00000"), start=0.0, end=seg_end)
    wall = time.time() - t
    res["measured"]["extractSegment"] = {"videoSec": round(seg_end, 1), "wallSec": round(wall, 1),
                                         "secPerVideoSec": round(wall / seg_end, 3), "detector": meta["detector"],
                                         "stageSeconds": meta["stageSeconds"]}

    # 3. resolve cold + warm (persistent process: models and detections stay loaded)
    from scoutx_tracker.analyze import analyze  # noqa: PLC0415
    from scoutx_tracker.tracklets import load_runs  # noqa: PLC0415

    runs = [str(work / "stage1" / "c_00000")]
    t = time.time()
    analyze(runs, str(work / "r1"), a.number, a.kit, log=lambda _m: None)
    res["measured"]["resolveColdSec"] = round(time.time() - t, 1)
    D = load_runs(runs)
    t = time.time()
    analyze(runs, str(work / "r2"), a.number, a.kit, log=lambda _m: None, D=D)
    res["measured"]["resolveWarmSec"] = round(time.time() - t, 1)

    per_video = wall / seg_end
    res["projection"] = {
        "note": "PROJECTION, not a measurement: measured extraction rate x video length, one worker.",
        "extractWholeVideoSec": round(per_video * total, 0),
    }
    if a.price_per_hour:
        hours = (res["measured"]["discovery"]["wallSec"] + per_video * total) / 3600
        res["projection"]["costPerVideoAtPrice"] = round(hours * a.price_per_hour, 3)
        res["projection"]["pricePerHour"] = a.price_per_hour
    Path(a.out).write_text(json.dumps(res, indent=2))
    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
