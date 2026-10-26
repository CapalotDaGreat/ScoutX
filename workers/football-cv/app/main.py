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
from fastapi.exceptions import RequestValidationError

from .contract import MatchIdentityEnvelope, SegmentRequest
from .pipeline import WORKER_VERSION, Components, analyse_segment

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("football-cv")

app = FastAPI(title="PitchProof football-cv reference worker", version=WORKER_VERSION, docs_url=None, redoc_url=None,
              openapi_url=None)

from .tracking_v3 import router as tracking_v3_router  # noqa: E402

app.include_router(tracking_v3_router)


@app.exception_handler(RequestValidationError)
async def invalid_request(_request, _error):
    # FastAPI's default validation response includes rejected input values.
    return JSONResponse(status_code=422, content={"detail": "invalid_request"})

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


@app.post("/v2/matches:resolve-identity")
def resolve_identity(request: MatchIdentityEnvelope) -> JSONResponse:
    from .match_identity import resolve_match
    from .source_pts import enabled

    if not enabled():
        raise HTTPException(status_code=404, detail="not_available")
    # Revalidate constructed/mutated objects, too. Never log validation input.
    try:
        request = MatchIdentityEnvelope.model_validate(request.model_dump())
        if _components_override is not None:
            models = _components_override.models or {}
        else:
            from .backends import model_versions
            models = model_versions()
        import hashlib
        import json
        digest = hashlib.sha256(json.dumps(models, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        if digest != request.evidence.scope.modelSetDigest:
            raise ValueError("stale model set")
        result = resolve_match(request.evidence)
        identity = result.model_dump(include={"scope", "targetId", "target", "references", "windows",
                                             "associationMethod", "calibrated", "continuousIdentityValidated"})
        return JSONResponse({"workerVersion": WORKER_VERSION, "models": models,
                             "identity": identity, "sourceProofSha256": request.sourceProof.digest()})
    except Exception:
        raise HTTPException(status_code=422, detail="invalid_identity_evidence") from None
