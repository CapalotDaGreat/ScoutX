import hashlib
import json
from types import SimpleNamespace

import pytest

from app.pipeline import Components, analyse_segment
from eval import match


def arguments(tmp_path):
    source = tmp_path / "match.mp4"
    source.write_bytes(b"fake local footage")
    return ["--input", str(source), "--out", str(tmp_path / "new"),
            "--jersey-number", "8", "--kit-primary-color", "orange",
            "--reference-sec", "10", "--authorize-local-evaluation"]


@pytest.mark.parametrize("flag,value", [
    ("--jersey-number", "100"), ("--jersey-number", "\u0668"),
    ("--jersey-number", "8\n"), ("--kit-primary-color", "unknown"),
    ("--reference-sec", "nan"), ("--reference-sec", "inf"),
    ("--reference-sec", "-1"),
])
def test_invalid_arguments(tmp_path, flag, value):
    argv = arguments(tmp_path)
    argv[argv.index(flag) + 1] = value
    with pytest.raises(SystemExit):
        match.parse_args(argv)


def test_authorization_required(tmp_path):
    argv = arguments(tmp_path)[:-1]
    with pytest.raises(SystemExit):
        match.parse_args(argv)


def test_plan_preserves_explicit_orange_twenty_and_white_sleeves(tmp_path):
    argv = arguments(tmp_path)
    argv[argv.index('--jersey-number') + 1] = '20'
    args = match.parse_args([*argv, '--kit-secondary-color', 'white'])
    plan = match.evaluate(args, inspect=lambda _: 30.)
    assert plan['target'] == {'jerseyNumber': '20', 'kitPrimaryColor': 'orange', 'kitSecondaryColor': 'white'}
    assert plan['mode'] == 'plan-only'
    assert plan['modelTraining'] is plan['cloudUpload'] is False


@pytest.mark.parametrize("source,explanation", [
    ("https://app.veo.co/matches/example/?secret=do-not-echo", "authorized provider integration"),
    ("https://example.org/video.mp4?token=do-not-echo", "authorized local MP4"),
])
def test_provider_links_return_actionable_error_without_fetch_or_token_echo(tmp_path, capsys, source, explanation):
    argv = arguments(tmp_path)
    argv[argv.index("--input") + 1] = source
    with pytest.raises(SystemExit):
        match.parse_args(argv)
    error = capsys.readouterr().err
    assert explanation in error
    assert "do-not-echo" not in error


@pytest.mark.parametrize("duration", [0, -1, float("nan"), float("inf"), 9001])
def test_invalid_metadata(tmp_path, duration):
    args = match.parse_args(arguments(tmp_path))
    with pytest.raises(ValueError):
        match.evaluate(args, inspect=lambda _: duration)
    assert not args.out.exists()


def test_full_match_plan_never_loads_models(tmp_path):
    args = match.parse_args(arguments(tmp_path))
    def forbidden():
        pytest.fail("plan initialized models")
    plan = match.evaluate(args, inspect=lambda _: 8400, component_factory=forbidden)
    assert len(plan["segments"]) == 14
    assert plan["segments"][-1] == {"segmentIndex": 13, "startSec": 7800, "endSec": 8400}
    assert plan["sourceSha256"] == hashlib.sha256(args.input.read_bytes()).hexdigest()
    assert plan["target"] == {"jerseyNumber": "8", "kitPrimaryColor": "orange"}
    assert "provenance-only" in plan["referenceRole"]
    assert list(args.out.iterdir()) == [args.out / "plan.json"]
    assert "https://" not in (args.out / "plan.json").read_text()
    with pytest.raises(FileExistsError):
        match.evaluate(args, inspect=lambda _: 8400)


@pytest.mark.parametrize("reference", [20, 21])
def test_reference_must_be_in_actual_duration(tmp_path, reference):
    args = match.parse_args(arguments(tmp_path))
    args.reference_sec = reference
    with pytest.raises(ValueError):
        match.evaluate(args, inspect=lambda _: 20)
    assert not args.out.exists()


@pytest.mark.parametrize("output", ["source", "existing", "ancestor"])
def test_nonoverwrite_paths(tmp_path, output):
    argv = arguments(tmp_path)
    existing = tmp_path / "existing"
    existing.mkdir()
    path = {"source": tmp_path / "match.mp4", "existing": existing, "ancestor": tmp_path}[output]
    argv[argv.index("--out") + 1] = str(path)
    with pytest.raises(SystemExit):
        match.parse_args(argv)
    assert (tmp_path / "match.mp4").read_bytes() == b"fake local footage"


def test_missing_input_is_nonzero(tmp_path):
    argv = arguments(tmp_path)
    (tmp_path / "match.mp4").unlink()
    assert match.main(argv) == 1


def test_atomic_publication_never_replaces(tmp_path):
    match.write_exclusive(tmp_path, "plan.json", {"original": True})
    with pytest.raises(FileExistsError):
        match.write_exclusive(tmp_path, "plan.json", {"original": False})
    assert json.loads((tmp_path / "plan.json").read_text()) == {"original": True}
    assert not list(tmp_path.glob(".pending-*"))


def test_result_filename_cannot_escape(tmp_path):
    with pytest.raises(ValueError):
        match.write_exclusive(tmp_path, "../escape.json", {})


def test_run_uses_local_source_and_separate_traces(tmp_path):
    args = match.parse_args(arguments(tmp_path) + ["--run"])
    traces, requests = [], []
    def analyse(request, components, trace):
        assert isinstance(components.source, match.LocalFile)
        assert not trace
        traces.append(trace)
        requests.append(request)
        trace.append({"segmentIndex": request.segmentIndex})
        components.source.timestamps = [request.startSec + i / 2
                                        for i in range(int((request.endSec - request.startSec) * 2))]
        return SimpleNamespace(stages=SimpleNamespace(model_dump=lambda: {"tracking": "complete"}),
                               model_dump=lambda: {"identity": {"state": "UNKNOWN", "candidates": []}})
    match.evaluate(args, inspect=lambda _: 601,
                   component_factory=lambda: Components(None, None, None, None), analyse=analyse)
    assert len(traces) == 2 and traces[0] is not traces[1]
    assert requests[1].startSec == 600 and requests[1].endSec == 601
    assert requests[0].target == requests[1].target
    assert all(r.sampling.fps == 2 for r in requests)
    assert (args.out / "complete.json").exists()


def test_failed_pipeline_has_no_completion(tmp_path):
    args = match.parse_args(arguments(tmp_path) + ["--run"])
    def failed(*_):
        return SimpleNamespace(stages=SimpleNamespace(model_dump=lambda: {"tracking": "failed"}),
                               model_dump=lambda: {"identity": {"candidates": []}})
    with pytest.raises(RuntimeError):
        match.evaluate(args, inspect=lambda _: 20,
                       component_factory=lambda: Components(None, None, None, None), analyse=failed)
    assert not (args.out / "complete.json").exists()


def test_metadata_inspection_is_file_only(tmp_path, monkeypatch):
    import sys
    calls = []
    class Container:
        streams = SimpleNamespace(video=[SimpleNamespace(duration=840000, time_base=0.01)])
        def __enter__(self):
            return self
        def __exit__(self, *_):
            pass
    def open_file(path, **kwargs):
        calls.append(kwargs)
        return Container()
    monkeypatch.setitem(sys.modules, "av", SimpleNamespace(open=open_file))
    assert match.inspect_duration(tmp_path / "local.mp4") == 8400
    assert calls == [{"options": {"protocol_whitelist": "file"}}]


def test_real_pipeline_resets_identity_without_interpolation():
    import numpy as np
    from app.pipeline import Box

    trackers = []
    class Source:
        def frames(self, url, headers, start, end, fps):
            for offset in range(8):
                yield start + offset / 2, np.full((100, 100, 3), (240, 130, 30), dtype=np.uint8)
    class Tracker:
        def update(self, boxes):
            return [("same-id", box) for box in boxes]
    def tracker_factory():
        tracker = Tracker()
        trackers.append(tracker)
        return tracker
    reads = iter([("8", 0.99)] * 16 + [(None, 0.0)] * 16)
    components = Components(Source(), SimpleNamespace(people=lambda _: [Box(0, 0, 90, 90, 0.99)]),
                            tracker_factory, SimpleNamespace(read=lambda _: next(reads)))
    requests = match.schedule(1200, {"jerseyNumber": "8", "kitPrimaryColor": "orange"})
    first = analyse_segment(requests[0], components, [])
    second_trace = []
    second = analyse_segment(requests[1], components, second_trace)
    assert first.identity.state == "CONFIRMED_VISIBLE"
    assert second.identity.state != "CONFIRMED_VISIBLE"
    assert second.coverage.targetVisibleSec == 0
    assert second_trace == []
    assert len(trackers) == 2 and trackers[0] is not trackers[1]


def test_helper_also_requires_authorization(tmp_path):
    args = match.parse_args(arguments(tmp_path))
    args.authorize_local_evaluation = False
    with pytest.raises(ValueError):
        match.evaluate(args, inspect=lambda _: pytest.fail("inspected without authorization"))


@pytest.mark.parametrize("failed", [False, True])
def test_non_target_candidates_are_never_persisted(tmp_path, failed):
    from test_worker import components
    args = match.parse_args(arguments(tmp_path) + ["--run"])
    args.kit_primary_color = "red"
    original = []

    def analyse(request, local, trace):
        local.source.timestamps = [i / 2 for i in range(40)]
        result = analyse_segment(request, components(number="18"), trace)
        assert result.identity.candidates[0].jerseyRead == "18"
        original.append(result)
        if failed:
            result.stages.tracking = "failed"
        return result

    kwargs = {"inspect": lambda _: 20, "component_factory": components, "analyse": analyse}
    if failed:
        with pytest.raises(RuntimeError):
            match.evaluate(args, **kwargs)
    else:
        match.evaluate(args, **kwargs)
    saved = json.loads((args.out / "segment-000.json").read_text())
    assert saved["segment"]["identity"]["candidates"] == []
    assert saved["targetTrace"] == []
    assert original[0].identity.candidates[0].jerseyRead == "18"
    assert (args.out / "complete.json").exists() is not failed


@pytest.mark.parametrize("timestamps", [
    [100.0, 100.5, 101.0],
    [0.0, 0.5, 1.0],
    [i / 2 for i in range(1200) if not 200 <= i < 300],
    [],
])
def test_partial_decode_never_claims_full_match_completion(tmp_path, timestamps):
    args = match.parse_args(arguments(tmp_path) + ["--run"])

    def partial(request, local, trace):
        local.source.timestamps = timestamps
        return SimpleNamespace(stages=SimpleNamespace(model_dump=lambda: {"tracking": "complete"}),
                               model_dump=lambda: {"identity": {"candidates": []}})

    with pytest.raises(RuntimeError):
        match.evaluate(args, inspect=lambda _: 600,
                       component_factory=lambda: Components(None, None, None, None), analyse=partial)
    assert not (args.out / "complete.json").exists()
    audit = json.loads((args.out / "segment-000.json").read_text())["decodeAudit"]
    assert audit["complete"] is False
    assert audit["missingIntervals"]
    assert audit["framesDecoded"] == len(timestamps)


def test_sampled_coverage_tolerates_frame_quantization_but_rejects_bad_pts():
    request = match.schedule(2, {"jerseyNumber": "8", "kitPrimaryColor": "orange"})[0]
    assert match.decoded_coverage([0.0, 0.533, 1.067, 1.6], request)["complete"]
    for bad in ([0.0, 0.0], [0.5, 0.0], [float("nan")], [2.0], [-0.1]):
        assert not match.decoded_coverage(bad, request)["complete"]


def test_audited_decoder_records_only_current_segment_pts(tmp_path, monkeypatch):
    def frames(self, url, headers, start, end, fps):
        yield start, "frame"
        yield start + 0.5, "frame"
    monkeypatch.setattr(match.LocalFile, "frames", frames)
    source = match.AuditedLocalFile(tmp_path / "video.mp4")
    list(source.frames("unused", None, 0, 1, 2))
    assert source.timestamps == [0, 0.5]
    list(source.frames("unused", None, 600, 601, 2))
    assert source.timestamps == [600, 600.5]
