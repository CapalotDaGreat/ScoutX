"""5.2: box-steal splits (identity must not cross a tracker jump onto a lost team-mate), ONNX
Runtime provider selection, inference modes, open-set torso read rule."""

import numpy as np
import pytest

from scoutx_tracker.crossings import SWAP_MARGIN, split_at_contacts, steal_rows
from scoutx_tracker.modes import MODES, mode_env
from scoutx_tracker.yolox_net import ort_providers


def _rows(tracks):
    out = []
    for tid, rs in tracks.items():
        for f, *b in rs:
            out.append([f, f / 10.0, tid, *b, 0.9, 0])
    R = np.array(out, float)
    R[:, 8] = np.arange(len(R))
    return R


def _steal_scene():
    """A (tid 1) runs right at x=100..; B (tid 2) stands at x=400 and its track is lost after frame
    19; on frame 21 A's box jumps onto B (who keeps standing there) - the held-out 17:53 pattern."""
    A = [(f, 100 + 5 * f, 100, 160 + 5 * f, 300) for f in range(21)] + [(f, 400, 100, 460, 300) for f in range(21, 40)]
    B = [(f, 400, 100, 460, 300) for f in range(20)]
    return _rows({1: A, 2: B})


def _sigs(R, look_a, look_b):
    """look of person A before the jump, of B (and A's track after the jump = B)."""
    s = np.zeros((len(R), 80), np.float32)
    for i, r in enumerate(R):
        s[i] = look_a if (r[2] == 1 and r[0] <= 20) else look_b
    return s


def test_steal_detected_only_for_a_jump_onto_a_lost_mate():
    R = _steal_scene()
    kit = np.full(len(R), 0.8)
    st = steal_rows(R, kit)
    assert len(st) == 1
    b, q = st[0]
    assert R[b, 2] == 1 and R[b, 0] == 21 and R[q, 2] == 2 and R[q, 0] == 19
    # an opponent (other kit) is never a "mate" whose box can be stolen
    assert steal_rows(R, np.where(R[:, 2] == 2, 0.0, 0.8)) == []
    # B's track continuing on frame 21 means it was not lost: no steal
    R2 = _rows({1: [(f, 100 + 5 * f, 100, 160 + 5 * f, 300) for f in range(21)] + [(21, 400, 100, 460, 300)],
                2: [(f, 400, 100, 460, 300) for f in range(25)]})
    assert all(R2[b, 0] != 21 or R2[b, 2] != 1 for b, _ in steal_rows(R2, np.full(len(R2), 0.8)))
    # smooth running is never a steal
    R3 = _rows({1: [(f, 100 + 8 * f, 100, 160 + 8 * f, 300) for f in range(40)], 2: [(f, 600, 400, 660, 600) for f in range(10)]})
    assert steal_rows(R3, np.full(len(R3), 0.8)) == []


def test_steal_split_identity_does_not_cross_when_appearance_cannot_tell():
    R = _steal_scene()
    a = np.zeros(80, np.float32); a[0] = 1.0
    cs = split_at_contacts(R, np.full(len(R), 0.8), _sigs(R, a, a), R[:, 1], 10.0)
    assert cs.steals == 1 and len(np.unique(cs.rows[:, 2])) == 3
    post = int(cs.rows[(cs.rows[:, 0] == 21) & (cs.rows[:, 3] == 400)][0, 2])
    lk = [x for x in cs.links if x.post == post]
    assert lk and all(not x.clear and x.decision == "unclear" for x in lk)


def test_steal_split_follows_appearance_when_it_is_decisive():
    R = _steal_scene()
    a = np.zeros(80, np.float32); a[:20] = 1.0
    b = np.zeros(80, np.float32); b[20:] = 1.0
    cs = split_at_contacts(R, np.full(len(R), 0.8), _sigs(R, a, b), R[:, 1], 10.0)
    post = int(cs.rows[(cs.rows[:, 0] == 21) & (cs.rows[:, 2] != 2)][0, 2])
    by = {x.decision: x for x in cs.links if x.post == post}
    assert set(by) == {"swap", "unclear"}
    assert by["swap"].clear and by["swap"].pre == 2 and by["swap"].margin >= SWAP_MARGIN
    assert by["unclear"].pre == 1 and not by["unclear"].clear  # A's identity does not pass the jump


def test_steal_split_keeps_the_tracker_when_appearance_agrees():
    R = _steal_scene()
    a = np.zeros(80, np.float32); a[:20] = 1.0
    b = np.zeros(80, np.float32); b[20:] = 1.0
    s = _sigs(R, a, b)
    s[(R[:, 2] == 1) & (R[:, 0] > 20)] = a  # after the jump the box still shows A
    cs = split_at_contacts(R, np.full(len(R), 0.8), s, R[:, 1], 10.0)
    lk = [x for x in cs.links if x.pre == 1]
    assert len(lk) == 1 and lk[0].decision == "same" and lk[0].clear


def test_ort_providers_prefers_cuda_only_when_installed():
    assert ort_providers(["CPUExecutionProvider"], "auto") == ["CPUExecutionProvider"]
    assert ort_providers(["CUDAExecutionProvider", "CPUExecutionProvider"], "auto") == ["CUDAExecutionProvider", "CPUExecutionProvider"]
    # TensorRT only when named; unknown names are dropped; CPU always last
    assert ort_providers(["TensorrtExecutionProvider", "CUDAExecutionProvider", "CPUExecutionProvider"], "auto")[0] == "CUDAExecutionProvider"
    assert ort_providers(["CPUExecutionProvider"], "CUDAExecutionProvider") == ["CPUExecutionProvider"]


def test_modes_only_balanced_is_accuracy_validated():
    assert mode_env("balanced", False) == {}
    with pytest.raises(PermissionError):
        mode_env("fast", False)
    assert mode_env("fast", True) == {"SCOUTX_KEYFRAME_EVERY": "2"}
    assert [k for k, m in MODES.items() if m["accuracyValidated"]] == ["balanced"]
    with pytest.raises(ValueError):
        mode_env("turbo", True)


class _FakeReader:
    def __init__(self, outs):
        self.outs = outs

    def parseq(self, rois):
        return self.outs[:len(rois)]


def test_open_torso_read_is_one_weak_read_with_a_conflict_rule():
    from scoutx_tracker.ocr import open_torso_read

    crop = np.full((200, 80, 3), 120, np.uint8)
    assert open_torso_read(_FakeReader([("20", 0.995), ("20", 0.99), ("2", 0.99)]), crop) == ("20", 0.995)
    assert open_torso_read(_FakeReader([("20", 0.995), ("28", 0.95)]), crop) == (None, 0.0)   # conflict
    assert open_torso_read(_FakeReader([("20", 0.98)]), crop) == (None, 0.0)                   # below frozen 0.99
    assert open_torso_read(_FakeReader([("7", 1.0)]), crop) == (None, 0.0)                     # not two digits


def test_regression_heldout_1073_answer_not_carried_back_across_a_box_steal(monkeypatch):
    """Held-out audit (5.2, IMG_4809 17:44-17:53, frozen 5.1 thresholds): the owner answered "yes"
    at 1073.4 s; tracker track 2250 had jumped at 1073.3 s from another player onto the answered
    one (whose own track had just been lost), and 5.1 carried the answer back ~9 s onto the other
    player as "likely". With 5.2 box-steal splits the answer stays on the answered player."""
    import json
    from pathlib import Path

    import scoutx_tracker.crossings as C
    from scoutx_tracker.features import kit_scores
    from scoutx_tracker.identity import Target, resolve_identity
    from scoutx_tracker.states import frame_states
    from scoutx_tracker.stats import build_timeline
    from scoutx_tracker.tracklets import Detections, assemble, track_rows, tracklet_features

    fix = Path(__file__).parent / "fixtures"
    z = np.load(fix / "img4809_1073_slice.npz")
    meta = json.loads((fix / "img4809_1073_slice.json").read_text())

    def iou(a, b):
        x1, y1, x2, y2 = max(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), min(a[3], b[3])
        i = max(0, x2 - x1) * max(0, y2 - y1)
        return i / ((a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - i)

    def run(steal: bool):
        monkeypatch.setattr(C, "STEAL_SPLIT", steal)
        D = Detections(z["dets"], z["sigs"].astype(np.float32), z["emb_idx"], z["embs"].astype(np.float32), z["balls"],
                       z["warps"], z["times"], z["segment"], {}, meta["fps"], [("slice", 0, len(z["times"]), 0.0)],
                       meta["width"], meta["height"])
        D.grass = z["grass"]
        T = assemble(D, track_rows(D), "orange", "white", contact_split=True)
        reads: dict = {}
        for f, box, num, conf in meta["reads"]:
            rows = np.where(T.rows[:, 0] == f)[0]
            if len(rows):
                best = max(rows, key=lambda r: iou(T.rows[r, 3:7], box))
                if iou(T.rows[best, 3:7], box) >= 0.5:
                    reads.setdefault(int(T.rows[best, 2]), []).append((f, num, conf, "fixture"))
        rk = kit_scores(D.sigs[T.rows[:, 8].astype(int)], "orange")
        tg = Target(number="20", kit_primary="orange", kit_secondary="white", anchors=[tuple(a) for a in meta["anchors"]])
        res = resolve_identity(T.summary, reads, tg, D.fps, T.rows, T.by_tid, tracklet_features(D, T), row_kit=rk,
                               links=T.links, contact_pre=T.contact_pre)
        tl = build_timeline(D, T, res, row_kit=rk)
        states, _ = frame_states(T, res, tl, np.full(len(D.times), "play"))
        claim = np.isin(states, ["CONFIRMED_VISIBLE", "LIKELY_VISIBLE"]) & tl.present
        hit = lambda lab: sum(1 for f, b, l in meta["groundTruth"] if l == lab and claim[f] and iou(tl.boxes[f], b) >= 0.5)  # noqa: E731
        return hit("N"), hit("T"), sum(1 for *_, l in meta["groundTruth"] if l == "T")

    wrong51, _, _ = run(False)
    assert wrong51 > 10, "fixture no longer reproduces the 5.1 failure - re-check the test"
    wrong, right, target = run(True)
    assert wrong == 0, "the other player was attributed to the answered player"
    assert right >= 0.75 * target, (right, target)


def test_extract_endpoint_checkpoints_segments_and_never_mixes_attempts(tmp_path, monkeypatch):
    """5.2: /v3/tracking:extract writes a segment atomically with a checkpoint. A crashed attempt's
    crops are never mixed into the retry, a repeat call is served from the checkpoint, and a segment
    from different stage-1 settings is redone."""
    from pathlib import Path

    from fastapi.testclient import TestClient

    from app import tracking_v3
    from app.main import app

    calls = []

    def fake_extract(url, out, t0=0.0, start=0.0, end=None):
        calls.append(out)
        (Path(out) / "crops").mkdir(parents=True, exist_ok=True)
        (Path(out) / "crops" / f"{len(calls):06d}_0.jpg").write_bytes(b"x")
        np.savez_compressed(Path(out) / "detections.npz", dets=np.zeros((2, 7)))
        (Path(out) / "meta.json").write_text('{"frames": 2}')
        return {"frames": 2, "seconds": 1.0}

    monkeypatch.setenv("TRACKING_V3_ENABLED", "true")
    monkeypatch.setenv("TRACKING_ARTIFACT_ROOT", str(tmp_path))
    seg = tmp_path / "j1" / "stage1" / "c_00120"
    seg.mkdir(parents=True)
    (seg / "crops").mkdir()
    (seg / "crops" / "999999_7.jpg").write_bytes(b"stale")          # leftovers of a crashed attempt
    body = {"contractVersion": 3, "jobId": "j1", "segmentIndex": 1, "startSec": 120, "endSec": 420,
            "source": {"url": "https://example.org/v.mp4?sig=1"},
            "privacy": {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False}}
    tracking_v3.set_engine(extract=fake_extract)
    try:
        with TestClient(app) as client:
            assert client.post("/v3/tracking:extract", json=body).json()["status"] == "complete"
            assert sorted(p.name for p in (seg / "crops").iterdir()) == ["000001_0.jpg"]   # no stale crop mixed in
            body["source"]["url"] = "https://example.org/v.mp4?sig=2"                      # re-signed URL, same source
            assert client.post("/v3/tracking:extract", json=body).json()["status"] == "cached" and len(calls) == 1
            monkeypatch.setenv("SCOUTX_KEYFRAME_EVERY", "2")                               # other stage-1 settings
            assert client.post("/v3/tracking:extract", json=body).json()["status"] == "complete" and len(calls) == 2
    finally:
        tracking_v3.set_engine()
    assert not [p for p in seg.parent.iterdir() if ".stale-" in p.name or ".tmp-" in p.name]   # bounded cleanup
