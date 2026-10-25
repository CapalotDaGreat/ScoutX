import json
import math

import pytest

from eval.full_match_validation import Review, digest, main, markdown, prepare, publish, report, score, seal

TARGET = {"jerseyNumber": "8", "kitPrimaryColor": "orange"}


def reviewed(duration=30):
    models = {"detector": "synthetic"}
    scope = {"jobId": "orange8", "generation": 1, "sourceSha256": "a" * 64, "modelSetDigest": digest(models)}
    return {"schemaVersion": 1, "sourceSha256": "a" * 64, "durationSec": float(duration), "target": TARGET,
            "anchors": {"scope": scope, "anchors": [{"frameId": "anchor", "anchorId": "anchor", "framePts": 30,
                "timeBaseNumerator": 1, "timeBaseDenominator": 30, "timestampSec": 1.0,
                "box": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2}, "evidenceHash": "b" * 64}]},
            "anchorReviewer": "reviewer_a", "evaluator": "reviewer_b", "producer": "operator",
            "anchorsReviewed": True, "blindedBeforePredictions": True, "authorizedLocalEvaluation": True,
            "labels": [{"timeSec": float(t), "state": "visible", "box": [0., 0., 10., 20.], "tags": []} for t in range(0, duration, 5)]}


def run_fixture(tmp_path, raw):
    root = tmp_path / "run"
    root.mkdir()
    duration = raw["durationSec"]
    scheduled = [{"segmentIndex": i, "startSec": i * 600, "endSec": min((i + 1) * 600, duration)} for i in range(math.ceil(duration / 600))]
    anchor = raw["anchors"]["anchors"][0]
    refs = [{"anchorId": anchor["anchorId"], "timestampSec": anchor["timestampSec"], "box": anchor["box"],
             "evidenceHash": anchor["evidenceHash"], "frameIndex": 30, "scope": raw["anchors"]["scope"]}]
    files = {"plan.json": {"mode": "run", "workerVersion": "synthetic/1", "authorizedLocalEvaluation": True,
              "cloudUpload": False, "modelTraining": False, "sourceSha256": raw["sourceSha256"], "target": raw['target'],
              "durationSec": duration, "fps": 2, "segments": scheduled},
             "complete.json": {"status": "complete", "segments": len(scheduled)},
             "artifact.json": {"schemaVersion": 1, "generation": 1,
                 "sourceProof": {"schemaVersion": 1, "scope": raw["anchors"]["scope"], "evidenceFormat": "rgb24-sha256",
                     "frames": [{**{k: v for k, v in anchor.items() if k not in ("anchorId", "box")}, "frameIndex": 30, "width": 100, "height": 100}]},
                 "evidence": {"scope": raw["anchors"]["scope"], "target": raw['target'], "references": refs}}}
    for s in scheduled:
        start, end = s["startSec"], s["endSec"]
        files[f"segment-{s['segmentIndex']:03d}.json"] = {
            "segment": {"contractVersion": 2, "workerVersion": "synthetic/1", "models": {"detector": "synthetic"},
                "segmentIndex": s["segmentIndex"], "cameraView": "unclear",
                "stages": {"tracking": "complete", "identity": "complete", "events": "unavailable", "pitch": "unavailable"},
                "identity": {"state": "UNKNOWN", "candidates": []},
                "coverage": {"analysedSec": end - start, "targetVisibleSec": 0, "framesDecoded": int((end - start) * 2)},
                "availability": [{"startSec": start, "endSec": end, "state": "UNKNOWN", "confidence": 0}], "events": []},
            "targetTrace": [], "decodeAudit": {"complete": True, "timestampsValid": True, "missingIntervals": [],
                "requestedStartSec": start, "requestedEndSec": end, "sampleStepSec": 0.5, "timestampToleranceSec": 0.250001,
                "framesDecoded": int((end - start) * 2), "sampledSourceIntervals": [[start, end]]}}
    for name, value in files.items():
        (root / name).write_text(json.dumps(value))
    return root, files


def test_metrics_distinguish_wrong_player_localization_misses_and_visibility():
    raw = reviewed()
    raw["labels"][1]["otherPlayerBoxes"] = [[30., 0., 40., 20.]]
    raw["labels"][3].update(state="off_camera", box=None)
    raw["labels"][4].update(state="uncertain", box=None)
    trace = [{"timeSec": t, "box": b} for t, b in [(0, [0, 0, 10, 20]), (5, [30, 0, 40, 20]), (10, [60, 0, 70, 20]), (15, [0, 0, 10, 20])]]
    result = score(Review.model_validate(raw), trace, [{"startSec": 0, "endSec": 30, "state": "CONFIRMED_VISIBLE"}])["summary"]
    assert result["correct"] == 1
    assert result["wrongPlayerConfirmed"] == result["wrongOrMislocalized"] == result["falseTargetClaims"] == 1
    assert result["sampledIdentityPrecision"] == result["sampledWrongPlayerRate"] == .25
    assert result["sampledTargetRecall"] == .25
    assert result["sampledVisibilityRecall"] == 1
    assert result["sampledVisibilityPrecision"] == .8
    assert result["abstained"] == result["excluded"] == 1


def test_zero_denominators_and_calibration_exclusion():
    raw = reviewed(10)
    raw["anchors"]["anchors"][0].update(framePts=0, timestampSec=0.0)
    raw["labels"][1].update(state="uncertain", box=None)
    s = score(Review.model_validate(raw), [], [])["summary"]
    assert s["evaluated"] == 0 and s["excluded"] == 2
    assert s["sampledIdentityPrecision"] is None and s["sampledTargetRecall"] is None


@pytest.mark.parametrize("change", ["unreviewed", "same_reviewer", "same_anchor_reviewer", "unblinded", "unreviewed_anchors", "missing", "wrong_target", "bad_box", "nonfinite", "url_field"])
def test_review_cannot_silently_cherry_pick_or_skip_review(change):
    raw = reviewed()
    if change == "unreviewed": raw["labels"][0]["state"] = "unreviewed"; raw["labels"][0]["box"] = None
    if change == "same_reviewer": raw["evaluator"] = raw["producer"]
    if change == "same_anchor_reviewer": raw["anchorReviewer"] = raw["evaluator"]
    if change == "unblinded": raw["blindedBeforePredictions"] = False
    if change == "unreviewed_anchors": raw["anchorsReviewed"] = False
    if change == "missing": raw["labels"].pop()
    if change == "wrong_target": raw["target"] = {"jerseyNumber": "", "kitPrimaryColor": "orange"}
    if change == "bad_box": raw["labels"][0]["box"] = [1., 0., 0., 1.]
    if change == "nonfinite": raw["durationSec"] = float("nan")
    if change == "url_field": raw["url"] = "https://invalid.example/video"
    with pytest.raises(ValueError): seal(raw)


def test_full_140_minute_schedule_report_and_per_segment_denominators(tmp_path):
    raw = reviewed(8400)
    raw["labels"][840]["tags"] = ["halftime"]
    root, _ = run_fixture(tmp_path, raw)
    result = report(seal(raw), root)
    assert len(result["segments"]) == 14 and result["summary"]["scheduled"] == 1680
    assert result["summary"]["abstained"] == 1680
    assert result["difficulty"]["halftime"]["evaluated"] == 1
    assert result["productionApproval"] is result["modelTraining"] is result["cloudUpload"] is False
    assert "not granted" in markdown(result)
    assert "not measurable" in markdown(result)


@pytest.mark.parametrize("change", ["partial", "gap", "wrong_source", "wrong_anchor", "wrong_models", "unordered_trace", "candidate", "training", "missing_segment"])
def test_incomplete_or_mismatched_runs_fail_closed(tmp_path, change):
    raw = reviewed()
    root, files = run_fixture(tmp_path, raw)
    if change == "partial": files["complete.json"]["status"] = "partial"
    if change == "gap": files["segment-000.json"]["decodeAudit"]["sampledSourceIntervals"] = [[0, 10], [11, 30]]
    if change == "wrong_source": files["plan.json"]["sourceSha256"] = "f" * 64
    if change == "wrong_anchor": files["artifact.json"]["evidence"]["references"][0]["evidenceHash"] = "f" * 64
    if change == "wrong_models": files["segment-000.json"]["segment"]["models"] = {"detector": "other"}
    if change == "unordered_trace": files["segment-000.json"]["targetTrace"] = [{"timeSec": t, "box": [0., 0., 10., 20.]} for t in [5., 0.]]
    if change == "candidate": files["segment-000.json"]["segment"]["identity"]["candidates"] = [{}]
    if change == "training": files["plan.json"]["modelTraining"] = True
    for name, value in files.items(): (root / name).write_text(json.dumps(value))
    if change == "missing_segment": (root / "segment-000.json").unlink()
    with pytest.raises((ValueError, FileNotFoundError)): report(seal(raw), root)


def test_seal_tampering_and_no_overwrite(tmp_path):
    raw = reviewed()
    root, _ = run_fixture(tmp_path, raw)
    locked = seal(raw)
    locked["review"]["labels"][0]["tags"] = ["camera_cut"]
    with pytest.raises(ValueError): report(locked, root)
    output = tmp_path / "output"
    publish(output, {"test.json": b"original"})
    with pytest.raises(ValueError): publish(output, {"test.json": b"replacement"})
    assert (output / "test.json").read_bytes() == b"original"


def test_cli_explicit_authorization_and_local_paths(tmp_path):
    with pytest.raises(SystemExit): main(["seal", "--out", str(tmp_path / "out"), "--review", "x"])
    assert main(["report", "--out", str(tmp_path / "out"), "--review", "https://invalid.example/review",
                 "--run-dir", str(tmp_path), "--authorize-local-evaluation"]) == 1
    assert not (tmp_path / "out").exists()


def test_prepare_checks_source_and_reviewed_pts_without_models_or_output(tmp_path, monkeypatch):
    from eval import full_match_validation as workflow
    source = tmp_path / "generated.bin"
    source.write_bytes(b"generated test fixture, not match footage")
    raw = reviewed()
    sha = workflow.source_sha256(source)
    raw["anchors"]["scope"]["sourceSha256"] = sha
    manifest = tmp_path / "anchors.json"
    manifest.write_text(json.dumps(raw["anchors"]))
    calls = []
    monkeypatch.setattr(workflow, "inspect_duration", lambda _: 30.)
    monkeypatch.setattr(workflow, "resolve_local_anchors", lambda path, anchors: calls.append((path, anchors.scope.sourceSha256)))
    draft = prepare(source, manifest, "reviewer_b", "operator", "reviewer_a", target=TARGET)
    assert calls == [(source, sha)]
    assert all(v["state"] == "unreviewed" for v in draft["labels"])
    assert draft["anchorsReviewed"] is draft["blindedBeforePredictions"] is False
    with pytest.raises(ValueError): seal(draft)


def test_cli_writes_new_sealed_and_accuracy_outputs(tmp_path):
    raw = reviewed()
    root, _ = run_fixture(tmp_path, raw)
    review = tmp_path / "review.json"
    review.write_text(json.dumps(raw))
    locked = tmp_path / "sealed"
    assert main(["seal", "--review", str(review), "--out", str(locked), "--authorize-local-evaluation"]) == 0
    output = tmp_path / "report"
    args = ["report", "--review", str(locked / "review.sealed.json"), "--run-dir", str(root), "--out", str(output), "--authorize-local-evaluation"]
    assert main(args) == 0
    original = (output / "accuracy.json").read_bytes()
    assert json.loads(original)["productionApproval"] is False
    assert main(args) == 1
    assert (output / "accuracy.json").read_bytes() == original


def test_quantized_source_sampling_uses_audit_not_nominal_frame_rate(tmp_path):
    raw = reviewed()
    root, files = run_fixture(tmp_path, raw)
    output = files["segment-000.json"]
    output["segment"]["coverage"]["framesDecoded"] = 58
    output["decodeAudit"]["framesDecoded"] = 58
    output["decodeAudit"]["sampledSourceIntervals"] = [[i * .52, min(i * .52 + .5, 30)] for i in range(58)]
    (root / "segment-000.json").write_text(json.dumps(output))
    assert report(seal(raw), root)["summary"]["scheduled"] == 6


@pytest.mark.parametrize("trace", ["missing", None, {}, ""])
def test_missing_or_non_list_trace_is_not_silent_abstention(tmp_path, trace):
    raw = reviewed()
    root, files = run_fixture(tmp_path, raw)
    output = files["segment-000.json"]
    if trace == "missing":
        del output["targetTrace"]
    else:
        output["targetTrace"] = trace
    (root / "segment-000.json").write_text(json.dumps(output))
    with pytest.raises(ValueError, match="explicit target trace required"):
        report(seal(raw), root)


def test_anchor_reviewer_may_be_producer_but_not_ground_truth_reviewer():
    raw = reviewed()
    raw["anchorReviewer"] = raw["producer"]
    assert seal(raw)["review"]["anchorReviewer"] == raw["producer"]


@pytest.mark.parametrize('jersey,colour', [('8', 'orange'), ('20', 'orange'), ('7', 'blue')])
def test_explicit_target_survives_review_run_and_report(tmp_path, jersey, colour):
    raw = reviewed()
    raw['target'] = {'jerseyNumber': jersey, 'kitPrimaryColor': colour}
    root, _ = run_fixture(tmp_path, raw)
    result = report(seal(raw), root)
    assert result['target'] == raw['target']
    assert f'{colour.title()} #{jersey}' in markdown(result)
    assert result['productionApproval'] is False


def test_orange_twenty_review_rejects_old_orange_eight_run(tmp_path):
    raw = reviewed()
    root, _ = run_fixture(tmp_path, raw)
    raw['target'] = {'jerseyNumber': '20', 'kitPrimaryColor': 'orange'}
    with pytest.raises(ValueError, match='reviewed target'):
        report(seal(raw), root)


def test_sealed_target_cannot_be_overridden_at_report_time(tmp_path):
    raw = reviewed()
    locked = tmp_path / 'sealed.json'
    locked.write_text(json.dumps(seal(raw)))
    out = tmp_path / 'out'
    assert main(['report', '--review', str(locked), '--run-dir', str(tmp_path),
                 '--out', str(out), '--jersey-number', '20', '--authorize-local-evaluation']) == 1
    assert not out.exists()


def test_prepare_does_not_default_to_previous_target(tmp_path):
    out = tmp_path / 'out'
    assert main(['prepare', '--input', str(tmp_path / 'not-read.mp4'),
                 '--anchors', str(tmp_path / 'not-read.json'), '--evaluator', 'reviewer_b',
                 '--producer', 'operator', '--anchor-reviewer', 'reviewer_a',
                 '--out', str(out), '--authorize-local-evaluation']) == 1
    assert not out.exists()
