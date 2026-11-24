"""Opt-in private evaluation exports. No model imports, media copies, API fields or default writes."""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
from pathlib import Path
from uuid import uuid4

SCHEMA = "pitchproof.b26.resolve-export.v1"
CLAIMS_SCHEMA = "pitchproof.b26.full-claims.v1"
STATES = {"CONFIRMED_VISIBLE", "LIKELY_VISIBLE", "AMBIGUOUS", "UNKNOWN", "OFF_CAMERA",
          "NON_MATCH_PERIOD", "CONFIRMED_OFF_PITCH"}
CLAIM = {"CONFIRMED_VISIBLE", "LIKELY_VISIBLE"}


def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


def file_digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def sha(value) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def number(value) -> bool:
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def validate_metadata(m: dict) -> None:
    """Frozen server-attested configuration; all fields, including extensions, are compared offline."""
    if not isinstance(m, dict):
        raise ValueError("metadata must be an object")
    canonical(m)
    for key in ("input", "target", "engine", "settings", "groundTruth", "artifacts", "resources"):
        if not isinstance(m.get(key), dict) or not m[key]:
            raise ValueError(f"missing metadata.{key}")
    inp = m["input"]
    for key in ("videoStreamSha256", "sampleTimesSha256"):
        if not sha(inp.get(key)):
            raise ValueError(f"invalid input.{key}")
    for key in ("durationSec", "width", "height", "fps"):
        if not number(inp.get(key)) or inp[key] <= 0:
            raise ValueError(f"invalid input.{key}")
    for key in ("width", "height"):
        if int(inp[key]) != inp[key]:
            raise ValueError("image dimensions must be integers")
    if type(inp.get("sampledFrames")) is not int or inp["sampledFrames"] <= 0:
        raise ValueError("missing frozen sampled frame count")
    for key in ("pixFmt", "colorTransfer"):
        if not isinstance(inp.get(key), str) or not inp[key]:
            raise ValueError(f"missing input.{key}")
    engine = m["engine"]
    if not sha(engine.get("sourceSha256")) or not sha(engine.get("lockSha256")):
        raise ValueError("missing engine source/lock hashes")
    if not isinstance(engine.get("imageDigest"), str) or not engine["imageDigest"].startswith("sha256:") or not sha(engine["imageDigest"][7:]):
        raise ValueError("invalid engine image digest")
    if not engine.get("version") or not isinstance(engine.get("models"), dict) or not engine["models"] or not all(sha(h) for h in engine["models"].values()):
        raise ValueError("missing engine version/models")
    for key in ("stage1", "resolve", "decoder"):
        if not isinstance(m["settings"].get(key), dict) or not m["settings"][key]:
            raise ValueError(f"missing settings.{key}")
    if not sha(m["groundTruth"].get("sha256")) or not (m["groundTruth"].get("timeBasis") == "unshifted" or sha(m["groundTruth"].get("timeBasis"))):
        raise ValueError("invalid ground truth/time basis")
    for key in ("width", "height"):
        value = m["groundTruth"].get(key)
        if type(value) is not int or value <= 0:
            raise ValueError("invalid ground truth image dimensions")
    for key in ("discoverySha256", "feedbackSha256", "auxiliaryCacheSha256"):
        if not sha(m["artifacts"].get(key)):
            raise ValueError(f"missing artifacts.{key}")
    res = m["resources"]
    if not number(res.get("cpu")) or res["cpu"] <= 0 or not number(res.get("memoryGiB")) or res["memoryGiB"] <= 0:
        raise ValueError("invalid resource allocation")
    if not isinstance(res.get("effectiveProviders"), list) or not res["effectiveProviders"] or not all(isinstance(v, str) and v for v in res["effectiveProviders"]) or not isinstance(res.get("threads"), dict) or not res["threads"]:
        raise ValueError("missing effective providers/threads")


def validate_plan(plan: list, duration: float) -> None:
    if not isinstance(plan, list) or not 1 <= len(plan) <= 61:
        raise ValueError("invalid segment count")
    end = 0.0
    for i, s in enumerate(plan):
        if not isinstance(s, dict) or set(s) != {"index", "startSec", "endSec"} or type(s["index"]) is not int or s["index"] != i:
            raise ValueError("invalid segment index/fields")
        if not number(s["startSec"]) or not number(s["endSec"]) or s["startSec"] != end or not 0 < s["endSec"] - end <= 900:
            raise ValueError("segment plan must be contiguous, non-overlapping and within worker limits")
        end = s["endSec"]
    if end != duration:
        raise ValueError("segment plan does not cover the complete recording")


def validate_frames(frames: list, metadata: dict) -> list:
    """Keep every sampled frame, including abstentions and absent frames; never round/interpolate."""
    if not isinstance(frames, list) or not frames:
        raise ValueError("empty full timeline")
    if len(frames) != metadata["input"]["sampledFrames"]:
        raise ValueError("timeline frame count differs from frozen sampling grid")
    previous = -1.0
    for row in frames:
        if not isinstance(row, list) or len(row) != 4:
            raise ValueError("frame must contain time, state, box and present")
        t, state, box, present = row
        if not number(t) or not previous < t < metadata["input"]["durationSec"] or not isinstance(state, str) or state not in STATES or type(present) is not bool:
            raise ValueError("invalid/duplicate/non-monotonic timeline frame")
        previous = t
        if t < 0 or (state in CLAIM and not present):
            raise ValueError("invalid claimed/absent frame")
        if present:
            if not isinstance(box, list) or len(box) != 4 or not all(number(v) for v in box) or box[2] <= box[0] or box[3] <= box[1]:
                raise ValueError("invalid target box")
        elif box is not None:
            raise ValueError("absent frames must not export stale boxes")
    if digest([r[0] for r in frames]) != metadata["input"]["sampleTimesSha256"]:
        raise ValueError("full timeline does not match frozen sampling grid")
    return frames


def local_file(root: Path, name: str) -> Path:
    if not isinstance(name, str) or Path(name).name != name or name in {"", ".", ".."} or "\\" in name:
        raise ValueError("artifact must be a local filename")
    p = root / name
    if p.is_symlink() or p.resolve().parent != root.resolve():
        raise ValueError("artifact escapes its bundle")
    return p


def stage1_plan(runs: list[str], context: dict) -> tuple[list, list]:
    """Derive bounds/grid from actual hashed checkpoints, not the declared layout alone."""
    import numpy as np
    chunks = []
    for run in runs:
        root = Path(run)
        cp = json.loads((root / "checkpoint.json").read_text(encoding="utf-8"))
        if cp.get("videoSha256") != context["checkpointSourceSha256"] or cp.get("settingsFingerprint") != digest(context["metadata"]["settings"]["stage1"]):
            raise ValueError("checkpoint input/settings mismatch")
        if cp.get("settings") != context["metadata"]["settings"]["stage1"]:
            raise ValueError("checkpoint settings content mismatch")
        for name in ("detections.npz", "meta.json"):
            p = local_file(root, name)
            expected = cp.get("files", {}).get(name, {})
            if expected.get("sha256") != file_digest(p) or expected.get("size") != p.stat().st_size:
                raise ValueError("corrupt checkpoint payload")
        with np.load(root / "detections.npz", allow_pickle=False) as z:
            times = z["times"].tolist()
        if not times or any(not number(t) or not cp["startSec"] <= t < cp["endSec"] for t in times):
            raise ValueError("checkpoint samples outside segment bounds")
        chunks.append((cp["startSec"], cp["endSec"], times))
    chunks.sort(key=lambda c: c[0])
    plan = [{"index": i, "startSec": s, "endSec": e} for i, (s, e, _) in enumerate(chunks)]
    validate_plan(plan, context["metadata"]["input"]["durationSec"])
    if plan != context["segmentPlan"]:
        raise ValueError("observed and declared segment plans differ")
    return plan, [t for _, _, ts in chunks for t in ts]


def configured_context(job_id: str, target: dict, feedback: dict) -> tuple[Path, dict] | None:
    if os.environ.get("SCOUTX_B26_EXPORT_ENABLED", "").strip() != "true":
        return None
    output = Path(os.environ.get("SCOUTX_B26_EXPORT_ROOT", ""))
    contexts = Path(os.environ.get("SCOUTX_B26_CONTEXT_ROOT", ""))
    if not output.is_absolute() or not contexts.is_absolute():
        raise ValueError("absolute private export/context roots required")
    context = json.loads(local_file(contexts, job_id + ".json").read_text(encoding="utf-8"))
    validate_metadata(context["metadata"])
    validate_plan(context["segmentPlan"], context["metadata"]["input"]["durationSec"])
    if context.get("schedule") not in {"sequential", "orchestrated"} or not sha(context.get("checkpointSourceSha256")):
        raise ValueError("invalid schedule/checkpoint source")
    if context["metadata"]["target"] != target or context["metadata"]["artifacts"]["feedbackSha256"] != digest(feedback):
        raise ValueError("request does not match frozen evaluation context")
    return output / job_id, context


def verify_pre_resolve(context: dict, stage1: Path, sightings: list) -> None:
    """Verify the effective sightings and known on-disk JSON caches before analysis can update them."""
    caches = {p.relative_to(stage1).as_posix(): file_digest(p) for p in sorted(stage1.rglob("*.json"))
              if "cache" in p.name.lower()}
    if digest(sightings) != context["metadata"]["artifacts"]["discoverySha256"]:
        raise ValueError("discovery input mismatch")
    if digest(caches) != context["metadata"]["artifacts"]["auxiliaryCacheSha256"]:
        raise ValueError("auxiliary JSON cache input mismatch")


def export_resolve(timeline: Path, report: dict, runs: list[str], output: Path, context: dict) -> Path:
    import numpy as np
    validate_metadata(context["metadata"])
    if context.get("schedule") not in {"sequential", "orchestrated"} or not sha(context.get("checkpointSourceSha256")):
        raise ValueError("invalid schedule/checkpoint source")
    if not report.get("invariants", {}).get("ok"):
        raise ValueError("invalid report invariants")
    plan, sampled = stage1_plan(runs, context)
    with np.load(timeline, allow_pickle=False) as z:
        times, states, boxes, present = (z[k] for k in ("times", "states", "boxes", "present"))
        if times.ndim != 1 or states.shape != times.shape or present.shape != times.shape or boxes.shape != (len(times), 4) or present.dtype.kind != "b":
            raise ValueError("invalid timeline arrays")
        if times.tolist() != sampled:
            raise ValueError("timeline dropped, shifted or inserted checkpoint samples")
        frames = [[float(t), str(s), [float(v) for v in b] if p else None, bool(p)] for t, s, b, p in zip(times, states, boxes, present)]
    validate_frames(frames, context["metadata"])
    # Only generated, private attempt directories are removed on failure. No existing export is overwritten.
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    attempt = uuid4().hex
    staging = output / (".tmp-" + attempt)
    final = output / attempt
    staging.mkdir(mode=0o700)
    try:
        claims = staging / "full_claims.json"
        claims.write_bytes(canonical({"schema": CLAIMS_SCHEMA, "frames": frames}))
        summary = {k: report.get(k) for k in ("schema", "target", "coverage", "identity", "invariants", "analysedRange")}
        record = {"schema": SCHEMA, "status": "complete", "metadata": context["metadata"],
                  "provenanceKind": "server-attested-context-and-verified-checkpoints",
                  "contextSha256": digest(context), "checkpointSourceSha256": context["checkpointSourceSha256"],
                  "segmentPlan": plan, "segmentPlanSha256": digest(plan), "schedule": context["schedule"],
                  "reportSummarySha256": digest(summary),
                  "claimsFile": {"file": claims.name, "sha256": file_digest(claims), "frames": len(frames)}}
        (staging / "record.json").write_bytes(canonical(record))
        staging.rename(final)
    except Exception:
        shutil.rmtree(staging)
        raise
    return final / "record.json"
