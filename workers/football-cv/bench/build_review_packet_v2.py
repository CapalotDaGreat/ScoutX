"""Build the v2 independent-review item list (public, neutral) and its private mapping (5.3). Bench-only.

    python bench/build_review_packet_v2.py --timeline <full-match baseline timeline.npz> \
        --b-timeline <candidate-B full-match timeline.npz> --out-public items_v2.json --out-private mapping_v2.json

Public items carry only neutral ids (R01...), source frames, boxes to judge and context frames - no category, run,
state, score, reason or expected answer. Item order is shuffled with a fixed seed. The private mapping records, per
item, why it is in the packet and what each version of the labels / runs says, for reconciliation AFTER the answers
are committed. Control items (known #20 with a legible number, known other players from the original labels) are
mixed in so that the selection itself does not suggest an answer.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CLAIM = ("CONFIRMED_VISIBLE", "LIKELY_VISIBLE")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--timeline", required=True)
    ap.add_argument("--b-timeline", required=True)
    ap.add_argument("--interval-runs", nargs=2, metavar=("DEFAULT_DIR", "REFERENCE_DIR"),
                    help="decoder_interval_eval output dirs (iXXXX/automatic/timeline.npz) for interval-run items")
    ap.add_argument("--out-public", required=True)
    ap.add_argument("--out-private", required=True)
    a = ap.parse_args(argv)
    gt = json.loads((HERE / "results" / "5.1" / "gt_img4809_intervals.json").read_text())
    corr = json.loads((HERE / "results" / "5.3" / "wrong-player-20261102" / "label_corrections_i0225.json").read_text())

    def claims(path, t0, t1, step=1):
        z = np.load(path)
        st = z["states"].astype(str)
        ix = [i for i in np.flatnonzero(np.isin(st, CLAIM) & (z["times"] >= t0 - 1e-6) & (z["times"] <= t1 + 1e-6))][::step]
        return {str(int(round(float(z["times"][i]) * 10))): [round(float(v), 1) for v in z["boxes"][i]] for i in ix}

    def label_boxes(frames, want=None):
        out = {}
        for f in frames:
            for j, lab in enumerate(gt["frames"].get(str(f), [])):
                if want is None or lab["label"] == want:
                    out.setdefault(str(f), []).append({"box": lab["box"], "origIndex": j, "orig": lab["label"]})
        return out

    items = []   # (public, private)

    def add_box(category, frames_boxes, context_pad=20, why="", private=None):
        fr = sorted(int(k) for k in frames_boxes)
        ctx = sorted(set(range(fr[0] - context_pad, fr[0], 5)) | set(range(fr[-1] + 5, fr[-1] + context_pad + 1, 5)))
        items.append(({"kind": "box", "boxes": frames_boxes, "contextFrames": ctx},
                      {"category": category, "why": why, **(private or {})}))

    # --- A: proposed label corrections (stage 1 blind; stage 2 asks about the proposals after answers are committed)
    lb = label_boxes(range(2441, 2465))
    items.append(({"kind": "labels", "frames": {k: [x["box"] for x in v] for k, v in lb.items()}, "contextFrames": []},
                  {"category": "label_corrections", "why": "proposed corrections C1-C8, reversed 2461 finding",
                   "originalLabels": {k: [x["orig"] for x in v] for k, v in lb.items()},
                   "proposedCorrections": corr["corrections"]}))
    # --- D's 16 unverified removed frames (with context)
    for t0, t1 in ((1378.6, 1379.8), (1387.2, 1387.2), (1584.4, 1585.1), (1943.9, 1943.9)):
        add_box("D_removed_unverified", claims(a.timeline, t0, t1), why="appearance-only LIKELY removed by candidate D")
    # --- crowded set piece: baseline path vs candidate-B path (two items, unnamed)
    add_box("setpiece_baseline_path", claims(a.timeline, 1188.3, 1191.6), why="crowded set piece, baseline claims")
    add_box("setpiece_B_path", claims(a.b_timeline, 1188.3, 1191.6), why="crowded set piece, candidate-B claims")
    # --- remaining wrong / unverified cases
    add_box("F6_claims", claims(a.timeline, 706.4, 716.4, 3), why="appearance-only claims judged #6 by the author")
    add_box("F17_claims", claims(a.timeline, 1301.6, 1305.7, 2), why="appearance-only claims on an N-labelled player")
    add_box("anchored_after_1180", claims(a.timeline, 1180.0, 1183.3, 4), why="anchored continuation after the labelled interval")
    add_box("claims_after_1955", claims(a.timeline, 1957.0, 1962.9, 6), why="anchored continuation after a confirmed read")
    # --- interval-run claims that are wrong, unmatched or unverified (incl. CONFIRMED unmatched on the HLG reference)
    if a.interval_runs:
        def iclaims(run_dir, start, t0, t1, state=None, step=1):
            z = np.load(Path(run_dir) / f"i{int(start):04d}" / "automatic" / "timeline.npz")
            st = z["states"].astype(str)
            ok = np.isin(st, CLAIM) if state is None else st == state
            ix = [i for i in np.flatnonzero(ok & (z["times"] + start >= t0 - 1e-6) & (z["times"] + start <= t1 + 1e-6))][::step]
            return {str(int(round((float(z["times"][i]) + start) * 10))): [round(float(v), 1) for v in z["boxes"][i]] for i in ix}
        dflt, ref = a.interval_runs
        add_box("E3_reference_appearance_claims", iclaims(ref, 225, 238.6, 239.9), why="HLG-reference appearance claims on N labels (E3)")
        add_box("reference_1295_confirmed_unmatched", iclaims(ref, 1295, 1301.3, 1304.3, "CONFIRMED_VISIBLE", 2),
                why="HLG-reference CONFIRMED claims, partly on unlabelled boxes")
        add_box("default_unmatched_claims", {**iclaims(dflt, 225, 240.0, 240.0), **iclaims(dflt, 225, 243.3, 243.3),
                                             **iclaims(dflt, 225, 244.4, 244.4)}, why="default unmatched claims at 225 s")
        add_box("default_unmatched_1159", iclaims(dflt, 1150, 1159.6, 1159.8), why="default unmatched claim at 1159.7 s")
    # --- controls (known answers)
    add_box("control_20_confirmed_1955", claims(a.timeline, 1955.3, 1955.7), why="'20' legible (control)")
    add_box("control_20_confirmed_241", claims(a.timeline, 241.6, 242.4, 2), why="confirmed by number reads (control)")
    n_boxes = {}
    for f in (11610, 11640, 12960, 13090, 18920):                       # N-labelled players in labelled intervals
        lab = next((x for x in gt["frames"].get(str(f), []) if x["label"] == "N"), None)
        if lab:
            n_boxes[str(f + 1)] = lab["box"]   # labels >= 1150 s are stamped 0.1 s early (verified): shown on frame k+1
    for f, b in n_boxes.items():
        add_box("control_other_player_N_label", {f: b}, why="original label N (control)")
    t_boxes = {}
    for f in (11530, 11700, 11760):                                     # T-labelled #20 in the 1150 s interval
        lab = next((x for x in gt["frames"].get(str(f), []) if x["label"] == "T"), None)
        if lab:
            t_boxes[str(f + 1)] = lab["box"]
    for f, b in t_boxes.items():
        add_box("control_20_T_label", {f: b}, why="original label T (control)")

    rng = random.Random(20261104)
    rng.shuffle(items)
    public, private = [], {}
    for i, (pub, priv) in enumerate(items, 1):
        rid = f"R{i:02d}"
        public.append({"id": rid, **pub})
        private[rid] = priv
    priv_blob = json.dumps(private, indent=1, default=float)
    Path(a.out_private).write_text(priv_blob)
    Path(a.out_public).write_text(json.dumps({
        "schema": "pitchproof.review-items.v2", "video": "IMG_4809_proxy_10fps.exact.mp4 (sha256 b1077af3...)",
        "privateMappingSha256": hashlib.sha256(priv_blob.encode()).hexdigest(),
        "disclosure": "Boxes come from labels or pipeline runs; nothing else (state, score, run, reason, expected answer) is shown. "
                      "Some items are controls with known answers.",
        "items": public}, indent=1, default=float))
    print(f"{len(public)} items; private mapping sha256 {hashlib.sha256(priv_blob.encode()).hexdigest()[:16]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
