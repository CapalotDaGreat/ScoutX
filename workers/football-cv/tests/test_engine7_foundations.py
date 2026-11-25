"""Engine 7 foundations: preparation, decoder contract, scheduler and the benchmark ladder.

These tests do not decode footage and do not change extract().
"""

from pathlib import Path

import pytest

from scoutx_tracker.colour import ColourInfo, working_space_filter
from scoutx_tracker.extract import frame_before_end, frame_timestamp
from scoutx_tracker.ladder import Proposal, review
from scoutx_tracker.preparation import (
    PREP_ENV,
    SourceDescriptor,
    index_subsample_aligned,
    plan_preparation,
    source_time_for_working_frame,
)
from scoutx_tracker.recording_assessment import assess
from scoutx_tracker.scheduler import decide

ROOT = Path(__file__).resolve().parents[1]
EXTRACT = (ROOT / "scoutx_tracker" / "extract.py").read_text(encoding="utf-8")

ORIGINAL = SourceDescriptor(
    width=1920, height=1080, fps=29.997, duration_sec=2034.892, codec="hevc",
    pix_fmt="yuv420p10le", transfer="arib-std-b67", primaries="bt2020", matrix="bt2020nc",
    color_range="tv", container="mov", camera_class="touchline",
)


def test_extract_defaults_stay_on_the_current_decoder_and_every_frame():
    assert 'os.environ.get("SCOUTX_DECODER", "cv2")' in EXTRACT
    assert 'os.environ.get("SCOUTX_KEYFRAME_EVERY", "1")' in EXTRACT
    assert 'os.environ.get("SCOUTX_SCHEDULER", "").strip() or "off"' in EXTRACT
    assert "preparation" not in EXTRACT
    assert "if use_risk:" in EXTRACT


def test_frame_clock_is_half_open_and_uses_the_source_rate():
    assert frame_timestamp(0, 10) == 0
    assert frame_timestamp(11500, 10, 0) == 1150
    assert frame_timestamp(1, 29.997) == pytest.approx(1 / 29.997)
    assert frame_before_end(11799, 10, 1180) is True
    assert frame_before_end(11800, 10, 1180) is False
    assert frame_before_end(0, 10, None) is True
    with pytest.raises(ValueError):
        frame_timestamp(-1, 10)
    bench = Path(__file__).resolve().parents[1] / "bench"
    sys_path = __import__("sys").path
    if str(bench) not in sys_path:
        sys_path.insert(0, str(bench))
    import pp_bench
    # The published non-target alignment, not a target-recall comparison.
    assert pp_bench.select_time_basis({0.0: 0.65, 0.1: 0.913}) == 0.1
    assert pp_bench.select_time_basis({0.0: 0.887, 0.1: 0.70}) == 0.0
    assert pp_bench.select_time_basis({0.0: 0.9, 0.1: 0.9}) == 0.0


def test_hlg_working_filter_is_explicit_and_is_not_the_default_extractor_path():
    info = ColourInfo(1920, 1080, "yuv420p10le", "arib-std-b67", "bt2020", "bt2020nc", "tv", 10.0, 2035.0)
    filt = working_space_filter(info)
    assert "zscale=" in filt
    assert "tin=arib-std-b67" in filt
    assert "npl=203" in filt
    assert "m=709" in filt
    sdr = working_space_filter(ColourInfo(1920, 1080, "yuv420p", "bt709", "bt709", "bt709", "tv", 30.0, 10.0))
    assert sdr.startswith("scale=in_color_matrix=bt709")
    plan = plan_preparation(ORIGINAL, "streaming_rate", 10, enabled=False)
    assert plan.filter_applied is False
    assert plan.decoder == "cv2"


def test_preparation_stays_direct_until_the_flag_is_on():
    refused = plan_preparation(ORIGINAL, "streaming_rate", 10, enabled=False, src="clip.mp4")
    assert refused.applied_mode == "direct"
    assert refused.executed is False
    assert refused.command == ()
    assert any(PREP_ENV in note for note in refused.notes)
    assert index_subsample_aligned(29.997, 10) is False
    assert index_subsample_aligned(30, 10) is True
    assert source_time_for_working_frame(10, 10) == 1.0


def test_streaming_plan_builds_a_command_and_does_not_claim_accuracy():
    plan = plan_preparation(ORIGINAL, "streaming_rate", 10, enabled=True, src="clip.mp4", end=1.0)
    assert plan.applied_mode == "streaming_rate"
    assert plan.accuracy_validated is False
    assert plan.executed is False
    assert plan.materialises_file is False
    assert plan.index_subsample_aligned is False
    assert plan.consequences["distant_players"] == "unmeasured"
    assert "fps=10" in ",".join(plan.command)
    assert "zscale=" in ",".join(plan.command)
    with pytest.raises(ValueError):
        plan_preparation(ORIGINAL, "streaming_rate", 4, enabled=True)


def test_proxy_and_hardware_plans_do_not_run_or_approve_a_codec():
    proxy = plan_preparation(ORIGINAL, "persistent_proxy", 8, enabled=True, output_path="proxy.mp4")
    assert proxy.materialises_file is True
    assert proxy.proxy_codec_approved is False
    assert proxy.executed is False
    assert proxy.command == ()
    hardware = plan_preparation(ORIGINAL, "hardware_prepared", 10, enabled=True, src="clip.mp4", hwaccel="cuda")
    assert hardware.executed is False
    assert hardware.accuracy_validated is False
    assert "-hwaccel" in hardware.command
    assert "cuda" in hardware.command


def test_scheduler_off_detects_every_frame_and_fixed_stride_is_rejected():
    off = decide(set(), 100, enabled=False)
    assert off.defer_to_current_pipeline is True
    assert off.full_frame_detect is True
    assert off.ocr is False
    cheap = decide(set(), 0, enabled=True, camera_class="touchline")
    assert cheap.full_frame_detect is False
    assert cheap.visibility_between_frames == "not_guaranteed"
    periodic = decide(set(), 20, enabled=True, camera_class="touchline")
    assert periodic.reason == "periodic_full_frame"
    crossing = decide({"similar_kit_crossing"}, 0, enabled=True)
    assert crossing.full_frame_detect is True
    assert crossing.appearance is True
    assert crossing.ocr is False
    jersey = decide({"contradictory_jersey"}, 0, enabled=True)
    assert jersey.ocr is True and jersey.high_res_recovery is True
    broadcast = decide(set(), 10, enabled=True, camera_class="broadcast")
    panoramic = decide(set(), 10, enabled=True, camera_class="panoramic")
    assert broadcast.full_frame_detect is True
    assert panoramic.full_frame_detect is False
    with pytest.raises(ValueError):
        decide(set(), 0, enabled=True, policy="fixed_stride")


def test_ladder_refuses_stale_cache_fixed_stride_and_the_window_candidate():
    base = dict(hypothesis="share one decoded stream", expected_benefit="fewer decoded frames",
                inputs="synthetic timestamps", expected_runtime_sec=2, resource="local cpu",
                acceptance="unit equality", stop="stop on a contract failure", level=0)
    assert review(Proposal(**base)).admitted is True
    stale = review(Proposal(**{**base, "level": 3, "changes_extraction": True, "uses_cached_extraction": True}))
    assert stale.admitted is False
    stride = review(Proposal(**{**base, "hypothesis": "try fixed stride of 2"}))
    assert stride.admitted is False
    candidate = review(Proposal(**{**base, "name": "promote 0.706"}))
    assert candidate.admitted is False
    long = review(Proposal(**{**base, "level": 4, "expected_runtime_sec": 8000, "owner_approval": True}))
    assert long.admitted is False
    held = review(Proposal(**{**base, "level": 5, "changes_extraction": True, "owner_approval": True}))
    assert held.admitted is False


def test_recording_assessment_withholds_metres_and_off_camera_positions():
    report = assess(ORIGINAL)
    assert report.highlights == "possible"
    assert report.identity == "not_measured"
    assert report.physical_metres == "unavailable"
    assert report.off_camera_positions == "not_invented"
    calibrated = assess(ORIGINAL, calibration_points=4)
    assert calibrated.physical_metres == "not_validated"
    tiny = assess(SourceDescriptor(640, 360, 5, 20, codec="h264", transfer="bt709", camera_class="unspecified"))
    assert tiny.highlights == "limited"
