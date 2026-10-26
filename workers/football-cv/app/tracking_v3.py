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

import os
import re
import tempfile
from pathlib import Path
from typing import Callable, Literal

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

JOB = re.compile(r"^[A-Za-z0-9_-]{1,80}$")
TARGET_ONLY_KEYS = ("schema", "engine", "target", "timeline", "coverage", "identity", "physical", "ball", "events",
                    "reviewQuestions", "invariants", "heatmap")


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


# Injectable for tests (no models / video needed).
AnalyzeFn = Callable[..., dict]
ExtractFn = Callable[..., dict]
_analyze: AnalyzeFn | None = None
_extract: ExtractFn | None = None


def set_engine(analyze: AnalyzeFn | None = None, extract: ExtractFn | None = None) -> None:
    global _analyze, _extract
    _analyze, _extract = analyze, extract


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
    meta = fn(request.source.url, str(out), t0=request.startSec, start=request.startSec,
              end=request.endSec - request.startSec)
    return {"jobId": request.jobId, "segmentIndex": request.segmentIndex, "status": "complete",
            "frames": int(meta.get("frames", 0)), "stageSeconds": meta.get("stageSeconds", {})}


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
        report = fn(runs, tmp, request.target.jerseyNumber or None, request.target.kitPrimaryColor,
                    request.target.kitSecondaryColor, _points(fb.yes), log=lambda _m: None,
                    rejects=_points(fb.no),
                    feedback={"periods": fb.periods, "offPitch": fb.offPitch, "asked": _points(fb.asked)},
                    position=request.target.position)
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
