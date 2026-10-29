"""5.2 pre-benchmark hardening: accuracy gates, run comparability, cost model, checkpoints and the
benchmark's failure handling. No GPU needed."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

BENCH = Path(__file__).resolve().parents[1] / "bench"
sys.path.insert(0, str(BENCH))
import pp_bench  # noqa: E402

from scoutx_tracker.checkpoint import ConfigMismatch, DiskSpaceError, Stage1Store, fingerprint, stage1_settings  # noqa: E402


# ------------------------------------------------------------------ accuracy and gates

def _gt():
    """4 labelled frames at 10 fps: target at x=100..150, team-mate at x=500..550, and on frame 3 a
    team-mate standing right next to the target (x=130..180) - an overlapping annotation."""
    frames, times = {}, {}
    for i in range(4):
        L = [{"box": [100, 100, 150, 250], "label": "T"}, {"box": [500, 100, 550, 250], "label": "N"}]
        if i == 3:
            L.append({"box": [125, 100, 175, 250], "label": "N"})
        frames[str(i)], times[str(i)] = L, i / 10
    return {"fps": 10.0, "frames": frames, "times": times}


def test_accuracy_separates_wrong_identity_from_overlap_and_rescales():
    g = _gt()
    right = [[i / 10, "LIKELY_VISIBLE", [200, 200, 300, 500]] for i in range(3)]       # 3840x2160 run: 2x coords
    a = pp_bench.accuracy(right, g, (3840, 2160))
    assert a["claimedCorrectSec"] == 0.3 and a["wrongIdentitySec"] == 0 and a["overlapAmbiguousSec"] == 0
    claims = [[0.0, "CONFIRMED_VISIBLE", [1000, 200, 1100, 500]],     # on the far team-mate: WRONG identity
              [0.3, "LIKELY_VISIBLE", [251, 200, 351, 500]],          # between target and adjacent mate: ambiguous
              [0.1, "AMBIGUOUS", [200, 200, 300, 500]]]               # not a claim
    b = pp_bench.accuracy(claims, g, (3840, 2160))
    assert b["wrongIdentitySec"] == 0.1 and b["confirmedWrongIdentitySec"] == 0.1 and b["wrongIdentityTimes"] == [0.0]
    assert b["overlapAmbiguousSec"] == 0.1 and b["falseAttributionSec"] == 0.2 and b["claimedCorrectSec"] == 0.0


def test_gate_absolute_and_relative_rules():
    gate = json.loads((BENCH / "gates" / "balanced_5.2.json").read_text())
    ok = {"wrongIdentitySec": 0.0, "confirmedWrongIdentitySec": 0.0, "overlapAmbiguousSec": 0.2, "IDF1": 0.90,
          "claimedRecall": 0.80, "confirmedCorrectSec": 10.0}
    assert pp_bench.evaluate_gate(ok, gate)["passed"]
    bad = {**ok, "wrongIdentitySec": 0.1}
    r = pp_bench.evaluate_gate(bad, gate)
    assert not r["passed"] and any("wrongIdentitySec" in f for f in r["failures"])
    base = {**ok, "IDF1": 0.92}
    r = pp_bench.evaluate_gate(ok, gate, base)                 # IDF1 dropped 0.02 > 0.01 allowed
    assert not r["passed"] and any("IDF1 dropped" in f for f in r["failures"]) and r["baselineUsed"]
    assert pp_bench.evaluate_gate(ok, gate, {**ok, "IDF1": 0.905})["passed"]
    assert not pp_bench.evaluate_gate({k: v for k, v in ok.items() if k != "wrongIdentitySec"}, gate)["passed"]  # missing = fail


def _rec(**over):
    r = {"input": {"videoStreamSha256": "abc"}, "target": {"number": "20", "kit": "orange", "kit2": "white"},
         "configuration": {"chunkSec": 300, "mode": "balanced",
                           "stage1Settings": {"env": {"SCOUTX_DETECTOR": "yolox_s", "SCOUTX_KEYFRAME_EVERY": None},
                                              "imgsz": 1280, "stride": 1, "discoveryImgsz": 416, "device": "cpu"}},
         "environment": {"engineVersion": "5.2.0"}, "models": {"files": {"m": {"sha256": "1"}}},
         "groundTruth": {"sha256": "g"}}
    for path, v in over.items():
        d = r
        keys = path.split(".")
        for k in keys[:-1]:
            d = d[k]
        d[keys[-1]] = v
    return r


def test_runs_are_comparable_only_on_the_same_task():
    assert pp_bench.comparable(_rec(), _rec(**{"configuration.stage1Settings.device": "cuda"})) == []   # device may differ
    assert "input.videoStreamSha256 differs" in pp_bench.comparable(_rec(), _rec(**{"input.videoStreamSha256": "other"}))
    assert "models.files differs" in pp_bench.comparable(_rec(), _rec(**{"models.files": {"m": {"sha256": "2"}}}))
    assert "groundTruth.sha256 differs" in pp_bench.comparable(_rec(), _rec(**{"groundTruth.sha256": "h"}))
    assert any("KEYFRAME" in w for w in pp_bench.comparable(
        _rec(), _rec(**{"configuration.stage1Settings.env": {"SCOUTX_DETECTOR": "yolox_s", "SCOUTX_KEYFRAME_EVERY": "2"}})))
    assert "groundTruth.sha256 missing" in pp_bench.comparable(_rec(), {k: v for k, v in _rec().items() if k != "groundTruth"})


def test_claims_agreement():
    a = [[0.0, "LIKELY_VISIBLE", [0, 0, 10, 10]], [0.1, "AMBIGUOUS", [0, 0, 10, 10]], [0.2, "LIKELY_VISIBLE", [0, 0, 10, 10]]]
    b = [[0.0, "LIKELY_VISIBLE", [0, 0, 10, 10]], [0.1, "LIKELY_VISIBLE", [0, 0, 10, 10]], [0.2, "LIKELY_VISIBLE", [50, 50, 60, 60]]]
    r = pp_bench.claims_agreement(a, b)
    assert r["framesCompared"] == 3 and r["stateAgreement"] == round(2 / 3, 4)
    assert r["boxAgreementWhenBothClaim"] == 0.5 and r["claimedOnlyInSecond"] == 1


# ------------------------------------------------------------------ cost

PRICES = {"vmUsdPerHour": 1.2, "storageUsdPerGbMonth": 0.025, "egressUsdPerGb": None, "source": "test"}


def test_cost_is_labelled_estimate_with_separate_components():
    c = pp_bench.cost_breakdown(PRICES, 1800.0, vm={"uptimeSec": 3600, "imageBuildSec": 600, "driverWaitSec": 120},
                                storage={"gb": 1.4, "days": 1}, transfer={"gbEgress": 0.0}, video_sec=2035.0)
    assert c["status"] == "estimate" and "not an invoice" in c["label"]
    assert c["computeUsd"] == pytest.approx(0.6, abs=1e-4) and c["vm"]["uptimeUsd"] == pytest.approx(1.2, abs=1e-4)
    assert c["vm"]["overheadUsd"] == pytest.approx(720 * 1.2 / 3600, abs=1e-4)
    assert c["storage"]["usd"] == pytest.approx(1.4 / 30 * 0.025, abs=1e-4) and c["transfer"]["usd"] == 0.0
    r = c["recurringPerMatchEstimate"]
    assert r["90min"]["computeSec"] == pytest.approx(1800 / 2035 * 5400, abs=0.1)
    assert pp_bench.cost_breakdown(None, 10.0)["status"] == "not_calculated"
    with pytest.raises(ValueError):
        pp_bench.cost_breakdown({"vmUsdPerHour": -1}, 10.0)


def test_vm_overheads_from_timestamps():
    import full_match_benchmark as fmb

    ts = {"vmBooted": "2026-10-29T10:00:00Z", "gpuReady": "2026-10-29T10:02:00Z", "imageBuilt": "2026-10-29T10:12:00Z",
          "videoDownloaded": "2026-10-29T10:13:00Z", "end": "2026-10-29T11:00:00Z"}
    assert fmb.vm_overheads(ts) == {"uptimeSec": 3600.0, "driverWaitSec": 120.0, "imageBuildSec": 600.0, "videoDownloadSec": 60.0}
    assert fmb.chunk_bounds(650.0, 300) == [(0, 0.0, 300.0), (1, 300.0, 600.0), (2, 600.0, 650.0)]
    assert fmb.chunk_bounds(600.0, 300) == [(0, 0.0, 300.0), (1, 300.0, 600.0)]


# ------------------------------------------------------------------ checkpoints

def _fake_extract(calls, fail_first=0, frames=3):
    def fn(out_dir):
        calls.append(out_dir)
        d = Path(out_dir)
        (d / "crops").mkdir(parents=True, exist_ok=True)
        if len(calls) <= fail_first:
            (d / "detections.npz").write_bytes(b"partial")
            raise OSError("decoder died")
        np.savez_compressed(d / "detections.npz", dets=np.zeros((frames, 7)))
        (d / "crops" / "000001_0.jpg").write_bytes(b"x")
        meta = {"frames": frames, "fps": 10.0}
        (d / "meta.json").write_text(json.dumps(meta))
        return meta
    return fn


def test_checkpoint_resume_skips_valid_chunk_and_redoes_corrupt(tmp_path):
    s = Stage1Store(tmp_path, "vid", {"a": 1}, min_free_bytes=0)
    calls = []
    r = s.chunk(0, 0.0, 30.0, _fake_extract(calls))
    assert r.status == "extracted" and len(calls) == 1 and (tmp_path / "c_00000" / "checkpoint.json").exists()
    assert not list(tmp_path.glob("*.tmp-*"))
    r = Stage1Store(tmp_path, "vid", {"a": 1}, min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls))
    assert r.status == "resumed" and len(calls) == 1                     # reused, not re-extracted
    (tmp_path / "c_00000" / "detections.npz").write_bytes(b"damaged")   # same size? no - corrupt either way
    r = Stage1Store(tmp_path, "vid", {"a": 1}, min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls))
    assert r.status == "extracted" and r.replaced.startswith("corrupt") and len(calls) == 2
    assert len(list(tmp_path.glob("c_00000.stale-*"))) == 1
    assert Stage1Store(tmp_path, "vid", {"a": 1}).cleanup() and not list(tmp_path.glob("*.stale-*"))


def test_checkpoint_never_mixes_configurations(tmp_path):
    calls = []
    Stage1Store(tmp_path, "vid", {"keyEvery": 1}, min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls))
    with pytest.raises(ConfigMismatch, match="settingsFingerprint"):
        Stage1Store(tmp_path, "vid", {"keyEvery": 2}, min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls))
    with pytest.raises(ConfigMismatch, match="videoSha256"):
        Stage1Store(tmp_path, "other-video", {"keyEvery": 1}, min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls))
    with pytest.raises(ConfigMismatch, match="endSec"):
        Stage1Store(tmp_path, "vid", {"keyEvery": 1}, min_free_bytes=0).chunk(0, 0.0, 60.0, _fake_extract(calls))
    assert len(calls) == 1
    r = Stage1Store(tmp_path, "vid", {"keyEvery": 2}, policy="replace", min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls))
    assert r.status == "extracted" and r.replaced.startswith("mismatch")
    assert json.loads((tmp_path / "c_00000" / "checkpoint.json").read_text())["settings"] == {"keyEvery": 2}


def test_checkpoint_retries_and_interrupted_chunks(tmp_path):
    calls = []
    r = Stage1Store(tmp_path, "vid", {}, min_free_bytes=0).chunk(0, 0.0, 30.0, _fake_extract(calls, fail_first=1), retries=1)
    assert r.status == "extracted" and r.attempts == 2 and not list(tmp_path.glob("*.tmp-*"))
    calls2 = []
    with pytest.raises(RuntimeError, match="failed after 2 attempts"):
        Stage1Store(tmp_path, "vid", {}, min_free_bytes=0).chunk(1, 30.0, 60.0, _fake_extract(calls2, fail_first=5), retries=1)
    assert not (tmp_path / "c_00001").exists() and not list(tmp_path.glob("*.tmp-*"))   # no half chunk left behind
    (tmp_path / "c_00002").mkdir()                                                    # a crash after mkdir, no checkpoint
    r = Stage1Store(tmp_path, "vid", {}, min_free_bytes=0).chunk(2, 60.0, 90.0, _fake_extract([]))
    assert r.replaced.startswith("corrupt: no checkpoint")


def test_checkpoint_disk_space_check(tmp_path):
    s = Stage1Store(tmp_path, "vid", {}, min_free_bytes=1 << 60)
    with pytest.raises(DiskSpaceError, match="GiB free"):
        s.chunk(0, 0.0, 30.0, _fake_extract([]))
    assert not (tmp_path / "c_00000").exists()


def test_stage1_settings_capture_affecting_env_only():
    a = stage1_settings({"SCOUTX_KEYFRAME_EVERY": "1", "SCOUTX_MODE": "balanced", "HOME": "/x"})
    b = stage1_settings({"SCOUTX_KEYFRAME_EVERY": "2"})
    assert fingerprint(a) != fingerprint(b) and "SCOUTX_MODE" not in a["env"] and "HOME" not in a["env"]
    assert fingerprint(a) == fingerprint(stage1_settings({"SCOUTX_KEYFRAME_EVERY": "1"}))


# ------------------------------------------------------------------ benchmark failure handling (end to end, CPU)

@pytest.fixture(scope="module")
def tiny_video(tmp_path_factory):
    if not shutil.which("ffmpeg"):
        pytest.skip("ffmpeg not installed")
    p = tmp_path_factory.mktemp("v") / "tiny.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=2",
                    "-pix_fmt", "yuv420p", str(p)], check=True)
    return p


def test_benchmark_refuses_unverified_models(tmp_path, tiny_video, monkeypatch):
    import full_match_benchmark as fmb

    monkeypatch.setenv("SCOUTX_WEIGHTS_DIR", str(tmp_path / "no-weights"))
    out = tmp_path / "r.json"
    rc = fmb.main(["--video", str(tiny_video), "--number", "20", "--kit", "orange", "--out", str(out), "--require-models"])
    rec = json.loads(out.read_text())
    assert rc == fmb.EXIT_VERIFY and rec["status"] == "refused" and rec["error"]["type"] == "ModelVerification"
    assert rec["input"]["frames"] == 20 and rec["input"]["fps"] == 10.0 and len(rec["input"]["sha256"]) == 64
    assert len(rec["input"]["videoStreamSha256"]) == 64


def test_reference_identity_is_the_video_stream_not_the_container(tmp_path, tiny_video):
    from scoutx_tracker.media_info import describe, match_reference

    remux = tmp_path / "remux.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-i", str(tiny_video), "-c", "copy", "-metadata", "title=other",
                    "-movflags", "+faststart", str(remux)], check=True)
    a, b = describe(tiny_video), describe(remux)
    assert a["sha256"] != b["sha256"] and a["videoStreamSha256"] == b["videoStreamSha256"]
    m = match_reference(b, {"name": "tiny", **{k: a[k] for k in ("videoStreamSha256", "sha256", "frames", "fps")}})
    assert m["isReference"] and not m["sameFileBytes"]
    assert not match_reference(b, {"name": "x", "videoStreamSha256": "0" * 64})["isReference"]


def test_benchmark_refuses_a_baseline_from_another_recording(tmp_path, tiny_video):
    import full_match_benchmark as fmb

    base = tmp_path / "base.json"
    base.write_text(json.dumps(_rec()))
    out = tmp_path / "r.json"
    rc = fmb.main(["--video", str(tiny_video), "--number", "20", "--kit", "orange", "--kit2", "white", "--out", str(out),
                   "--baseline", str(base)])
    rec = json.loads(out.read_text())
    assert rc == fmb.EXIT_MISMATCH and rec["error"]["type"] == "NotComparable" and "input.videoStreamSha256 differs" in rec["error"]["message"]


def test_benchmark_rejects_unvalidated_mode(tmp_path, tiny_video, monkeypatch):
    import full_match_benchmark as fmb

    monkeypatch.setenv("SCOUTX_MODE", "fast")
    monkeypatch.delenv("SCOUTX_ALLOW_UNVALIDATED_MODE", raising=False)
    with pytest.raises(PermissionError):
        fmb.main(["--video", str(tiny_video), "--number", "20", "--kit", "orange", "--out", str(tmp_path / "r.json")])


# ------------------------------------------------------------------ offline comparison (5.3)

def _run_rec(device, status="complete", acc=None, wall=100.0, complete=True, chunks=None):
    r = _rec(**{"configuration.stage1Settings.device": device})
    r.update(status=status, accuracy=acc, timing={"measuredTotalWallSec": wall, "timingComplete": complete},
             stages={"extraction": {"chunks": chunks or []}})
    return r


def test_compare_runs_gate_speedup_and_incomplete_reference():
    import compare_runs

    gate = json.loads((BENCH / "gates" / "balanced_5.2.json").read_text())
    acc = {"wrongIdentitySec": 0.0, "confirmedWrongIdentitySec": 0.0, "overlapAmbiguousSec": 0.1, "IDF1": 0.90,
           "claimedRecall": 0.8, "confirmedCorrectSec": 10.0}
    ch = [{"index": 0, "startSec": 0, "endSec": 300, "status": "extracted", "wallSec": 300.0}]
    cpu = _run_rec("cpu", acc=acc, wall=4000.0, chunks=ch)
    gpu = _run_rec("cuda", acc=acc, wall=400.0, chunks=[{**ch[0], "wallSec": 30.0}])
    claims = [[0.0, "LIKELY_VISIBLE", [0, 0, 10, 10]]]
    res, rc = compare_runs.compare(cpu, gpu, claims, claims, gate)
    assert rc == 0 and res["result"] == "PASSED" and res["speedup"] == 10.0 and res["chunkSpeed"][0]["speedup"] == 10.0
    worse = _run_rec("cuda", acc={**acc, "IDF1": 0.85}, wall=400.0)
    res, rc = compare_runs.compare(cpu, worse, claims, claims, gate)
    assert rc == 3 and res["result"] == "FAILED"
    partial = _run_rec("cpu", status="interrupted", acc=None, wall=9000.0, complete=False, chunks=ch)
    res, rc = compare_runs.compare(partial, gpu, None, claims, gate)
    assert rc == 7 and res["result"].startswith("INCOMPLETE") and "speedup" not in res and res["chunkSpeed"][0]["speedup"] == 10.0
    other = _run_rec("cuda", acc=acc)
    other["input"]["videoStreamSha256"] = "different"
    assert compare_runs.compare(cpu, other, claims, claims, gate)[1] == 5
