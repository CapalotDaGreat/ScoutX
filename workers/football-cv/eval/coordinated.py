"""Local gated integration; transient competitor evidence never reaches result files."""
from __future__ import annotations

from bisect import bisect_left
import hashlib
import json
from pathlib import Path

from app.contract import MatchIdentityEnvelope, SegmentRequest
from app.identity import Track
from app.match_identity import MatchIdentityRequest, MatchSegment, MatchTarget, resolve_match
from app.pipeline import WORKER_VERSION
from app.source_pts import AnchorManifest, SourcePtsProof, enabled, resolve_local_anchors, source_sha256
from eval.full_match_preflight import model_digest


class LocalIdentityRun:
    def __init__(self, path: Path, manifest: AnchorManifest, models: dict[str, str],
                 duration: float, target: dict):
        if not enabled():
            raise ValueError("experimental identity gates are disabled")
        digest = model_digest(models)
        if digest != manifest.scope.modelSetDigest:
            raise ValueError("model scope mismatch")
        self.target = MatchTarget.model_validate(target)
        if not 0 < duration <= 9000 or any(a.timestampSec >= duration for a in manifest.anchors):
            raise ValueError("anchor outside recording duration")
        self.references, self.proof = resolve_local_anchors(path, manifest, sample_fps=2)
        if any(f.timestampSec >= duration for f in self.proof.frames):
            raise ValueError("decoded proof exceeds metadata duration")
        self.path = path
        self.scope = manifest.scope
        self.duration = duration
        self.models = models
        self.segments: list[MatchSegment] = []
        self.frames = sorted(self.proof.frames, key=lambda f: f.timestampSec)
        self.times = [f.timestampSec for f in self.frames]

    def verify_frame(self, timestamp, rgb) -> float:
        if not enabled():
            raise ValueError("identity gates changed")
        index = bisect_left(self.times, timestamp)
        hits = [self.frames[i] for i in range(max(0, index - 1), min(len(self.frames), index + 2))
                if abs(self.times[i] - timestamp) <= 1e-9]
        if (len(hits) != 1 or hashlib.sha256(rgb.tobytes(order="C")).hexdigest() != hits[0].evidenceHash
                or (rgb.shape[1], rgb.shape[0]) != (hits[0].width, hits[0].height)):
            raise ValueError("decoded sample does not match exact source proof")
        # The matched proof supplies the actual decoded PTS; never infer a PTS
        # or a frame index by multiplying approximate seconds by nominal FPS.
        return hits[0].timestampSec

    def observe(self, request: SegmentRequest, tracks: list[Track]) -> None:
        if not enabled():
            raise ValueError("identity gates changed")
        self.segments.append(MatchSegment.model_validate({
            "segmentId": f"segment_{request.segmentIndex}", "startSec": request.startSec, "endSec": request.endSec,
            "tracklets": [{"trackletId": f"track_{i}", "samples": [
                {"timestampSec": o.time_sec, "jerseyRead": o.jersey_read,
                 "jerseyConfidence": o.jersey_confidence, "teamMatch": o.team_match, "box": o.box}
                for o in track.observations]} for i, track in enumerate(tracks) if track.observations],
        }))

    def finish(self, *, source_path: str | None = None, anchor_revision: int | None = None) -> tuple[dict, dict | None]:
        if not enabled():
            raise ValueError("identity gates changed")
        try:
            if source_sha256(self.path) != self.scope.sourceSha256:
                raise ValueError("source changed during evaluation")
            evidence = MatchIdentityRequest(scope=self.scope, target=self.target, durationSec=self.duration,
                                            references=self.references, segments=self.segments)
            used = {a.timestampSec for a in self.references} | {
                o.timestampSec for s in self.segments for t in s.tracklets for o in t.samples}
            proof = SourcePtsProof(schemaVersion=1, scope=self.scope,
                                   frames=[f for f in self.proof.frames if f.timestampSec in used])
            envelope = MatchIdentityEnvelope(evidence=evidence, sourceProof=proof)
            result = resolve_match(envelope.evidence)
            public = {"workerVersion": WORKER_VERSION, "models": self.models,
                      "sourceProofSha256": proof.digest(),
                      "identity": result.model_dump(include={"scope", "targetId", "target", "references", "windows",
                          "associationMethod", "calibrated", "continuousIdentityValidated"})}
            artifact = None
            if source_path is not None and anchor_revision is not None:
                # Rejected/ambiguous competitors are excluded BEFORE serialization.
                confirmed = {(s.segmentId, s.trackletId, s.sample.timestampSec) for s in result.sightings}
                target_segments = [s.model_copy(update={"tracklets": [
                    t.model_copy(update={"samples": samples}) for t in s.tracklets
                    if (samples := [o for o in t.samples if (s.segmentId, t.trackletId, o.timestampSec) in confirmed])
                ]}) for s in self.segments]
                target_evidence = evidence.model_copy(update={"segments": target_segments})
                target_times = {a.timestampSec for a in self.references} | {
                    o.timestampSec for s in target_segments for t in s.tracklets for o in t.samples}
                target_proof = SourcePtsProof(schemaVersion=1, scope=self.scope,
                    frames=[f for f in proof.frames if f.timestampSec in target_times])
                safe = MatchIdentityEnvelope(evidence=target_evidence, sourceProof=target_proof)
                artifact = {"schemaVersion": 1, "sourcePath": source_path, "generation": self.scope.generation,
                            "anchorRevision": anchor_revision, **safe.model_dump()}
                if len(json.dumps(artifact, allow_nan=False).encode()) > 16 * 1024 * 1024:
                    raise ValueError("target artifact exceeds private record budget")
            return public, artifact
        finally:
            self.segments.clear()
