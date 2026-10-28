"""Video Intelligence 5.0: colour handling, evidence-driven discovery refinement, clip-level
off-ball sequences and the clip-frames endpoint."""

import numpy as np

from scoutx_tracker.colour import ColourInfo, decode_command, working_space_filter
from scoutx_tracker.discovery import DiscoveryConfig, discover
from scoutx_tracker.offball import sequence_observations
from tests.test_discovery_41 import Det, Reader, frames


def info(transfer="bt709", matrix="bt709", pix="yuv420p", rng="tv", h=1080):
    return ColourInfo(1920, h, pix, transfer, "bt709", matrix, rng, 30.0, 60.0)


def test_working_space_filter_is_explicit_per_dynamic_range():
    sdr = working_space_filter(info())
    assert sdr.startswith("scale=in_color_matrix=bt709") and "zscale" not in sdr
    assert "bt601" in working_space_filter(info(matrix="unknown", h=480))
    hlg = working_space_filter(info("arib-std-b67", "bt2020nc", "yuv420p10le"))
    assert "tin=arib-std-b67" in hlg and "npl=203" in hlg and "p=709" in hlg and "tonemap" not in hlg
    pq = working_space_filter(info("smpte2084", "bt2020nc", "yuv420p10le"))
    assert "tin=smpte2084" in pq and "tonemap=hable" in pq
    assert info("arib-std-b67", pix="yuv420p10le").bit_depth == 10 and info().dynamic_range == "sdr"
    cmd = decode_command("in.mov", 10.0, 20.0, 10.0, info(), select_every=5)
    vf = cmd[cmd.index("-vf") + 1]
    assert vf.index("fps=10") < vf.index("select") < vf.index("scale="), "sample before converting colour"


def test_neighbours_are_read_only_after_target_evidence():
    """A large player with no readable number: 5.0 reads the sampled frame only."""
    det = Det(box=(800, 300, 900, 480))  # 180 px: dense_min_h, but not 'close'
    none = Reader(lambda i: (None, 0.0, None))
    discover("", 0, 6, "20", "orange", det, none, cfg=DiscoveryConfig(), frames=frames(box=(800, 300, 900, 480)))
    old = Reader(lambda i: (None, 0.0, None))
    discover("", 0, 6, "20", "orange", Det(box=(800, 300, 900, 480)), old, cfg=DiscoveryConfig(evidence_densify=False, roi_det=False),
             frames=frames(box=(800, 300, 900, 480)))
    assert none.calls < old.calls
    # a partial read ("2" of #20) triggers neighbour reads, which can then confirm the number
    seq = iter([("2", 0.95, "s")] + [("20", 0.97, "s")] * 50)
    hit = Reader(lambda i: next(seq))
    res = discover("", 0, 6, "20", "orange", Det(box=(800, 300, 900, 480)), hit, cfg=DiscoveryConfig(), frames=frames(box=(800, 300, 900, 480)))
    assert res.sightings and res.sightings[0].number == "20"


def test_roi_detection_maps_boxes_back_to_frame_coordinates():
    seen = []

    class RoiDet:
        def __call__(self, img):
            seen.append(img.shape)
            if img.shape[0] == 1080:  # full frame
                return np.array([[800, 300, 900, 600]], np.float32), np.array([0.9], np.float32)
            return np.array([[10, 10, 110, 310]], np.float32), np.array([0.9], np.float32)

    seq = iter([("20", 0.97, "s")] * 100)
    res = discover("", 0, 3, "20", "orange", RoiDet(), Reader(lambda i: next(seq)), cfg=DiscoveryConfig(), frames=frames(n=30))
    rois = [s for s in seen if s[0] != 1080]
    assert rois and all(abs(s[1] / s[0] - 16 / 9) < 0.02 for s in rois), "ROI canvas keeps the 16:9 detector shape"
    assert res.sightings


def test_sequence_observations_need_six_confirmed_seconds_and_stay_clip_level():
    fps = 10.0
    n = 200
    times = np.arange(n) / fps
    states = np.array(["CONFIRMED_VISIBLE"] * 80 + ["LIKELY_VISIBLE"] * 40 + ["CONFIRMED_VISIBLE"] * 40 + ["NOT_IDENTIFIED"] * 40)
    present = np.ones(n, bool)
    boxes = np.tile(np.array([[1000, 400, 1040, 500]], float), (n, 1))
    rows = []
    for f in range(n):
        rows.append([f, f / fps, 7, 1000 + 500, 400, 1040 + 500, 500])  # opponent 5 body heights away
        rows.append([f, f / fps, 1, 1000, 400, 1040, 500])                # the target itself
    rows = np.array(rows, float)
    out = sequence_observations(times, states, boxes, present, rows, {7: "opponent", 1: "team"}, fps)
    assert len(out) == 1, "only the 8 s run qualifies; the 4 s run is too short"
    q = out[0]
    assert q["kind"] == "free" and q["start"] == 0.0 and q["end"] == 7.9 and q["freeShare"] == 1.0


def test_clip_frames_endpoint_outlines_target_and_is_gated(monkeypatch):
    from fastapi.testclient import TestClient

    from app import tracking_v3 as T
    from app.main import app

    monkeypatch.setenv("TRACKING_V3_ENABLED", "true")
    T.set_clip_frame_reader(lambda url, t: np.zeros((1080, 1920, 3), np.uint8))
    try:
        body = {"contractVersion": 3, "jobId": "job_12345", "source": {"url": "https://x/v.mov"}, "times": [32.0, 35.0],
                "indicator": [[32.0, 0.4, 0.3, 0.05, 0.2]], "maxWidth": 640,
                "privacy": {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False}}
        r = TestClient(app).post("/v3/tracking:clipFrames", json=body)
        assert r.status_code == 200, r.text
        fr = r.json()["frames"]
        assert [f["id"] for f in fr] == ["f0", "f1"]
        import base64

        import cv2
        img = cv2.imdecode(np.frombuffer(base64.b64decode(fr[0]["jpegBase64"]), np.uint8), cv2.IMREAD_COLOR)
        assert img.shape[1] == 640 and img[:, :, 2].max() > 200, "yellow outline drawn, frame downscaled"
        assert TestClient(app).post("/v3/tracking:clipFrames", json={**body, "times": [1.0] * 7}).status_code == 422
    finally:
        T.set_clip_frame_reader(None)


def test_period_detection_handles_recordings_shorter_than_the_activity_window():
    from scoutx_tracker.periods import detect_periods

    times = np.arange(200) / 10.0
    tl = detect_periods(times, np.zeros(200, int), np.full(200, 0.3))
    assert len(tl.kind_at(times)) == 200


def test_a_single_number_read_is_a_moment_to_check_not_a_confirmation():
    """5.0: single reads at 0.90-0.95 were wrong 3x in 20 min of IMG_5105 -> two agreeing reads confirm."""
    seq = iter([("20", 0.95, "s")] + [(None, 0.0, None)] * 200)
    res = discover("", 0, 6, "20", "orange", Det(), Reader(lambda i: next(seq)), cfg=DiscoveryConfig(), frames=frames())
    assert res.moments and res.moments[0]["identityState"] == "LIKELY_VISIBLE" and res.moments[0]["candidate"] is True
    seq2 = iter([("20", 0.95, "s")] * 200)
    res2 = discover("", 0, 6, "20", "orange", Det(), Reader(lambda i: next(seq2)), cfg=DiscoveryConfig(), frames=frames())
    assert res2.moments[0]["identityState"] == "CONFIRMED_VISIBLE" and res2.moments[0]["readFrames"] >= 2


def test_weak_reads_only_ask_and_on_pitch_filter_drops_spectators():
    from scoutx_tracker.discovery import is_confirmed
    from scoutx_tracker.features import ground_green

    assert not is_confirmed(0, 9) and not is_confirmed(1, 1) and is_confirmed(1, 2) and is_confirmed(2, 0)
    f = np.full((1080, 1920, 3), (40, 140, 40), np.uint8)
    assert ground_green(f, (800, 300, 900, 600)) > 0.9
    assert ground_green(f, (800, 700, 900, 1080)) == 0.0, "cut off by the bottom of the frame"
    f[560:700, 700:1000] = (60, 60, 60)  # standing on the stand / pavement
    assert ground_green(f, (800, 300, 900, 600)) < 0.25


def test_weak_only_sightings_never_become_identity_evidence():
    from scoutx_tracker.analyze import attach_sightings

    class D_:
        times = np.array([0.0, 0.1, 0.2])

    class T_:
        rows = np.array([[1, 0.1, 7, 100, 100, 150, 250, 0.9, 0]], float)

    reads: dict = {}
    assert attach_sightings(reads, [{"t": 0.1, "box": [100, 100, 150, 250], "number": "20", "frames": 0, "weak": 5}], "20", D_, T_) == 0
    assert attach_sightings(reads, [{"t": 0.1, "box": [100, 100, 150, 250], "number": "20", "frames": 2}], "20", D_, T_) == 1
