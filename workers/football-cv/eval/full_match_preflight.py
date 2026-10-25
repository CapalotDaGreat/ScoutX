"""Read-only metadata binding before anchor decode or model initialization."""
from __future__ import annotations

import hashlib
import json
import math

from app.match_identity import MatchTarget
from app.source_pts import enabled, load_anchor_manifest, source_sha256


def model_digest(models: dict[str, str]) -> str:
    return hashlib.sha256(json.dumps(models, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode()).hexdigest()


def preflight(args, duration, target, *, model_inventory=None):
    if not math.isfinite(duration) or not 0 < duration <= 9000:
        raise ValueError("invalid recording duration")
    MatchTarget.model_validate(target)
    digest = source_sha256(args.input)
    manifest = None
    models = None
    if args.anchor_manifest is not None:
        if not enabled():
            raise ValueError("experimental identity gates are disabled")
        manifest = load_anchor_manifest(args.anchor_manifest)
        if manifest.scope.sourceSha256 != digest:
            raise ValueError("anchor source hash mismatch")
        if args.source_path is not None and args.source_path.split('/')[-2] != manifest.scope.jobId:
            raise ValueError("source path job mismatch")
        if any(a.timestampSec >= duration for a in manifest.anchors):
            raise ValueError("anchor outside recording duration")
        if model_inventory is None:
            from app.backends import model_versions
            model_inventory = model_versions
        models = model_inventory()
        if not models or any("missing" in value for value in models.values()):
            raise ValueError("installed model packages required")
        if model_digest(models) != manifest.scope.modelSetDigest:
            raise ValueError("model scope mismatch")
    review_path = getattr(args, "preflight_review", None)
    if review_path is not None:
        # Lazy import avoids the validation module's match CLI import cycle.
        from eval.full_match_validation import Review, read_json
        review = Review.model_validate(read_json(review_path))
        if (manifest is None or review.sourceSha256 != digest or review.durationSec != duration
                or review.target != target or review.anchors != manifest):
            raise ValueError("review source/duration/target/anchor scope mismatch")
        if not review.anchorsReviewed or not review.blindedBeforePredictions:
            raise ValueError("independently reviewed anchors and blind review required")
    return digest, manifest, models
