"""HTTP entry point (Cloud Run GPU). Deploy as a *private* service: Cloud Run IAM must allow
only the Cloud Functions service account to invoke it. The worker keeps no media and no
identities between requests; nothing is logged about the footage beyond counts.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from .contract import SegmentRequest
from .pipeline import WORKER_VERSION, Components, analyse_segment

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("football-cv")

app = FastAPI(title="PitchProof football-cv reference worker", version=WORKER_VERSION, docs_url=None, redoc_url=None)

_components_override: Components | None = None


def set_components(components: Components | None) -> None:
    global _components_override
    _components_override = components


@lru_cache(maxsize=1)
def _default_components() -> Components:
    from .backends import default_components  # noqa: PLC0415

    return default_components(float(os.environ.get("CV_SAMPLE_FPS", "2")))


def components() -> Components:
    return _components_override or _default_components()


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True, "workerVersion": WORKER_VERSION}


@app.post("/v2/segments:analyze")
def analyze(request: SegmentRequest) -> JSONResponse:
    try:
        parts = components()
    except Exception as error:  # noqa: BLE001
        log.error("model backends unavailable: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail="worker_not_ready") from None
    result = analyse_segment(request, parts)
    log.info(
        "segment analysed",
        extra={"segment": request.segmentIndex, "frames": result.coverage.framesDecoded, "state": result.identity.state},
    )
    return JSONResponse(result.model_dump())
