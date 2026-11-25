"""The experimental loop has to change the workload, not only describe it."""

import shutil
import subprocess
from pathlib import Path

import cv2
import numpy as np
import pytest

from scoutx_tracker.experimental_run import (
    BackendUnavailable, ReusableSession, RunConfig, RunState, YoloxSession, identity_state, match_boxes,
    run_experimental,
)
from scoutx_tracker.ladder import Proposal
from scoutx_tracker.preparation import (
    SourceDescriptor,
    StreamError,
    integer_stride_indices,
    open_working_stream,
    presentation_indices,
)

ROOT = Path(__file__).resolve().parents[1]
EXTRACT = (ROOT / "scoutx_tracker" / "extract.py").read_text(encoding="utf-8")


def source(fps: float, count: int, width: int = 160, height: int = 96) -> SourceDescriptor:
    return SourceDescriptor(
        width, height, fps, count / fps, codec="h264", pix_fmt="yuv420p", transfer="bt709",
        primaries="bt709", matrix="bt709", color_range="tv", container="mp4", camera_class="touchline",
    )


def clip(count: int, flip: int | None = None) -> list[np.ndarray]:
    base = np.random.default_rng(1).integers(0, 30, (96, 160, 3), dtype=np.uint8)
    frames = []
    for index in range(count):
        frame = base.copy()
        cv2.putText(frame, "20", (4, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)
        origin = 90 + (index % 4)
        frame[12:68, origin:origin + 24] = (30, 50, 210)
        if flip == index:
            frame[:] = 255
        frames.append(frame)
    return frames


def one_box(_frame: np.ndarray):
    return np.array([[90, 12, 118, 68]], np.float32), np.array([0.9], np.float32)


def test_extract_does_not_call_the_experimental_loop():
    assert "experimental_run" not in EXTRACT
    assert 'os.environ.get("SCOUTX_DECODER", "cv2")' in EXTRACT


def test_presentation_time_drifts_from_an_integer_stride_at_the_original_rate():
    mapped = [item[2] for item in presentation_indices(29.997, 6000, 10)]
    stride = integer_stride_indices(29.997, 6000, 10)
    assert mapped != stride[:len(mapped)]


def test_streaming_preparation_reduces_the_frames_the_detector_sees():
    frames = clip(30)
    direct = run_experimental(source(30, 30), RunConfig(), frames=frames, detector=one_box)
    streamed = run_experimental(
        source(30, 30), RunConfig(enabled=True, mode="streaming_rate", analysis_fps=10),
        frames=frames, detector=one_box,
    )
    assert direct["analysisComplete"] is True
    assert direct["detectorInvocations"] == 30
    assert direct["detectorInvocationsAvoided"] == 0
    assert streamed["appliedMode"] == "streaming_rate"
    assert streamed["workingFrames"] == 10
    assert streamed["detectorInvocations"] == 10
    assert streamed["decodePasses"] == 1
    assert streamed["discoverySamples"] < streamed["extractionSamples"]
    assert streamed["identityPublished"] is False
    assert streamed["physicalMetres"] == "unavailable"


def test_scheduler_skips_inference_until_a_real_signal_or_the_periodic_scan():
    frames = clip(24)
    state = RunState()
    manifest = run_experimental(
        source(10, 24), RunConfig(scheduler_enabled=True, camera_class="touchline"),
        frames=frames, detector=one_box, state=state,
    )
    assert manifest["detectorInvocations"] == 2
    assert manifest["detectorInvocationsAvoided"] == 22
    assert manifest["propagatedFrames"] == 22
    assert state.detector_calls == 2
    changed = clip(12, flip=4)
    escalated = run_experimental(
        source(10, 12), RunConfig(scheduler_enabled=True), frames=changed, detector=one_box,
    )
    assert 2 <= escalated["detectorInvocations"] < 12
    assert any(row["reason"] == "scene_change" for row in escalated["escalations"])

    def overlapping(_frame):
        return np.array([[10, 10, 40, 80], [12, 12, 42, 82]], np.float32), np.array([0.9, 0.9], np.float32)

    crowded = run_experimental(
        source(10, 6), RunConfig(scheduler_enabled=True), frames=clip(6), detector=overlapping,
    )
    assert crowded["detectorInvocations"] == 6
    assert crowded["detectorInvocationsAvoided"] == 0
    assert all("similar_kit_crossing" in row["signals"] for row in crowded["decisions"][1:])


def test_unacquired_target_stays_in_discovery_and_a_matched_target_can_propagate():
    def overlapping(_frame):
        return np.array([[10, 10, 40, 80], [12, 12, 42, 82]], np.float32), np.array([0.9, 0.9], np.float32)

    away = run_experimental(
        source(10, 6),
        RunConfig(scheduler_enabled=True, policy="target", target_anchor=(120, 10, 150, 70)),
        frames=clip(6), detector=overlapping,
    )
    assert away["detectorInvocations"] == 6
    assert away["detectorInvocationsAvoided"] == 0
    assert away["continuityClaims"] == 0
    assert {row["state"] for row in away["decisions"]} == {"discovery"}
    assert all(row["continuityClaim"] is False and row["publishedPosition"] is False for row in away["decisions"])

    held = run_experimental(
        source(10, 6),
        RunConfig(scheduler_enabled=True, policy="target", target_anchor=(10, 10, 40, 80)),
        frames=clip(6), detector=overlapping,
    )
    assert held["detectorInvocations"] == 6
    assert held["decisions"][1]["state"] == "at_risk"
    assert "target_overlap" in held["decisions"][1]["signals"]

    lone = np.array([[10, 10, 40, 80]], np.float32), np.array([0.9], np.float32)
    tracked = run_experimental(
        source(10, 6),
        RunConfig(scheduler_enabled=True, policy="target", target_anchor=(10, 10, 40, 80)),
        frames=clip(6), detector=lambda _frame: lone,
    )
    assert tracked["detectorInvocations"] == 1
    assert tracked["propagatedFrames"] == 5
    assert tracked["decisions"][0]["state"] == "discovery"
    assert tracked["decisions"][1]["state"] == "tracking"
    assert tracked["decisions"][1]["reason"] == "tracking_propagated"
    assert tracked["continuityClaims"] == 0


class SizedDetector:
    def __init__(self):
        self.sizes = []
        self.recoveries = 0

    def __call__(self, _frame):
        raise AssertionError("target_dynamic must call detect_at")

    def detect_at(self, _frame, imgsz):
        self.sizes.append(imgsz)
        return np.array([[10, 10, 40, 80]], np.float32), np.array([0.9], np.float32)

    def recover(self, _frame, _box, **_kwargs):
        self.recoveries += 1
        return np.array([[10, 10, 40, 80]], np.float32), np.array([0.9], np.float32)


def test_dynamic_resolution_calls_the_detector_and_recovery_runs_a_second_pass():
    sized = SizedDetector()
    dynamic = run_experimental(
        source(10, 3),
        RunConfig(scheduler_enabled=True, policy="target_dynamic", target_anchor=(10, 10, 40, 80)),
        frames=clip(3), detector=sized,
    )
    assert sized.sizes == [1280, 640, 640]
    assert [row["imgsz"] for row in dynamic["decisions"]] == [1280, 640, 640]
    assert dynamic["decisions"][0]["state"] == "discovery"
    assert dynamic["decisions"][1]["state"] == "tracking"

    with pytest.raises(RuntimeError, match="detect_at"):
        run_experimental(
            source(10, 1),
            RunConfig(scheduler_enabled=True, policy="target_dynamic", target_anchor=(120, 10, 150, 70)),
            frames=clip(1),
            detector=lambda _frame: (np.zeros((0, 4), np.float32), np.zeros(0, np.float32)),
        )

    class Crossing(SizedDetector):
        def __call__(self, _frame):
            return np.array([[10, 10, 40, 80], [12, 12, 42, 82]], np.float32), np.array([0.9, 0.9], np.float32)

    crossing = Crossing()
    recovery = run_experimental(
        source(10, 2),
        RunConfig(scheduler_enabled=True, policy="target_recovery", target_anchor=(10, 10, 40, 80)),
        frames=clip(2), detector=crossing,
    )
    assert recovery["decisions"][1]["state"] == "at_risk"
    assert recovery["decisions"][1]["recoveryExecuted"] is True
    assert recovery["recoveryPasses"] == 1
    assert crossing.recoveries == 1


def test_lost_and_reacquisition_detect_instead_of_keeping_the_cheap_state():
    box = np.array([[10, 10, 40, 80]], np.float32)
    empty = np.zeros((0, 4), np.float32)
    other = np.array([[90, 10, 120, 80]], np.float32)
    assert identity_state((10, 10, 40, 80), box, True, set()) == "tracking"
    assert identity_state((10, 10, 40, 80), box, True, {"target_overlap"}) == "at_risk"
    assert identity_state((10, 10, 40, 80), empty, True, set()) == "lost"
    assert identity_state((10, 10, 40, 80), other, True, set()) == "reacquisition"

    class Sequence:
        def __init__(self):
            self.n = 0
            self.sizes = []

        def detect_at(self, _frame, imgsz):
            self.n += 1
            self.sizes.append(imgsz)
            if self.n == 1:
                return box, np.array([0.9], np.float32)
            if self.n == 2:
                return empty, np.zeros(0, np.float32)
            return other, np.array([0.9], np.float32)

    detector = Sequence()
    result = run_experimental(
        source(10, 4),
        RunConfig(scheduler_enabled=True, policy="target_dynamic", target_anchor=(10, 10, 40, 80)),
        frames=clip(4), detector=detector,
    )
    assert [row["state"] for row in result["decisions"]] == ["discovery", "tracking", "lost", "reacquisition"]
    assert result["detectorInvocations"] == 4
    assert result["propagatedFrames"] == 0
    assert result["continuityClaims"] == 0
    assert detector.sizes == [1280, 640, 1280, 1280]
    assert all(row["publishedPosition"] is False for row in result["decisions"])


def test_recovery_records_keep_their_crop_after_the_next_recovery():
    session = YoloxSession.__new__(YoloxSession)
    session.recovery_log = []
    session.last = {}
    session.provenance = {"backend": "stub", "weightsSha256": "abc", "imgsz": 1280}
    session._impl = type("Impl", (), {"imgsz": 1280})()

    def detect_at(_frame, imgsz):
        session.last = {"imgsz": imgsz, "inputShape": [1, 3, 384, 640] if imgsz == 640 else [1, 3, 736, 1280]}
        return np.zeros((0, 4), np.float32), np.zeros(0, np.float32)

    session.detect_at = detect_at
    frame = np.zeros((180, 320, 3), np.uint8)
    session.recover(frame, np.array([40, 40, 80, 120]), frame_id="f0", presentation_sec=1150.0, reason="at_risk")
    session.recover(frame, np.array([200, 30, 260, 150]), frame_id="f1", presentation_sec=1150.4, reason="at_risk")
    session.last = {}
    assert len(session.recovery_log) == 2
    assert session.recovery_log[0]["frameId"] == "f0"
    assert session.recovery_log[0]["presentationSec"] == 1150.0
    assert session.recovery_log[0]["crop"] != session.recovery_log[1]["crop"]
    assert session.recovery_log[0]["candidate"] == [40.0, 40.0, 80.0, 120.0]
    assert session.recovery_log[0]["frameWidth"] == 320
    assert session.recovery_log[0]["frameHeight"] == 180
    assert session.recovery_log[1]["frameId"] == "f1"
    assert session.recovery_log[0]["inputShape"] == [1, 3, 736, 1280]
    session.release_job()
    assert session.recovery_log == []
    assert session.last == {}


def test_reusable_session_does_not_keep_the_previous_job():
    model = object()
    slot = ReusableSession(model)
    slot.open_job("first")
    slot.observe("frame-a")
    first = slot.close_job()
    slot.open_job("second")
    slot.observe("frame-b")
    assert slot._frames == ["frame-b"]
    second = slot.close_job()
    assert first == {"job": "first", "frames": ["frame-a"]}
    assert second == {"job": "second", "frames": ["frame-b"]}
    assert slot._frames == []
    assert slot.model is model
    assert slot.loads == 1


def test_ocr_gate_skips_illegible_and_duplicate_crops_and_keeps_a_contradiction():
    frames = clip(8)
    calls = {"n": 0}

    def reader(_crop):
        calls["n"] += 1
        return "20", 0.99

    gated = run_experimental(
        source(10, 8), RunConfig(ocr_policy="gated"), frames=frames, detector=one_box, reader=reader,
    )
    assert gated["ocrInvocations"] == 1
    assert gated["ocrCacheHits"] == 7
    assert calls["n"] == 1
    assert gated["ocrEvidence"][0]["fullNumber"] is True
    assert gated["ocrEvidence"][0]["identityClaim"] is False

    every_calls = {"n": 0}

    def every(_crop):
        every_calls["n"] += 1
        return "20", 0.99

    plain = run_experimental(
        source(10, 8), RunConfig(ocr_policy="every"), frames=frames, detector=one_box, reader=every,
    )
    assert plain["ocrInvocations"] == 8
    flat = [np.full((96, 160, 3), 40, np.uint8) for _ in range(4)]
    skipped = run_experimental(
        source(10, 4), RunConfig(ocr_policy="gated"), frames=flat, detector=one_box,
        reader=lambda _crop: (_ for _ in ()).throw(AssertionError("illegible crop was read")),
    )
    assert skipped["ocrInvocations"] == 0
    assert skipped["ocrIllegibleSkips"] == 4

    def conflicting(crop):
        return ("99", 0.99) if int(crop[0, 0, 0]) == 255 else ("20", 0.99)

    mixed = clip(4)
    mixed[2][0, 0] = (255, 255, 255)
    conflict = run_experimental(
        source(10, 4), RunConfig(ocr_policy="every"), frames=mixed, detector=one_box, reader=conflicting,
    )
    assert [row["text"] for row in conflict["contradictoryReads"]] == ["99"]
    assert {row["text"] for row in conflict["ocrEvidence"]} == {"20", "99"}

    lone = run_experimental(
        source(10, 2), RunConfig(ocr_policy="every"), frames=clip(2), detector=one_box,
        reader=lambda _crop: ("2", 1.0),
    )
    assert lone["loneDigits"]
    assert all(row["fullNumber"] is False and row["identityClaim"] is False for row in lone["loneDigits"])


def test_budget_cancellation_and_ladder_refusal_stop_the_work():
    frames = clip(20)
    budget = run_experimental(source(10, 20), RunConfig(max_frames=4), frames=frames, detector=one_box)
    assert budget["stopped"] == "budget"
    assert budget["workingFrames"] == 4
    assert budget["analysisComplete"] is False
    refused_calls = {"n": 0}

    def boom(_frame):
        refused_calls["n"] += 1
        return one_box(_frame)

    refused = run_experimental(
        source(10, 20),
        RunConfig(proposal=Proposal(
            "rerun the full recording", "none", "proxy", 3, "local", "gates", "stop", level=4,
        )),
        frames=frames, detector=boom,
    )
    assert refused["stopped"] == "refused"
    assert refused["executed"] is False
    assert refused_calls["n"] == 0
    cancelled = run_experimental(
        source(10, 20), RunConfig(), frames=frames, detector=one_box, state=RunState(cancel=True),
    )
    assert cancelled["stopped"] == "cancelled"
    assert cancelled["detectorInvocations"] == 0
    with pytest.raises(StreamError):
        open_working_stream(source(10, 4), enabled=True, mode="persistent_proxy", analysis_fps=10, frames=clip(4))


def test_real_backends_fail_closed_without_substituting_another_runtime(monkeypatch: pytest.MonkeyPatch):
    with pytest.raises(BackendUnavailable, match="onnxruntime"):
        YoloxSession("onnx")
    with pytest.raises(BackendUnavailable, match="CUDA is not available"):
        YoloxSession("torch", provider="CUDAExecutionProvider")
    with pytest.raises(BackendUnavailable, match="FP32"):
        YoloxSession("torch", precision="fp16")
    monkeypatch.setenv("SCOUTX_WEIGHTS_DIR", "missing-weights")
    with pytest.raises(BackendUnavailable, match="weights missing"):
        YoloxSession("torch")


def test_box_agreement_leaves_unmatched_players_unmatched():
    reference = np.array([[0, 0, 10, 40], [30, 0, 40, 10]], np.float32)
    candidate = np.array([[1, 1, 11, 41]], np.float32)
    report = match_boxes(reference, candidate)
    assert report["matched"] == 1
    assert report["referenceOnly"] == 1
    assert report["candidateOnly"] == 0
    assert report["pairs"][0]["iou"] > 0.5


def test_preprocess_timing_is_a_letterbox_measurement():
    manifest = run_experimental(
        source(10, 1), RunConfig(profile_preprocess=True, max_frames=1), frames=clip(1), detector=one_box,
    )
    assert manifest["preprocessKind"] == "measured_letterbox_only"
    assert manifest["preprocessSec"] > 0


def test_ffmpeg_stream_delivers_fewer_frames_than_source_rate_opencv(tmp_path: Path):
    if shutil.which("ffmpeg") is None:
        pytest.skip("ffmpeg is not installed")
    path = tmp_path / "experimental-src.mp4"
    try:
        built = subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30:duration=0.4",
             "-pix_fmt", "yuv420p", "-an", str(path)],
            capture_output=True, check=False,
        )
        if built.returncode != 0:
            pytest.skip("ffmpeg could not build the synthetic recording")
        described = SourceDescriptor(
            160, 90, 30, 0.4, codec="h264", pix_fmt="yuv420p", transfer="bt709", primaries="bt709",
            matrix="bt709", color_range="tv", container="mp4", camera_class="touchline",
        )
        with open_working_stream(described, enabled=False, path=str(path)) as direct:
            direct_frames = list(direct)
        with open_working_stream(
            described, enabled=True, mode="streaming_rate", analysis_fps=10, path=str(path),
        ) as streamed:
            streamed_frames = list(streamed)
        assert streamed.executed is True
        assert len(streamed_frames) < len(direct_frames)
        assert len(streamed_frames) == 4
        assert [round(item[1], 5) for item in streamed_frames] == [0.0, 0.1, 0.2, 0.3]
        assert streamed_frames[0][2].shape == (90, 160, 3)
    finally:
        path.unlink(missing_ok=True)
