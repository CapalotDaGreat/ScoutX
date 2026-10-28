"""Player tracking v3 HTTP endpoints (scoutx_tracker engine). Disabled unless TRACKING_V3_ENABLED=true.

POST /v3/tracking:extract  - stage 1 for one segment of the job's source into the job-scoped
                              artifact store (detections, appearance features, close-up crops).
POST /v3/tracking:resolve  - stages 2-4 from cached artifacts + the owner's feedback. Never decodes
                              the video again, so corrections are cheap.

Artifacts live under TRACKING_ARTIFACT_ROOT/<jobId>/ (in production a job-scoped bucket mount with a
lifecycle rule equal to the job's retention). The response is TARGET-ONLY: other players' tracklets,
number reads and exclusion lists are stripped before anything leaves the worker.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from pathlib import Path
from collections import OrderedDict
from typing import Any, Callable, Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

JOB = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
TARGET_ONLY_KEYS = ("schema", "engine", "target", "timeline", "coverage", "identity", "physical", "ball", "events",
                    "reviewQuestions", "invariants", "heatmap", "analysedRange", "videoSize", "offball")
MOMENT_KEYS = ("id", "kind", "kinds", "start", "end", "clipStart", "clipEnd", "identityState", "candidate", "outcome",
               "indicator")
MAX_MOMENT_THUMBS = 40


def enabled() -> bool:
    return os.environ.get("TRACKING_V3_ENABLED", "").strip() == "true"


def _require_enabled() -> None:
    # Runs before body validation, so a disabled worker reveals nothing about the contract.
    if not enabled():
        raise HTTPException(status_code=404, detail="not_available")


router = APIRouter(dependencies=[Depends(_require_enabled)])


def artifact_root() -> Path:
    root = os.environ.get("TRACKING_ARTIFACT_ROOT", "").strip()
    if not root:
        raise HTTPException(status_code=503, detail="artifact_store_not_configured")
    return Path(root)


class Privacy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    retainNonTargetIdentities: Literal[False]
    faceRecognition: Literal[False]
    persistMedia: Literal[False]


class Target(BaseModel):
    model_config = ConfigDict(extra="ignore")
    jerseyNumber: str = Field(default="", max_length=3, pattern=r"^[0-9]{0,3}$")
    kitPrimaryColor: str = Field(min_length=1, max_length=40)
    kitSecondaryColor: str = Field(default="", max_length=40)
    position: str = Field(default="unknown", max_length=30)


class Feedback(BaseModel):
    model_config = ConfigDict(extra="forbid")
    yes: list[list[float]] = Field(default_factory=list, max_length=500)
    no: list[list[float]] = Field(default_factory=list, max_length=500)
    periods: dict[str, float] = Field(default_factory=dict)
    offPitch: list[list[float]] = Field(default_factory=list, max_length=50)
    # Players the owner already saw and answered "unsure"/"skip": no evidence, just never re-asked.
    asked: list[list[float]] = Field(default_factory=list, max_length=500)


class ResolveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contractVersion: Literal[3]
    jobId: str = Field(pattern=JOB.pattern)
    privacy: Privacy
    target: Target
    feedback: Feedback = Field(default_factory=Feedback)


class Source(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=8, max_length=4096, pattern=r"^https://")


class ExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contractVersion: Literal[3]
    jobId: str = Field(pattern=JOB.pattern)
    segmentIndex: int = Field(ge=0, le=60)
    startSec: float = Field(ge=0)
    endSec: float = Field(gt=0)
    source: Source
    privacy: Privacy


class DiscoverTarget(BaseModel):
    model_config = ConfigDict(extra="ignore")
    jerseyNumber: str = Field(default="", max_length=3, pattern=r"^[0-9]{0,3}$")
    kitPrimaryColor: str = Field(min_length=1, max_length=40)


class DiscoverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    contractVersion: Literal[3]
    jobId: str = Field(pattern=JOB.pattern)
    chunkIndex: int = Field(ge=0, le=60)
    startSec: float = Field(ge=0)
    endSec: float = Field(gt=0)
    source: Source
    target: DiscoverTarget
    privacy: Privacy


# Injectable for tests (no models / video needed).
AnalyzeFn = Callable[..., dict]
ExtractFn = Callable[..., dict]
DiscoverFn = Callable[..., Any]
_analyze: AnalyzeFn | None = None
_extract: ExtractFn | None = None
_discover: DiscoverFn | None = None


def set_engine(analyze: AnalyzeFn | None = None, extract: ExtractFn | None = None, discover: DiscoverFn | None = None) -> None:
    global _analyze, _extract, _discover
    _analyze, _extract, _discover = analyze, extract, discover


# Persistent per-process state (4.1): models load once per worker, and the stage-1 artifacts of
# the most recent jobs stay in memory so an identity answer re-solves without reloading them.
_MODELS: dict[str, Any] = {}
_D_CACHE: "OrderedDict[tuple, Any]" = OrderedDict()
D_CACHE_JOBS = 2


def _job_sightings(job_id: str) -> list[dict]:
    """Discovery sightings stored for this job (target number reads only)."""
    out: list[dict] = []
    for p in sorted((artifact_root() / job_id / "discovery").glob("d_*/sightings.json")):
        try:
            out += json.loads(p.read_text())
        except (OSError, ValueError):
            continue
    return out


def _discovery_detector():
    """5.0: 416 px input (2.8x faster than 640 on CPU, 98 % of the >=160 px players found at 640);
    the same model re-detects inside the region around a candidate for neighbour frames."""
    size = int(os.environ.get("SCOUTX_DISCOVERY_DET", "416"))
    key = f"det{size}"
    if key not in _MODELS:
        from scoutx_tracker.extract import Detector  # noqa: PLC0415

        det = Detector(imgsz=size)
        _MODELS[key] = lambda frame: det(frame)[:2]
    return _MODELS[key]


def _cached_detections(runs: list[str]):
    key = tuple((r, os.path.getmtime(Path(r) / "detections.npz")) for r in runs)
    if key in _D_CACHE:
        _D_CACHE.move_to_end(key)
        return _D_CACHE[key]
    from scoutx_tracker.tracklets import load_runs  # noqa: PLC0415

    D = load_runs(runs)
    _D_CACHE[key] = D
    while len(_D_CACHE) > D_CACHE_JOBS:
        _D_CACHE.popitem(last=False)
    return D


def _points(rows: list[list[float]]) -> list[tuple[float, float, float]]:
    return [tuple(float(v) for v in r[:3]) for r in rows if len(r) >= 3 and all(np.isfinite(r[:3]))]


@router.post("/v3/tracking:extract")
def extract_segment(request: ExtractRequest) -> dict:
    if not enabled():
        raise HTTPException(status_code=404, detail="not_available")
    if request.endSec - request.startSec > 900 or request.endSec <= request.startSec:
        raise HTTPException(status_code=422, detail="segment must be 0-900 seconds long")
    out = artifact_root() / request.jobId / "stage1" / f"c_{int(request.startSec):05d}"
    if (out / "detections.npz").exists():
        return {"jobId": request.jobId, "segmentIndex": request.segmentIndex, "status": "cached"}
    fn = _extract
    if fn is None:
        from scoutx_tracker.extract import extract as fn  # noqa: PLC0415
    # extract() timestamps frames as t0 + absolute source time and stops at the absolute `end`;
    # passing t0=startSec or a duration as `end` would double-shift and truncate the segment.
    meta = fn(request.source.url, str(out), t0=0.0, start=request.startSec, end=request.endSec)
    return {"jobId": request.jobId, "segmentIndex": request.segmentIndex, "status": "complete",
            "frames": int(meta.get("frames", 0)), "processingSec": float(meta.get("seconds", 0.0)),
            "stageSeconds": meta.get("stageSeconds", {})}


def _thumb(path: str | None, max_h: int = 320) -> str | None:
    """Small JPEG (base64) of a crop for the review card; None if unavailable."""
    if not path:
        return None
    import base64  # noqa: PLC0415

    import cv2  # noqa: PLC0415

    img = cv2.imread(path)
    if img is None:
        return None
    if img.shape[0] > max_h:
        s = max_h / img.shape[0]
        img = cv2.resize(img, (max(1, int(img.shape[1] * s)), max_h), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    return base64.b64encode(buf.tobytes()).decode() if ok else None


def target_only(report: dict) -> dict:
    out = {k: report[k] for k in TARGET_ONLY_KEYS if k in report}
    ident = dict(out.get("identity", {}))
    ident.pop("iterations", None)
    out["identity"] = ident
    out["reviewQuestions"] = [{**{k: q[k] for k in ("t", "box", "affectedSec", "currentlyTarget", "score") if k in q},
                               "imageJpegBase64": _thumb(q.get("crop"))}
                              for q in report.get("reviewQuestions", [])]
    out["referenceImageJpegBase64"] = _thumb(report.get("referenceCrop"))
    # Moments: target-only clip windows; thumbnails only of the target's own close-up crops.
    moments = []
    for i, m in enumerate(report.get("moments", [])):
        item = {k: m[k] for k in MOMENT_KEYS if k in m}
        item["imageJpegBase64"] = _thumb(m.get("thumbCrop"), max_h=200) if i < MAX_MOMENT_THUMBS else None
        moments.append(item)
    out["moments"] = moments
    return out


@router.post("/v3/tracking:resolve")
def resolve(request: ResolveRequest) -> dict:
    if not enabled():
        raise HTTPException(status_code=404, detail="not_available")
    job_dir = artifact_root() / request.jobId / "stage1"
    runs = sorted(str(p) for p in job_dir.glob("c_*") if (p / "detections.npz").exists())
    if not runs:
        raise HTTPException(status_code=409, detail="no_artifacts")
    fn = _analyze
    if fn is None:
        from scoutx_tracker.analyze import analyze as fn  # noqa: PLC0415
    fb = request.feedback
    with tempfile.TemporaryDirectory(prefix="track_") as tmp:
        extra = {} if _analyze is not None else {"D": _cached_detections(runs),
                                                   "sightings": _job_sightings(request.jobId)}
        report = fn(runs, tmp, request.target.jerseyNumber or None, request.target.kitPrimaryColor,
                    request.target.kitSecondaryColor, _points(fb.yes), log=lambda _m: None,
                    rejects=_points(fb.no),
                    feedback={"periods": fb.periods, "offPitch": fb.offPitch, "asked": _points(fb.asked)},
                    position=request.target.position, **extra)
        timeline = {}
        tl_path = Path(tmp) / "timeline.npz"
        if tl_path.exists():
            z = np.load(tl_path, allow_pickle=False)
            # Down-sample to 2 per second: enough for the app's state strip.
            step = max(1, int(round(len(z["times"]) / max(1.0, float(z["times"][-1] - z["times"][0])) / 2)))
            timeline = {"times": [round(float(t), 2) for t in z["times"][::step]],
                        "states": [str(s) for s in z["states"][::step]]}
    if not report.get("invariants", {}).get("ok", False):
        raise HTTPException(status_code=500, detail="inconsistent_report")
    from .backends import model_versions  # noqa: PLC0415
    from .pipeline import WORKER_VERSION  # noqa: PLC0415

    return {"workerVersion": WORKER_VERSION, "models": model_versions(), "report": target_only(report), "timeline": timeline}


@router.post("/v3/tracking:discover")
def discover_chunk(request: DiscoverRequest) -> dict:
    """Early discovery (4.1): number sightings of the target in one chunk of the source, as
    playable moments. Target-only: other players' reads never leave the worker."""
    if not enabled():
        raise HTTPException(status_code=404, detail="not_available")
    if request.endSec <= request.startSec or request.endSec - request.startSec > 1800:
        raise HTTPException(status_code=422, detail="chunk must be 0-1800 seconds long")
    if not request.target.jerseyNumber:
        return {"jobId": request.jobId, "chunkIndex": request.chunkIndex, "status": "no_number", "moments": []}
    crops = artifact_root() / request.jobId / "discovery" / f"d_{int(request.startSec):05d}"
    fn = _discover
    if fn is None:
        from scoutx_tracker.discovery import discover as fn  # noqa: PLC0415
        from scoutx_tracker.ocr import shared_reader  # noqa: PLC0415

        detector, reader = _discovery_detector(), shared_reader()
    else:
        detector = reader = None
    res = fn(request.source.url, request.startSec, request.endSec, request.target.jerseyNumber,
             request.target.kitPrimaryColor, detector, reader, crops_dir=str(crops))
    # Job-scoped evidence for later resolves (identity uses the reads; lifecycle = job retention).
    crops.mkdir(parents=True, exist_ok=True)
    (crops / "sightings.json").write_text(json.dumps([{"t": s.t, "box": s.box, "number": s.number, "conf": s.conf,
                                                       "frames": s.frames, "weak": getattr(s, "weak_frames", 0)}
                                                      for s in getattr(res, "sightings", [])]))
    keys = ("id", "kind", "start", "end", "clipStart", "clipEnd", "identityState", "evidence", "number", "readFrames",
            "weakFrames", "candidate", "indicator")
    moments = [{**{k: m[k] for k in keys if k in m}, "imageJpegBase64": _thumb(m.get("thumbCrop"), max_h=240)}
               for m in res.moments]
    return {"jobId": request.jobId, "chunkIndex": request.chunkIndex, "status": "complete", "moments": moments,
            "frames": res.frames, "processingSec": res.timings.get("wall", 0.0), "stageSeconds": res.timings,
            "videoSize": {"width": res.width, "height": res.height}}

# ------------------------------------------------------------------------------ 5.0 clip frames

class ClipFramesRequest(BaseModel):
    """Still frames of ONE confirmed clip for an owner-requested explanation (5.0). Functions only
    sends this after every consent gate passed (videoReasoning.ts); nothing is stored here."""
    model_config = ConfigDict(extra="forbid")
    contractVersion: Literal[3]
    jobId: str = Field(pattern=JOB.pattern)
    source: Source
    times: list[float] = Field(min_length=1, max_length=6)
    indicator: list[list[float]] = Field(default_factory=list, max_length=60)
    maxWidth: int = Field(default=640, ge=160, le=960)
    privacy: Privacy


_FrameFn = Callable[[str, float], "np.ndarray | None"]
_clip_frame: _FrameFn | None = None


def set_clip_frame_reader(fn: _FrameFn | None) -> None:
    global _clip_frame
    _clip_frame = fn


def _read_frame(url: str, t: float):
    """One frame at `t`, converted explicitly to the working colour space (colour.py)."""
    import subprocess  # noqa: PLC0415

    from scoutx_tracker.colour import decode_command, probe  # noqa: PLC0415

    info = probe(url)
    cmd = decode_command(url, t, t + 0.5, None, info)
    cmd[cmd.index("-f"):cmd.index("-f")] = ["-frames:v", "1"]
    out = subprocess.run(cmd, capture_output=True, timeout=30)
    size = info.width * info.height * 3
    if out.returncode or len(out.stdout) < size:
        return None
    return np.frombuffer(out.stdout[:size], np.uint8).reshape(info.height, info.width, 3)


def outline_frame(frame, box_norm, max_width: int):
    """Yellow outline around the target (normalised x, y, w, h), then downscale."""
    import cv2  # noqa: PLC0415

    img = frame.copy()
    h, w = img.shape[:2]
    if box_norm is not None:
        x, y, bw, bh = box_norm
        p1 = (int(x * w), int(y * h))
        p2 = (int((x + bw) * w), int((y + bh) * h))
        cv2.rectangle(img, p1, p2, (0, 230, 255), max(2, w // 400))
    if w > max_width:
        s = max_width / w
        img = cv2.resize(img, (max_width, max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    return img


def nearest_box(indicator: list[list[float]], t: float, max_gap: float = 1.0):
    best = None
    for p in indicator:
        if len(p) == 5 and abs(p[0] - t) <= max_gap and (best is None or abs(p[0] - t) < abs(best[0] - t)):
            best = p
    return best[1:] if best else None


@router.post("/v3/tracking:clipFrames")
def clip_frames(request: ClipFramesRequest) -> dict:
    if not enabled():
        raise HTTPException(status_code=404, detail="not_available")
    import base64  # noqa: PLC0415

    import cv2  # noqa: PLC0415

    reader = _clip_frame or _read_frame
    frames = []
    for i, t in enumerate(sorted(request.times)):
        f = reader(request.source.url, float(t))
        if f is None:
            continue
        img = outline_frame(f, nearest_box(request.indicator, t), request.maxWidth)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            frames.append({"id": f"f{i}", "t": round(float(t), 2), "jpegBase64": base64.b64encode(buf.tobytes()).decode()})
    return {"jobId": request.jobId, "frames": frames}
