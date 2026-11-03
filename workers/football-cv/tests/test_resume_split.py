"""5.3 candidate B: the paused victim of a box steal resumes on the thief's path (crossings.resume_rows,
SCOUTX_RESUME_SPLIT, off by default).

Verified failure P (IMG_4809 244.4 s, DEFAULT decode, tests/test_known_identity_failures.py): player A's track takes
#20's box at w193 (the steal rule cuts A), #20's own track pauses at w192-193 and resumes at w194 on A's box; nothing
cuts #20's track, so its anchored identity passes to A. Neither extrapolation fits the resumed box there (both IoU
< 0.2: the boxes are distorted by the overlap), so B cuts a victim's resumption when it fits the thief's path better
(by STEAL_LEAD) OR does not continue the victim's own path (IoU < STEAL_IOU). The cut uses the steal links: identity
crosses only when appearance decides it."""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from scoutx_tracker import crossings
from scoutx_tracker.crossings import resume_rows, split_at_contacts, steal_rows

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "bench"))
from pp_bench import iou  # noqa: E402

REPLAY = ROOT / "bench" / "results" / "5.3" / "wrong-player-20261102" / "replays" / "default_i0225"
GT = ROOT / "bench" / "results" / "5.1" / "gt_img4809_intervals.json"


def _rows(tracks):
    out = []
    for tid, rs in tracks.items():
        for f, *b in rs:
            out.append([f, f / 10.0, tid, *b, 0.9, 0])
    R = np.array(out, float)
    R[:, 8] = np.arange(len(R))
    return R


def _scene(resume_on_own_path: bool):
    """Y (tid 2) runs left and is paused at frames 20-21; X (tid 1) runs right and at frame 20 jumps onto Y's
    extrapolated box (a steal). At frame 22 Y resumes either on X's extrapolated path (transfer) or on its own."""
    X = [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(20)]                    # frame 19: 290..350
    Y = [(f, 600 - 10 * f, 100, 660 - 10 * f, 300) for f in range(20)]                    # frame 19: 410..470
    X += [(f, 600 - 10 * f, 100, 660 - 10 * f, 300) for f in range(20, 25)]              # X now on Y's path
    if resume_on_own_path:
        Y += [(f, 600 - 10 * f, 120, 660 - 10 * f, 320) for f in range(22, 24)]          # Y continues its own path
    else:
        Y += [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(22, 24)]          # Y now on X's path
    return _rows({1: X, 2: Y})


def test_resume_on_the_thiefs_path_is_cut():
    R = _scene(resume_on_own_path=False)
    kit = np.full(len(R), 0.8)
    st = steal_rows(R, kit)
    assert st and {int(R[b, 2]) for b, _ in st} == {1}
    res = resume_rows(R, st)
    assert [(int(R[r, 2]), int(R[r, 0])) for r, _ in res] == [(2, 22)]


def test_resume_continuing_the_victims_own_path_is_not_cut():
    R = _scene(resume_on_own_path=True)
    kit = np.full(len(R), 0.8)
    # here X's jump onto Y's path is followed by Y resuming exactly where Y would be: X and Y overlap on Y's path,
    # which is a different problem (two tracks on one person); B must not cut Y's own continuation
    st = steal_rows(R, kit)
    assert st and resume_rows(R, st) == []


def test_no_steal_no_resume_cut():
    R = _rows({1: [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(30) if f not in (12, 13)],
               2: [(f, 600, 400, 660, 600) for f in range(30)]})
    assert resume_rows(R, steal_rows(R, np.full(len(R), 0.8))) == []


def test_flag_off_keeps_the_baseline_tracks(monkeypatch):
    monkeypatch.setattr(crossings, "RESUME_SPLIT", False)
    monkeypatch.setattr(crossings, "EXCHANGE_SPLIT", False)     # B is tested in isolation (A also cuts this scene)
    R = _scene(resume_on_own_path=False)
    s = np.zeros((len(R), 80), np.float32)
    s[:, 0] = 1
    cs = split_at_contacts(R, np.full(len(R), 0.8), s, R[:, 1], 10.0)
    y_tids = {int(t) for t in cs.rows[(cs.rows[:, 0] >= 22) & (np.isin(cs.rows[:, 3], [100 + 10 * f for f in range(22, 24)]))][:, 2]}
    assert y_tids == {2}                                                     # Y not cut without the flag


def test_flag_on_cuts_and_links_without_identity_when_appearance_cannot_tell(monkeypatch):
    monkeypatch.setattr(crossings, "RESUME_SPLIT", True)
    monkeypatch.setattr(crossings, "EXCHANGE_SPLIT", False)
    R = _scene(resume_on_own_path=False)
    s = np.zeros((len(R), 80), np.float32)
    s[:, 0] = 1
    cs = split_at_contacts(R, np.full(len(R), 0.8), s, R[:, 1], 10.0)
    post = {int(t) for t in cs.rows[(cs.rows[:, 0] == 22) & (cs.rows[:, 3] == 320)][:, 2]}
    assert post and 2 not in post                                            # Y's resumption is a new piece
    lk = [x for x in cs.links if x.post in post]
    assert lk and all(not x.clear for x in lk)                               # no identity crosses on equal looks


def _replay(tmp_path, resume):
    env = {**os.environ, "SCOUTX_EXCHANGE_SPLIT": "0", "SCOUTX_RESUME_SPLIT": resume, "SCOUTX_OCR_CONSULTED_ONLY": "0", "SCOUTX_APPEARANCE_ONLY_LIKELY": "1", "PYTHONHASHSEED": "0"}
    out = tmp_path / f"r{resume}"
    subprocess.run([sys.executable, str(ROOT / "bench" / "regression_replay.py"), "run", "--replay", str(REPLAY),
                    "--out", str(out)], env=env, cwd=ROOT, check=True, capture_output=True)
    with np.load(out / "automatic" / "timeline.npz") as z:
        return {k: z[k].copy() for k in ("present", "states", "evidence", "boxes")}, json.loads((out / "replay_run.json").read_text())


@pytest.mark.skipif(not REPLAY.exists(), reason="regression replay artifacts not present")
def test_replay_P_candidate_B_follows_20_not_player_a(tmp_path):
    """Replay boundary: with B on, 23 crops the original run never read are answered empty (counted below); the
    full-pipeline runs with real OCR are reported in docs/video/wrong-player-exchange-2026-11-02.md section 9."""
    gt = json.loads(GT.read_text())["frames"]
    tl, rec = _replay(tmp_path, "1")
    assert rec["ocr"]["neverReadInOriginal"] == 23
    for w in (195, 196, 197):
        a_box = next(lab["box"] for lab in gt[str(2250 + w)] if lab.get("piece") == 38)          # player A
        c20 = next(lab["box"] for lab in gt[str(2250 + w)] if lab.get("piece") == 39)            # #20 (C2/C4/C6)
        assert tl["present"][w] and iou(tl["boxes"][w], a_box) < 0.3 and iou(tl["boxes"][w], c20) >= 0.8
    # the legitimate single-read acquisition before the crossing is untouched (confirmed number claims at w186-191)
    base, _ = _replay(tmp_path, "0")
    for w in range(150, 192):
        assert str(tl["states"][w]) == str(base["states"][w]) and np.allclose(tl["boxes"][w], base["boxes"][w])
