"""5.3 candidate: mutual track exchanges at a partial-overlap crossing (crossings.exchange_rows, SCOUTX_EXCHANGE_SPLIT).

Verified failure (IMG_4809 244.4 s, HDR-reference decode): track A missed one frame and resumed on #20's detection while
#20's own track continued onto A; the steal rule needs the victim's track to pause and the contact rule needs a 50 %
box cover, so neither cut the tracks, and one correct #20 read confirmed A for 1.5 s before the exchange."""
import json
import os
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest

from scoutx_tracker import crossings
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bench"))
from scoutx_tracker.crossings import exchange_rows, split_at_contacts, steal_rows  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
REPLAY = ROOT / "bench" / "results" / "5.3" / "wrong-player-20261102" / "replays" / "reference_i0225"


def _rows(tracks):
    out = []
    for tid, rs in tracks.items():
        for f, *b in rs:
            out.append([f, f / 10.0, tid, *b, 0.9, 0])
    R = np.array(out, float)
    R[:, 8] = np.arange(len(R))
    return R


def _exchange_scene():
    """A (tid 1) runs right, B (tid 2) runs left towards it. A has no row at frame 20 and on frame 21 resumes exactly
    on B's motion-extrapolated box; B's own row on frame 21 lands elsewhere (on A's side). Boxes never cover each
    other by CONTACT_COVER, as at 244.4 s."""
    A = [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(20)]                    # frame 19: 290..350
    B = [(f, 560 - 10 * f, 100, 620 - 10 * f, 300) for f in range(21)]                    # frame 20: 360..420
    A += [(f, 350 - 10 * (f - 21), 100, 410 - 10 * (f - 21), 300) for f in range(21, 25)]  # = B's path
    B += [(f, 240 + 10 * (f - 21), 100, 300 + 10 * (f - 21), 300) for f in range(21, 25)]  # A's side
    return _rows({1: A, 2: B})


def _sigs(R, a, b):
    """Person A's look on A's rows before the exchange and on B's rows after it; person B's look otherwise."""
    s = np.zeros((len(R), 80), np.float32)
    for i, r in enumerate(R):
        first = r[0] <= 20
        s[i] = a if (r[2] == 1) == first else b
    return s


def test_exchange_detected_where_the_steal_rule_cannot_see_it():
    R = _exchange_scene()
    kit = np.full(len(R), 0.8)
    assert steal_rows(R, kit) == []                                       # the victim (B) never paused
    ex = exchange_rows(R, kit)
    cut = sorted((int(R[b, 2]), int(R[b, 0])) for b, _ in ex)
    assert cut == [(1, 21), (2, 21)]                                      # both tracks are cut at the exchange
    others = {int(R[b, 2]): (int(R[q, 2]), int(R[q, 0])) for b, q in ex}
    assert others == {1: (2, 20), 2: (1, 19)}


def test_no_exchange_for_valid_continuations_occlusion_small_or_other_kit_players():
    kit = lambda R: np.full(len(R), 0.8)                                  # noqa: E731
    # two team-mates pass each other, each track keeps its own player
    R = _rows({1: [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(40)],
               2: [(f, 500 - 10 * f, 400, 560 - 10 * f, 600) for f in range(40)]})
    assert exchange_rows(R, kit(R)) == []
    # temporary occlusion: A is missing for two frames and resumes on its own extrapolated path
    A = [(f, 100 + 10 * f, 100, 160 + 10 * f, 300) for f in range(40) if f not in (19, 20)]
    R = _rows({1: A, 2: [(f, 600, 100, 660, 300) for f in range(40)]})
    assert exchange_rows(R, kit(R)) == []
    # small, distant players far apart
    R = _rows({1: [(f, 100 + 2 * f, 50, 112 + 2 * f, 80) for f in range(40)],
               2: [(f, 900 - 2 * f, 50, 912 - 2 * f, 80) for f in range(40)]})
    assert exchange_rows(R, kit(R)) == []
    # an opponent is never a team-mate whose box can be exchanged
    R = _exchange_scene()
    assert exchange_rows(R, np.where(R[:, 2] == 2, 0.0, 0.8)) == []
    # contact frames are contacts, handled by the contact rule
    assert exchange_rows(R, kit(R), skip=np.ones(len(R), bool)) == []


@pytest.fixture
def exchange_on(monkeypatch):
    monkeypatch.setattr(crossings, "EXCHANGE_SPLIT", True)


def test_flag_off_keeps_the_baseline_tracks(monkeypatch):
    monkeypatch.setattr(crossings, "EXCHANGE_SPLIT", False)
    R = _exchange_scene()
    a = np.zeros(80, np.float32); a[0] = 1.0
    cs = split_at_contacts(R, np.full(len(R), 0.8), _sigs(R, a, a), R[:, 1], 10.0)
    assert cs.steals == 0 and sorted(np.unique(cs.rows[:, 2]).astype(int)) == [1, 2]


def test_identity_does_not_cross_an_exchange_when_appearance_cannot_tell(exchange_on):
    R = _exchange_scene()
    a = np.zeros(80, np.float32); a[0] = 1.0
    cs = split_at_contacts(R, np.full(len(R), 0.8), _sigs(R, a, a), R[:, 1], 10.0)
    assert cs.steals == 2 and len(np.unique(cs.rows[:, 2])) == 4
    posts = {int(cs.rows[(cs.rows[:, 0] == 21) & (cs.rows[:, 3] == x)][0, 2]) for x in (350, 240)}
    lk = [x for x in cs.links if x.post in posts]
    assert lk and all(not x.clear for x in lk)                             # unrelated player inherits nothing


def test_identity_follows_the_person_through_an_exchange_when_appearance_decides(exchange_on):
    R = _exchange_scene()
    a = np.zeros(80, np.float32); a[:20] = 1.0
    b = np.zeros(80, np.float32); b[20:] = 1.0
    cs = split_at_contacts(R, np.full(len(R), 0.8), _sigs(R, a, b), R[:, 1], 10.0)
    post_a_track = int(cs.rows[(cs.rows[:, 0] == 21) & (cs.rows[:, 3] == 350)][0, 2])   # A's track, now person B
    by = {x.decision: x for x in cs.links if x.post == post_a_track}
    assert by["swap"].clear and by["swap"].pre == 2                          # B's identity follows B
    assert not by["unclear"].clear and by["unclear"].pre == 1                 # A's identity does not pass the jump


def _replay(tmp_path, flag):
    env = {**os.environ, "SCOUTX_EXCHANGE_SPLIT": flag, "SCOUTX_RESUME_SPLIT": "0", "SCOUTX_OCR_CONSULTED_ONLY": "0", "SCOUTX_APPEARANCE_ONLY_LIKELY": "1", "PYTHONHASHSEED": "0"}
    out = tmp_path / f"x{flag}"
    subprocess.run([sys.executable, str(ROOT / "bench" / "regression_replay.py"), "run", "--replay", str(REPLAY),
                    "--out", str(out)], env=env, cwd=ROOT, check=True, capture_output=True)
    with np.load(out / "automatic" / "timeline.npz") as z:
        return {k: z[k].copy() for k in ("present", "states", "evidence", "boxes")}, json.loads((out / "replay_run.json").read_text())


@pytest.mark.skipif(not REPLAY.exists(), reason="regression replay artifacts not present")
def test_regression_replay_244s_wrong_player_confirmation(tmp_path):
    # window-local frames 176-191 (242.6-244.1 s): another orange player (labels N; visually confirmed) on the track
    # that took #20's detection at frame 194; frame 194 carries the only "20" read.
    other = [176, 177, 178, 179, 180, 181, 182, 184, 185, 186, 189, 190, 191]
    base, rec = _replay(tmp_path, "0")
    assert all(rec["matchesOriginal"][k] for k in ("present", "states", "evidence"))   # the faulty baseline
    assert all(str(base["states"][f]) == "CONFIRMED_VISIBLE" and str(base["evidence"][f]) == "number" for f in other)
    cand, _ = _replay(tmp_path, "1")
    assert not any(str(cand["states"][f]) == "CONFIRMED_VISIBLE" for f in other)
    ref = {f: base["boxes"][f] for f in other}                               # the other player's boxes
    from pp_bench import iou  # noqa: PLC0415
    assert all(not cand["present"][f] or iou(cand["boxes"][f], ref[f]) < 0.3 for f in other)
    # the legitimate single read still confirms #20 on the frame it was read
    assert str(cand["states"][194]) == "CONFIRMED_VISIBLE" and str(cand["evidence"][194]) == "number"
