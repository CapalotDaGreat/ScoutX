"""Engine 3.2: licence-clean detector network, weight-free embedder, evidence rules, fast corrections.
Synthetic - no model weights or video needed."""

from __future__ import annotations

from types import SimpleNamespace

import numpy as np
import pytest

torch = pytest.importorskip("torch")
pytest.importorskip("torchvision")
pytest.importorskip("cv2")

from scoutx_tracker import analyze as A  # noqa: E402
from scoutx_tracker import identity as I  # noqa: E402
from scoutx_tracker.features import EMB_DIM, GridEmbedder  # noqa: E402
from scoutx_tracker.stats import same_kit_occlusions  # noqa: E402
from scoutx_tracker.yolox_net import PERSON, YOLOX, letterbox, postprocess  # noqa: E402


def test_yolox_network_round_trips_a_state_dict_strictly_and_fusion_is_exact(tmp_path):
    torch.manual_seed(0)
    m = YOLOX("yolox_nano").eval()
    for mod in m.modules():  # non-trivial BN statistics so fusion is actually exercised
        if isinstance(mod, torch.nn.BatchNorm2d):
            mod.running_mean.uniform_(-0.2, 0.2)
            mod.running_var.uniform_(0.5, 1.5)
    path = tmp_path / "w.pth"
    torch.save({"model": m.state_dict(), "optimizer": None}, path)
    from scoutx_tracker.yolox_net import load

    fused = load("yolox_nano", path, fuse=True)  # weights_only + strict=True inside
    x = torch.rand(1, 3, 128, 160) * 255
    with torch.inference_mode():
        a, b = m(x), fused(x)
    assert a.shape == (1, (16 * 20 + 8 * 10 + 4 * 5), 85)
    assert torch.allclose(a, b, atol=1e-3, rtol=1e-3)


def test_yolox_rejects_a_mismatched_checkpoint(tmp_path):
    from scoutx_tracker.yolox_net import load

    path = tmp_path / "w.pth"
    torch.save({"model": YOLOX("yolox_nano").state_dict()}, path)
    with pytest.raises(RuntimeError):
        load("yolox_tiny", path)


def test_letterbox_and_postprocess_map_boxes_back_to_source_pixels():
    img = np.zeros((1080, 1920, 3), np.uint8)
    canvas, r = letterbox(img, 1280)
    assert canvas.shape[0] % 32 == 0 and canvas.shape[1] == 1280 and abs(r - 1280 / 1920) < 1e-9
    out = torch.zeros(3, 85)
    out[0, :4] = torch.tensor([100.0, 100.0, 20.0, 60.0]); out[0, 4] = 0.9; out[0, 5 + PERSON] = 0.9  # noqa: E702
    out[1, :4] = torch.tensor([101.0, 100.0, 20.0, 60.0]); out[1, 4] = 0.8; out[1, 5 + PERSON] = 0.8  # noqa: E702 duplicate
    out[2, :4] = torch.tensor([300.0, 300.0, 10.0, 10.0]); out[2, 4] = 0.9; out[2, 5 + 2] = 0.9  # noqa: E702 a car
    b, s, c = postprocess(out, r)
    assert len(b) == 1 and c[0] == PERSON
    assert np.allclose(b[0], np.array([90, 70, 110, 130]) / r, atol=1e-3)


def test_grid_embedder_is_weight_free_normalised_and_separates_kits():
    frame = np.zeros((200, 200, 3), np.uint8)
    frame[:, :100] = (30, 130, 240)   # orange player
    frame[:, 100:] = (160, 60, 20)    # blue player
    e = GridEmbedder()(frame, np.array([[0, 0, 100, 200], [100, 0, 200, 200]], np.float32))
    assert e.shape == (2, EMB_DIM)
    assert np.allclose(np.linalg.norm(e, axis=1), 1.0, atol=1e-5)
    assert float(e[0] @ e[1]) < 0.2


def test_only_full_other_numbers_are_contrary_evidence():
    assert I.incompatible_with_target("17", "20")
    assert not I.incompatible_with_target("20", "20")
    # Lone digits are OCR noise (measured: "1" and "4" read on a clearly visible "20").
    assert not I.incompatible_with_target("1", "20")
    assert not I.incompatible_with_target("4", "20")
    assert not I.incompatible_with_target("17", None)


def test_same_kit_contact_is_detected_only_for_team_mates():
    # frame, t, tid, x1, y1, x2, y2, score, det
    rows = np.array([
        [0, 0.0, 1, 100, 100, 140, 200, 0.9, 0],
        [0, 0.0, 2, 105, 100, 145, 200, 0.9, 1],   # team-mate on top of tid 1
        [1, 0.1, 1, 100, 100, 140, 200, 0.9, 2],
        [1, 0.1, 3, 105, 100, 145, 200, 0.9, 3],   # opponent on top of tid 1
    ], float)
    kit = np.array([0.8, 0.7, 0.8, 0.0])
    occ = same_kit_occlusions(SimpleNamespace(rows=rows), kit)
    # Row 2 (orange, tid 1) touched only by an opponent: evidence may continue across it.
    # Row 3 (the opponent) is covered by an orange box - irrelevant, it is not a target candidate.
    assert occ.tolist() == [True, True, False, True]


def test_ocr_crop_selection_uses_recorded_heights_without_reading_images():
    s = {"tid": 7, "kit1": 0.8, "kit2": 0.0, "n": 50,
         "crops": [f"/nonexistent/{f:06d}_{f}.jpg" for f in range(0, 40, 2)],
         "crop_h": [100.0 + f for f in range(0, 40, 2)]}
    out = A.select_ocr_crops([s], **A.OCR_DENSE)
    assert 7 in out and all(int(p.split("/")[-1].split("_")[0]) >= 20 for p in out[7])  # h >= 120 only
    frames = sorted(int(p.split("/")[-1].split("_")[0]) for p in out[7])
    assert all(b - a >= A.OCR_DENSE["min_gap"] for a, b in zip(frames, frames[1:]))


def test_conflict_reads_are_reported_for_chosen_tracklets():
    # Minimal two-tracklet scene: tid 1 has a "20" read and later a "17" read.
    fps = 10.0
    rows, summary, by_tid = [], [], {}
    for tid, (f0, f1) in {1: (0, 60), 2: (70, 130)}.items():
        ix = []
        for f in range(f0, f1):
            ix.append(len(rows))
            rows.append([f, f / fps, tid, 500, 300, 540, 400, 0.9, len(rows)])
        by_tid[tid] = np.array(ix)
        sig = np.ones(80, np.float32) / np.sqrt(80)
        summary.append({"tid": tid, "t0": f0 / fps, "t1": (f1 - 1) / fps, "n": f1 - f0, "segment": 0, "h_med": 100.0,
                        "h_max": 100.0, "kit1": 0.8, "kit2": 0.0, "sig": sig, "emb": None, "crops": [],
                        "p_start": [500, 400, 100], "p_end": [500, 400, 100]})
    rows = np.array(rows, float)
    reads = {1: [(10, "20", 0.99, "shirt"), (50, "17", 0.99, "shirt")]}
    res = I.resolve_identity(summary, reads, I.Target(number="20"), fps, rows, by_tid, None)
    k1 = next(k for k, s in enumerate(summary) if s["tid"] == 1)
    if k1 in res.chosen:
        assert res.conflict_times[k1] == [5.0]


# ---------------------------------------------------------------------------- calibration (3.2)
def _pitch_image(lines, boards=False):
    import cv2

    img = np.zeros((1080, 1920, 3), np.uint8)
    img[:] = (40, 150, 40)  # grass (BGR)
    if boards:
        img[300:340, :] = (40, 40, 200)  # red advertising boards
        img[340:344, :] = (240, 240, 240)  # white board edge: grass on one side only
    for p1, p2 in lines:
        cv2.line(img, p1, p2, (245, 245, 245), 5)
    return img


def test_pitch_lines_need_grass_on_both_sides_and_intersections_become_landmark_candidates():
    from scoutx_tracker.calibration import auto_calibration_feasibility, detect_pitch_lines, line_intersections

    img = _pitch_image([((100, 900), (1800, 700)), ((900, 1000), (1000, 420))], boards=True)
    lines = detect_pitch_lines(img)
    assert len(lines) >= 2
    assert all(not (330 <= (c.p1[1] + c.p2[1]) / 2 <= 350 and abs(c.angle) < 3) for c in lines), "board edge rejected"
    xs = line_intersections(lines, shape=img.shape[:2])
    assert xs and abs(xs[0]["point"][0] - 960) < 40
    f = auto_calibration_feasibility(img)
    assert f["directions"] >= 2 and not f["feasible"], "two lines = one landmark: never enough for a homography"


def test_single_touchline_view_is_reported_infeasible():
    from scoutx_tracker.calibration import auto_calibration_feasibility

    f = auto_calibration_feasibility(_pitch_image([((0, 900), (1919, 760))]))
    assert f["directions"] == 1 and f["landmarkCandidates"] == 0 and not f["feasible"]


def test_pitch_line_layouts_produce_identical_candidates(monkeypatch):
    import scoutx_tracker.calibration as calibration

    image = _pitch_image([((100, 900), (1800, 700))])
    segments = np.array([[50, 450, 900, 350]], dtype=np.int32)
    monkeypatch.setattr(calibration.cv2, "HoughLinesP", lambda *a, **kw: segments[:, None, :])
    old = calibration.detect_pitch_lines(image)
    monkeypatch.setattr(calibration.cv2, "HoughLinesP", lambda *a, **kw: segments)
    new = calibration.detect_pitch_lines(image)
    assert old and new == old


def test_ground_speed_series_from_calibrated_positions():
    from scoutx_tracker.metrics import Thresholds, ground_speed_series

    fps = 10.0
    t = np.arange(60) / fps
    pos = np.stack([5.0 * t, np.zeros_like(t)], 1)  # 5 m/s along the touchline
    pos[30:33] = np.nan  # no calibration there
    v = ground_speed_series(pos, np.ones(60, bool), fps, Thresholds())
    assert np.isnan(v[30:33]).all()
    assert abs(np.nanmedian(v) - 5.0) < 0.2


def test_manual_calibration_propagates_through_camera_motion_and_stops_on_bad_motion():
    """Synthetic camera pan: P[f] maps frame f to the shot reference. A landmark fixed on the pitch must
    project to the same pitch metres in every propagated frame; propagation stops at low CMC quality."""
    from scoutx_tracker.calibration import LANDMARKS, fit_manual, project, propagate

    names = ["lbox_bottom", "lbox_top", "lbox_goal_bottom", "lbox_goal_top"]
    world = np.array([LANDMARKS[n] for n in names])
    # Ground truth: image of frame 0 -> pitch is a known homography; build image points from its inverse.
    H0 = np.array([[0.05, 0.004, -10.0], [0.001, -0.09, 80.0], [0.0, 0.0002, 1.0]])
    img0 = project(np.linalg.inv(H0), world)
    cal = fit_manual("c1", 0, [tuple(p) for p in img0], names)
    assert cal.status == "valid" and cal.reprojection_m < 1e-3  # float32 inside OpenCV
    F = 30
    P = np.stack([np.array([[1, 0, -4.0 * f], [0, 1, 0], [0, 0, 1]]) for f in range(F)])  # pan 4 px/frame
    q = np.ones(F); q[20] = 0.2   # camera-motion estimate breaks at frame 20
    Hs = propagate(cal, P, np.zeros(F, int), np.arange(F) / 10.0, q)
    assert set(Hs) == set(range(20)), "trusted only up to the bad motion estimate"
    for f in (5, 19):
        img_f = img0 + np.array([4.0 * f, 0.0])   # the scene moved right in the image as the camera panned
        assert np.allclose(project(Hs[f], img_f), world, atol=1e-2)


def test_calibration_with_too_few_or_clustered_landmarks_is_rejected():
    from scoutx_tracker.calibration import fit_manual

    assert fit_manual("c", 0, [(0, 0), (1, 0), (0, 1)], ["corner_bl", "corner_br", "corner_tl"]).status == "invalid"
    r = fit_manual("c", 0, [(0, 0), (10, 0), (0, 10), (10, 10)],
                   ["lpenalty_spot", "lbox_bottom", "lbox_top", "lbox_goal_top"])
    assert r.status in ("valid", "invalid")  # geometry-dependent; must never raise


def test_onnx_backend_matches_torch(tmp_path):
    ort = pytest.importorskip("onnxruntime")
    from scoutx_tracker.yolox_net import export_onnx, load

    torch.manual_seed(1)
    w = tmp_path / "yolox_nano.pth"
    torch.save({"model": YOLOX("yolox_nano").state_dict()}, w)
    path = export_onnx("yolox_nano", w, tmp_path / "m.onnx", imgsz=320)
    x = torch.rand(2, 3, 192, 320) * 255
    with torch.inference_mode():
        a = load("yolox_nano", w, "cpu")(x).numpy()
    b = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"]).run(None, {"images": x.numpy()})[0]
    assert a.shape == b.shape and np.allclose(a, b, rtol=1e-3, atol=1e-2)
