"""Local, independently reviewed explicit-target benchmark; never grants release approval."""
from __future__ import annotations

import argparse
from bisect import bisect_left
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, model_validator

from app.contract import SegmentResult
from app.experimental_identity import Digest, Id, StrictModel
from app.source_pts import AnchorManifest, SourcePtsProof, resolve_local_anchors, source_sha256
from app.match_identity import MatchTarget
from eval.evaluate import iou, ratio
from eval.match import inspect_duration
from eval.prepare_anchor import _local_path, _publish, _signature

VERSION = "pitchproof-independent-full-match/1"
STEP = 5
WINDOW = 0.25


class Label(StrictModel):
    timeSec: Annotated[float, Field(ge=0, le=9000)]
    state: Literal["unreviewed", "visible", "off_camera", "occluded", "uncertain", "non_play"]
    box: list[float] | None
    tags: list[Literal["halftime", "camera_cut", "occlusion", "re_entry", "similar_kits", "duplicate_number"]]
    otherPlayerBoxes: Annotated[list[list[float]], Field(max_length=22)] = Field(default_factory=list)

    @model_validator(mode="after")
    def geometry(self):
        if self.state == "visible":
            if (self.box is None or len(self.box) != 4 or not all(math.isfinite(v) for v in self.box)
                    or not 0 <= self.box[0] < self.box[2] <= 32768
                    or not 0 <= self.box[1] < self.box[3] <= 32768):
                raise ValueError("visible labels require a valid source-pixel target box")
        elif self.box is not None:
            raise ValueError("non-visible labels must not invent a target box")
        if len(set(self.tags)) != len(self.tags):
            raise ValueError("duplicate difficulty tag")
        for box in self.otherPlayerBoxes:
            if (len(box) != 4 or not all(math.isfinite(v) for v in box)
                    or not 0 <= box[0] < box[2] <= 32768 or not 0 <= box[1] < box[3] <= 32768):
                raise ValueError("anonymous other-player boxes must be valid source pixels")
            if self.box is not None and iou(box, self.box) >= 0.5:
                raise ValueError("conflicting target/other-player ground truth")
        return self


class Review(StrictModel):
    schemaVersion: Literal[1]
    sourceSha256: Digest
    durationSec: Annotated[float, Field(gt=0, le=9000)]
    target: dict[str, str]
    anchors: AnchorManifest
    anchorReviewer: Id
    evaluator: Id
    producer: Id
    anchorsReviewed: bool
    blindedBeforePredictions: bool
    authorizedLocalEvaluation: Literal[True]
    labels: Annotated[list[Label], Field(min_length=1, max_length=1800)]

    @model_validator(mode="after")
    def binding(self):
        target = MatchTarget.model_validate(self.target)
        if self.target != target.model_dump(exclude_defaults=True):
            raise ValueError("explicit canonical target description required")
        if self.anchors.scope.sourceSha256 != self.sourceSha256:
            raise ValueError("exact source binding required")
        if self.evaluator == self.producer:
            raise ValueError("ground truth reviewer must differ from inference producer")
        if self.anchorReviewer == self.evaluator:
            raise ValueError("anchor reviewer must differ from ground truth reviewer")
        if [v.timeSec for v in self.labels] != [float(t) for t in range(0, math.ceil(self.durationSec), STEP)]:
            raise ValueError("every preselected full-recording sample must be retained")
        if any(a.timestampSec >= self.durationSec for a in self.anchors.anchors):
            raise ValueError("anchor outside recording")
        return self


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def read_json(path: Path, maximum: int = 16 * 1024 * 1024):
    local = _local_path(path).resolve(strict=True)
    _local_path(local)
    with local.open("rb") as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("metadata exceeds local budget")
    return json.loads(data, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite JSON")))


def publish(output: Path, files: dict[str, bytes]) -> None:
    output = _local_path(output)
    if output.exists() or output.is_symlink():
        raise ValueError("output directory must be new")
    output = output.resolve()
    _local_path(output)
    if not output.parent.is_dir():
        raise ValueError("output parent must exist")
    output.mkdir(exist_ok=False)
    for name, data in files.items():
        _publish(output, name, lambda stream, payload=data: stream.write(payload))


def encoded(value: object) -> bytes:
    return json.dumps(value, indent=2, allow_nan=False).encode()


def prepare(source: Path, anchors: Path, evaluator: str, producer: str, anchor_reviewer: str,
            *, target: dict[str, str]) -> dict:
    target = MatchTarget.model_validate(target).model_dump(exclude_defaults=True)
    source = _local_path(source).resolve(strict=True)
    _local_path(source)
    before = source.stat()
    sha = source_sha256(source)
    duration = inspect_duration(source)
    if not math.isfinite(duration) or not 0 < duration <= 9000:
        raise ValueError("recording must be positive and at most 150 minutes")
    manifest = AnchorManifest.model_validate(read_json(anchors))
    resolve_local_anchors(source, manifest)  # Recompute source PTS/RGB hashes; no inference or persisted frames.
    review = Review(schemaVersion=1, sourceSha256=sha, durationSec=duration, target=target,
                    anchors=manifest, evaluator=evaluator, producer=producer, anchorReviewer=anchor_reviewer,
                    anchorsReviewed=False, blindedBeforePredictions=False, authorizedLocalEvaluation=True,
                    labels=[Label(timeSec=float(t), state="unreviewed", box=None, tags=[])
                            for t in range(0, math.ceil(duration), STEP)])
    if _signature(source.stat()) != _signature(before):
        raise ValueError("source changed while preparing review")
    return review.model_dump()


def seal(raw: object) -> dict:
    review = Review.model_validate(raw)
    if not review.anchorsReviewed or not review.blindedBeforePredictions:
        raise ValueError("reviewed anchors and blind independent review attestation required")
    if any(v.state == "unreviewed" for v in review.labels):
        raise ValueError("all recording samples require explicit review, including halftime")
    payload = review.model_dump()
    return {"version": VERSION, "review": payload, "reviewSha256": digest(payload),
            "sealedAt": datetime.now(timezone.utc).isoformat()}


def load_run(directory: Path, review: Review) -> tuple[list[dict], list[dict], dict]:
    root = _local_path(directory).resolve(strict=True)
    _local_path(root)
    consumed: dict[str, str] = {}
    total_bytes = 0

    def read(name: str):
        nonlocal total_bytes
        file = (root / name).resolve(strict=True)
        if file.parent != root:
            raise ValueError("run file escapes directory")
        value = read_json(file)
        total_bytes += file.stat().st_size
        if total_bytes > 64 * 1024 * 1024:
            raise ValueError("run exceeds bounded metadata budget")
        consumed[name] = digest(value)
        return value

    plan, complete, artifact = read("plan.json"), read("complete.json"), read("artifact.json")
    n = math.ceil(review.durationSec / 600)
    if (plan.get("mode") != "run" or plan.get("authorizedLocalEvaluation") is not True
            or plan.get("modelTraining") is not False or plan.get("cloudUpload") is not False
            or plan.get("sourceSha256") != review.sourceSha256 or plan.get("target") != review.target
            or plan.get("durationSec") != review.durationSec or plan.get("fps") != 2
            or complete != {"status": "complete", "segments": n}):
        raise ValueError("complete source-bound run for the reviewed target required")
    expected = [{"segmentIndex": i, "startSec": i * 600, "endSec": min((i + 1) * 600, review.durationSec)} for i in range(n)]
    if plan.get("segments") != expected:
        raise ValueError("missing, reordered or overlapping segments")
    evidence = artifact.get("evidence", {})
    proof = SourcePtsProof.model_validate(artifact.get("sourceProof"))
    if (artifact.get("schemaVersion") != 1 or artifact.get("generation") != review.anchors.scope.generation
            or proof.scope != review.anchors.scope or any(f.timestampSec >= review.durationSec for f in proof.frames)):
        raise ValueError("source/PTS proof differs from reviewed scope")
    if evidence.get("scope") != review.anchors.scope.model_dump() or evidence.get("target") != review.target:
        raise ValueError("reviewed anchor scope differs from run")
    refs = evidence.get("references", [])
    if len(refs) != len(review.anchors.anchors):
        raise ValueError("reviewed calibration anchors differ from run")
    for anchor in review.anchors.anchors:
        matches = [r for r in refs if r.get("anchorId") == anchor.anchorId]
        if len(matches) != 1 or any(matches[0].get(k) != v for k, v in {
                "timestampSec": anchor.timestampSec, "box": anchor.box.model_dump(),
                "evidenceHash": anchor.evidenceHash, "scope": review.anchors.scope.model_dump()}.items()):
            raise ValueError("reviewed anchor mismatch")
        frames = [f for f in proof.frames if f.frameId == anchor.frameId]
        if len(frames) != 1 or any(getattr(frames[0], k) != v for k, v in anchor.model_dump(exclude={"anchorId", "box"}).items()):
            raise ValueError("reviewed rational PTS/RGB anchor differs from source proof")
        if matches[0].get("frameIndex") != frames[0].frameIndex:
            raise ValueError("reviewed source frame index mismatch")
    traces, windows = [], []
    versions = None
    for s in expected:
        output = read(f"segment-{s['segmentIndex']:03d}.json")
        segment = SegmentResult.model_validate(output["segment"])
        audit = output.get("decodeAudit", {})
        if (segment.segmentIndex != s["segmentIndex"] or segment.workerVersion != plan.get("workerVersion")
                or segment.stages.tracking != "complete" or segment.stages.identity != "complete"
                or segment.identity.candidates or audit.get("complete") is not True
                or audit.get("timestampsValid") is not True or audit.get("missingIntervals") != []
                or audit.get("requestedStartSec") != s["startSec"] or audit.get("requestedEndSec") != s["endSec"]
                or audit.get("sampleStepSec") != 0.5 or not 0 <= audit.get("timestampToleranceSec", -1) <= 0.250001
                or audit.get("framesDecoded") != segment.coverage.framesDecoded):
            raise ValueError("incomplete or candidate-bearing prediction segment")
        current_versions = segment.models
        if versions is not None and current_versions != versions:
            raise ValueError("model versions changed across segments")
        versions = current_versions
        cursor = s["startSec"]
        covered = 0.0
        intervals = audit.get("sampledSourceIntervals", [])
        if not intervals or not 0 < segment.coverage.framesDecoded <= 100000 or len(intervals) > segment.coverage.framesDecoded:
            raise ValueError("insufficient decode audit")
        for a, b in intervals:
            if not all(math.isfinite(t) for t in (a, b)) or not cursor <= a <= cursor + 0.250001 or not a < b <= s["endSec"]:
                raise ValueError("decode audit contains gaps")
            covered += b - a
            cursor = b
        if s["endSec"] - cursor > 0.250001 or covered > segment.coverage.framesDecoded * 0.5 + 1e-6:
            raise ValueError("decode audit ends early")
        trace = output.get("targetTrace")
        if not isinstance(trace, list):
            raise ValueError("explicit target trace required, including empty abstentions")
        previous = -1
        for p in trace:
            label = Label(timeSec=p["timeSec"], state="visible", box=p["box"], tags=[])
            if not s["startSec"] <= label.timeSec < s["endSec"] or label.timeSec <= previous:
                raise ValueError("unordered or out-of-segment prediction trace")
            previous = label.timeSec
            traces.append({"timeSec": label.timeSec, "box": label.box})
        for w in segment.availability:
            if not s["startSec"] <= w.startSec < w.endSec <= s["endSec"]:
                raise ValueError("availability outside segment")
            windows.append(w.model_dump())
    if digest(dict(sorted((versions or {}).items()))) != review.anchors.scope.modelSetDigest:
        raise ValueError("reviewed model-set scope mismatch")
    return traces, windows, {"workerVersion": plan["workerVersion"], "models": versions, "files": consumed}


def score(review: Review, trace: list[dict], windows: list[dict]) -> dict:
    """Sampled evidence, not continuous tracking; no inferred player identity from low IoU."""
    rows = []
    ordered = sorted(trace, key=lambda p: p["timeSec"])
    times = [p["timeSec"] for p in ordered]
    for label in review.labels:
        calibration = any(abs(label.timeSec - a.timestampSec) <= WINDOW for a in review.anchors.anchors)
        index = bisect_left(times, label.timeSec)
        nearby = [p for p in ordered[max(0, index - 1):index + 1] if abs(p["timeSec"] - label.timeSec) <= WINDOW]
        prediction = min(nearby, key=lambda p: abs(p["timeSec"] - label.timeSec)) if nearby else None
        claimed_visible = any(w["startSec"] <= label.timeSec < w["endSec"] and w["state"] == "CONFIRMED_VISIBLE" for w in windows)
        outcome = "excluded" if calibration or label.state in ("uncertain", "occluded") else (
            "abstained" if prediction is None else "correct" if label.state == "visible" and iou(prediction["box"], label.box) >= 0.5 else
            "wrong_player" if any(iou(prediction["box"], b) >= 0.5 for b in label.otherPlayerBoxes) else
            "wrong_or_mislocalized" if label.state == "visible" else "false_target_claim")
        rows.append({"timeSec": label.timeSec, "state": label.state, "tags": label.tags,
                     "calibration": calibration, "outcome": outcome, "visibleClaim": claimed_visible})

    def summarize(items):
        evaluated = [r for r in items if r["outcome"] != "excluded"]
        count = lambda kind: sum(r["outcome"] == kind for r in evaluated)
        correct, wrong, false = count("correct"), count("wrong_or_mislocalized"), count("false_target_claim")
        confirmed_wrong = count("wrong_player")
        claimed = correct + wrong + false + confirmed_wrong
        visible = sum(r["state"] == "visible" for r in evaluated)
        tp = sum(r["visibleClaim"] and r["state"] == "visible" for r in evaluated)
        fp = sum(r["visibleClaim"] and r["state"] != "visible" for r in evaluated)
        return {"scheduled": len(items), "evaluated": len(evaluated), "excluded": len(items) - len(evaluated),
                "visible": visible, "correct": correct, "wrongOrMislocalized": wrong, "wrongPlayerConfirmed": confirmed_wrong, "falseTargetClaims": false,
                "claimed": claimed, "abstained": count("abstained"), "visibilityTruePositive": tp, "visibilityFalsePositive": fp,
                "visibilityFalseNegative": visible - tp, "reviewScorableFraction": ratio(len(evaluated), len(items)),
                "sampledIdentityPrecision": ratio(correct, claimed), "sampledWrongPlayerRate": ratio(confirmed_wrong, claimed),
                "sampledWrongOrMislocalizedRate": ratio(wrong + false + confirmed_wrong, claimed),
                "sampledTargetRecall": ratio(correct, visible), "sampledAbstentionRate": ratio(count("abstained"), len(evaluated)),
                "sampledVisibilityPrecision": ratio(tp, tp + fp), "sampledVisibilityRecall": ratio(tp, visible)}
    return {"summary": summarize(rows), "segments": [{"startSec": s, "endSec": min(s + 600, review.durationSec),
             **summarize([r for r in rows if s <= r["timeSec"] < s + 600])} for s in range(0, math.ceil(review.durationSec), 600)],
            "difficulty": {tag: summarize([r for r in rows if tag in r["tags"]]) for tag in sorted({t for r in rows for t in r["tags"]})},
            "samples": rows}


def report(sealed: dict, directory: Path) -> dict:
    review = Review.model_validate(sealed["review"])
    if sealed.get("version") != VERSION or sealed.get("reviewSha256") != digest(review.model_dump()):
        raise ValueError("sealed review was changed")
    seal(review.model_dump())
    traces, windows, provenance = load_run(directory, review)
    scores = score(review, traces, windows)
    return {"version": VERSION, "status": "reviewed_sampled_benchmark" if scores["summary"]["evaluated"] else "insufficient_scorable_review", "productionApproval": False,
            "modelTraining": False, "cloudUpload": False, "sourceSha256": review.sourceSha256,
            "reviewSha256": sealed["reviewSha256"], "target": review.target, "durationSec": review.durationSec,
            "reviewers": {"anchors": review.anchorReviewer, "groundTruth": review.evaluator, "producer": review.producer},
            "independence": "Reviewer-attested blinding; seal is tamper-evident, not a signed external audit.",
            "method": {"sampleStepSec": STEP, "matchWindowSec": WINDOW, "identityIoU": 0.5,
                       "limitations": "Confirmed wrong-player rate is a lower bound from independently boxed other players. Low IoU alone means wrong-player OR localization error. Uncertain/occluded and calibration samples excluded; no continuous-duration accuracy claim."},
            "provenance": provenance, **scores}


def markdown(value: dict) -> str:
    s = value["summary"]
    target = MatchTarget.model_validate(value['target'])
    lines = [f"# {target.kitPrimaryColor.title()} #{target.jerseyNumber} independent full-match benchmark", "", "Production approval: **not granted**.",
             "", f"Reviewed recording: {value['durationSec']} seconds; {s['evaluated']} scored samples, {s['excluded']} excluded.",
             f"Raw claims: {s['claimed']}; correct: {s['correct']}; confirmed wrong player: {s['wrongPlayerConfirmed']}; unexplained mislocalization: {s['wrongOrMislocalized']}; false absent-target claims: {s['falseTargetClaims']}; abstained: {s['abstained']}.", ""]
    for key in ("sampledIdentityPrecision", "sampledWrongPlayerRate", "sampledWrongOrMislocalizedRate", "sampledTargetRecall", "sampledAbstentionRate", "sampledVisibilityPrecision", "sampledVisibilityRecall"):
        lines.append(f"- {key}: {s[key]:.4f}" if s[key] is not None else f"- {key}: not measurable (zero denominator)")
    lines.extend(["", value["method"]["limitations"], "", value["independence"], "",
                  "No model training or footage upload. A single match cannot satisfy multi-video production acceptance criteria.", ""])
    return "\n".join(lines)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["prepare", "seal", "report"])
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--authorize-local-evaluation", action="store_true", required=True)
    parser.add_argument("--jersey-number")
    parser.add_argument("--kit-primary-color")
    parser.add_argument("--kit-secondary-color", default="")
    for name in ("input", "anchors", "review", "run-dir", "evaluator", "producer", "anchor-reviewer"):
        parser.add_argument(f"--{name}")
    args = parser.parse_args(argv)
    try:
        if args.mode == "prepare":
            target = {"jerseyNumber": args.jersey_number, "kitPrimaryColor": args.kit_primary_color}
            if args.kit_secondary_color:
                target['kitSecondaryColor'] = args.kit_secondary_color
            value = prepare(Path(args.input), Path(args.anchors), args.evaluator, args.producer,
                            args.anchor_reviewer, target=target)
            files = {"review.draft.json": encoded(value)}
        elif args.mode == "seal":
            if args.jersey_number is not None or args.kit_primary_color is not None or args.kit_secondary_color:
                raise ValueError("sealed target must come from the reviewed source, not a CLI override")
            files = {"review.sealed.json": encoded(seal(read_json(Path(args.review))))}
        else:
            if args.jersey_number is not None or args.kit_primary_color is not None or args.kit_secondary_color:
                raise ValueError("reported target must come from the sealed review, not a CLI override")
            value = report(read_json(Path(args.review)), Path(args.run_dir))
            files = {"accuracy.json": encoded(value), "accuracy.md": markdown(value).encode()}
        publish(args.out, files)
    except Exception:
        print("Validation failed: check local paths, independent review, exact source/anchor scope and complete run. No approval or existing output changed.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
