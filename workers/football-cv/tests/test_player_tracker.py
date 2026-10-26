"""Synthetic tests for the scoutx_tracker engine (no models, no video needed)."""

from __future__ import annotations

import json
from types import SimpleNamespace

import numpy as np
import pytest

pytest.importorskip("cv2")
pytest.importorskip("scipy")

from scoutx_tracker import identity as I  # noqa: E402
from scoutx_tracker.cli import merge_windows, parse_clock  # noqa: E402
from scoutx_tracker.features import NB, PALETTE, SIG_DIM, colour_signature, kit_score, palette_index  # noqa: E402
from scoutx_tracker.report import write_report  # noqa: E402
from scoutx_tracker.stats import Timeline, compute_stats, speeds  # noqa: E402
from scoutx_tracker.tracker import PlayerTracker  # noqa: E402
from scoutx_tracker.tracklets import purify  # noqa: E402


def sig_for(shirt: str, shorts: str = "black", head: str = "black", socks: str = "black") -> np.ndarray:
    parts = []
    for colour in (head, shirt, shorts, socks):
        h = np.zeros(NB, np.float32)
        h[PALETTE.index(colour)] = 1.0
        parts.append(np.sqrt(h))
    s = np.concatenate(parts)
    return s / np.linalg.norm(s)


ORANGE = sig_for("orange")
BLUE = sig_for("dark_blue", shorts="white")


# ------------------------------------------------------------------ features
def test_palette_marks_grass_and_named_colours():
    import cv2

    img = np.zeros((4, 4, 3), np.uint8)
    img[0] = (40, 160, 40)     # grass (BGR)
    img[1] = (30, 130, 240)    # orange
    img[2] = (240, 240, 240)   # white
    img[3] = (10, 10, 10)      # black
    idx = palette_index(cv2.cvtColor(img, cv2.COLOR_BGR2HSV))
    assert (idx[0] == -1).all()
    assert PALETTE[idx[1, 0]] == "orange"
    assert PALETTE[idx[2, 0]] == "white"
    assert PALETTE[idx[3, 0]] == "black"


def test_colour_signature_kit_score_ignores_grass():
    frame = np.zeros((200, 100, 3), np.uint8)
    frame[:] = (40, 160, 40)
    frame[40:100, 20:80] = (30, 130, 240)  # orange shirt in the shirt band
    sig, kept = colour_signature(frame, np.array([0, 0, 100, 200], np.float32))
    assert sig.shape == (SIG_DIM,)
    assert kit_score(sig, "orange") > 0.8
    assert kit_score(sig, "blue") == 0.0
    assert 0 < kept < 1


# ------------------------------------------------------------------ tracker
def _run_crossing(gate: float):
    """Two players run towards each other and cross; detections swap order at the crossing."""
    trk = PlayerTracker(fps=10, gate=gate)
    ids = {"orange": set(), "blue": set()}
    for f in range(30):
        xo = 100 + 10 * f
        xb = 400 - 10 * f
        boxes = np.array([[xo, 100, xo + 40, 200], [xb, 100, xb + 40, 200]], np.float32)
        feats = np.stack([ORANGE, BLUE])
        if f % 2:
            boxes, feats = boxes[::-1].copy(), feats[::-1].copy()
        out = trk.update(boxes, np.array([0.9, 0.9], np.float32), feats)
        for tid, box, _, di in out:
            ids["orange" if feats[di] @ ORANGE > 0.9 else "blue"].add(tid)
    return ids


def test_tracker_keeps_identities_through_crossing():
    ids = _run_crossing(gate=0.30)
    assert len(ids["orange"]) == 1 and len(ids["blue"]) == 1
    assert ids["orange"] != ids["blue"]


def test_tracker_compensates_camera_pan():
    trk = PlayerTracker(fps=10)
    tids = set()
    for f in range(20):
        # The player stands still on the pitch; the camera pans 60 px per frame.
        x = 500 - 60 * f
        warp = np.array([[1, 0, -60], [0, 1, 0]], np.float64) if f else None
        out = trk.update(np.array([[x, 100, x + 30, 160]], np.float32), np.array([0.9], np.float32),
                         ORANGE[None], warp)
        tids |= {t for t, *_ in out}
    assert len(tids) == 1


def test_purify_splits_a_colour_swap():
    rows, sigs = [], []
    for f in range(20):
        sigs.append(ORANGE if f < 10 else BLUE)
        rows.append([f, f / 10, 7, 0, 0, 10, 20, 0.9, f])
    R = purify(np.array(rows, np.float64), np.array(sigs, np.float32))
    assert len(set(R[:10, 2])) == 1 and len(set(R[10:, 2])) == 1
    assert R[0, 2] != R[-1, 2]


# ------------------------------------------------------------------ identity
def _tracklet(tid, t0, t1, x0, x1, kit=0.6, h=80.0, sig=ORANGE):
    return {"tid": tid, "t0": t0, "t1": t1, "n": int(round((t1 - t0) * 10)) + 1, "h_med": h, "h_max": h,
            "score": 0.9, "segment": 1, "sig": sig, "emb": None, "n_emb": 0, "kit1": kit, "kit2": 0.0,
            "crops": [], "p_start": [x0, 500.0, h], "p_end": [x1, 500.0, h]}


def _rows_for(summary):
    rows, by_tid = [], {}
    for s in summary:
        ix = []
        for k, t in enumerate(np.arange(s["t0"], s["t1"] + 1e-6, 0.1)):
            x = s["p_start"][0] + (s["p_end"][0] - s["p_start"][0]) * (t - s["t0"]) / max(s["t1"] - s["t0"], 1e-6)
            ix.append(len(rows))
            rows.append([round(t * 10), t, s["tid"], x - 20, 420, x + 20, 500, 0.9, len(rows)])
        by_tid[s["tid"]] = np.array(ix)
    return np.array(rows, np.float64), by_tid


def test_identity_links_number_seed_and_excludes_other_numbers():
    summary = [
        _tracklet(1, 0.0, 5.0, 100, 300),          # reads #20
        _tracklet(2, 5.2, 12.0, 305, 500),         # continues right where #1 ended
        _tracklet(3, 5.2, 12.0, 900, 1100),        # a team-mate far away at the same time
        _tracklet(4, 20.0, 30.0, 600, 700),        # reads #17
        _tracklet(5, 0.0, 10.0, 100, 200, kit=0.0, sig=BLUE),  # opponent
    ]
    reads = {1: [(1, "20", 0.99, "shorts"), (3, "20", 0.98, "shirt")], 4: [(201, "17", 0.99, "shirt")] * 2}
    rows, by_tid = _rows_for(summary)
    res = I.resolve_identity(summary, reads, I.Target("20", "orange"), 10.0, rows, by_tid)
    chosen = {summary[k]["tid"] for k in res.chosen}
    assert 1 in chosen and 2 in chosen
    assert 3 not in chosen and 4 not in chosen and 5 not in chosen
    assert summary[3]["tid"] in {summary[k]["tid"] for k in res.excluded}


def test_identity_never_jumps_impossible_distance():
    summary = [_tracklet(1, 0.0, 5.0, 100, 120), _tracklet(2, 5.1, 9.0, 5000, 5020)]
    reads = {1: [(1, "20", 0.99, "shirt")], 2: [(60, "20", 0.99, "shirt")]}
    rows, by_tid = _rows_for(summary)
    assert I._transition(0, 1, np.array([0, 5.1]), np.array([5.0, 9.0]), np.array([1, 1]),
                         np.array([s["p_start"] for s in summary]), np.array([s["p_end"] for s in summary]), 10) == -np.inf
    res = I.resolve_identity(summary, reads, I.Target("20", "orange"), 10.0, rows, by_tid)
    assert len(res.chosen) == 1  # both can't be the same player 0.1 s apart and 60 body-heights away


def test_user_feedback_overrides():
    summary = [_tracklet(1, 0.0, 6.0, 100, 300), _tracklet(2, 0.0, 6.0, 900, 1000)]
    rows, by_tid = _rows_for(summary)
    yes = I.Target("20", "orange", anchors=[(3.0, 950.0, 460.0)])
    res = I.resolve_identity(summary, {}, yes, 10.0, rows, by_tid)
    assert [summary[k]["tid"] for k in res.chosen] == [2]
    no = I.Target("20", "orange", anchors=[(3.0, 950.0, 460.0)], rejects=[(3.0, 200.0, 460.0)])
    res = I.resolve_identity(summary, {}, no, 10.0, rows, by_tid)
    assert summary[0]["tid"] not in {summary[k]["tid"] for k in res.chosen}


def test_single_digit_partial_reads_are_ignored_for_two_digit_target():
    tw, ow, nt, no, top = I.number_votes([(1, "1", 0.99, "shirt"), (2, "7", 0.99, "shirt")], "20")
    assert (nt, no) == (0, 0)


# ------------------------------------------------------------------ stats
def _timeline(n=100, fps=10.0, px_per_frame=6.0, h=180.0):
    t = np.arange(n) / fps
    x = 500 + px_per_frame * np.arange(n)
    boxes = np.stack([x - 30, np.full(n, 400.0), x + 30, np.full(n, 400.0 + h)], 1)
    pano = np.stack([x, np.full(n, 400.0 + h), np.full(n, h)], 1)
    return Timeline(np.arange(n), t, np.ones(n, bool), boxes, pano, np.ones(n, int), np.ones(n),
                    np.array(["number"] * n, dtype=object), np.zeros(n, bool))


def test_speed_estimate_matches_lateral_motion():
    # 6 px/frame at 10 fps, player 180 px tall at a known focal length -> expected speed.
    tl = _timeline()
    f = 960 / np.tan(np.radians(32.5))
    z = f * 1.8 / 180.0
    expected = 6 * 10 * z / f
    v = speeds(tl, 10.0)
    assert np.nanmedian(v[10:-10]) == pytest.approx(expected, rel=0.1)


def test_compute_stats_counts_ball_involvement():
    tl = _timeline(n=60, px_per_frame=0.0)
    balls = [[f, f / 10, 520, 560, 540, 580, 0.9] for f in range(20, 30)]
    D = SimpleNamespace(balls=np.array(balls, np.float64), width=1920)
    T = SimpleNamespace(rows=np.zeros((0, 9)), summary=[])
    res = SimpleNamespace(chosen=[], evidence={})
    st = compute_stats(D, T, tl, 10.0, res)
    assert st["ballInvolvements"] == 1
    assert st["visibleSec"] == pytest.approx(6.0)
    assert st["sprints"] == 0


# ------------------------------------------------------------------ cli / report
def test_cli_helpers():
    assert parse_clock("4:02") == 242
    assert parse_clock("1:00:00") == 3600
    assert merge_windows([(5, 8), (7, 10), (20, 22)], max_total=100) == [(5, 10), (20, 22)]
    assert merge_windows([(0, 50), (60, 120)], max_total=80) == [(0, 50)]


def test_report_is_written(tmp_path):
    tl = _timeline(n=50)
    D = SimpleNamespace(balls=np.zeros((0, 7)), width=1920)
    st = compute_stats(D, SimpleNamespace(rows=np.zeros((0, 9)), summary=[]), tl, 10.0,
                       SimpleNamespace(chosen=[], evidence={}))
    st.pop("speed")
    result = {"target": {"number": "20", "kit": "orange", "kit2": "white"}, "stats": st, "reviewQuestions": []}
    out = tmp_path / "report.html"
    write_report(str(out), json.loads(json.dumps(result, default=float)),
                 {"times": tl.times, "present": tl.present, "evidence": tl.evidence.astype(str)})
    html = out.read_text(encoding="utf-8")
    assert "Player tracking" in html and "#20" in html
