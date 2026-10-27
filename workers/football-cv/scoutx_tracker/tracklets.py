"""Stage 2 (fast): turn stored detections into tracklets and per-tracklet summaries.

Also builds "panorama" coordinates: the camera-motion chain maps every frame into the
coordinate system of the first frame of its shot, so positions before and after a gap can be
compared even though the phone panned in between.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .features import SIG_DIM, kit_score
from .tracker import PlayerTracker


@dataclass
class Detections:
    dets: np.ndarray       # (N,7) gframe, t, x1,y1,x2,y2, score
    sigs: np.ndarray       # (N,80)
    emb_idx: np.ndarray
    embs: np.ndarray
    balls: np.ndarray      # (B,7) gframe, t, box, score
    warps: np.ndarray      # (F,7)
    times: np.ndarray      # (F,)
    segment: np.ndarray    # (F,) shot id per frame
    crops: dict = field(default_factory=dict)  # det index -> crop path
    fps: float = 10.0
    sources: list = field(default_factory=list)  # (video, first global frame, n frames, start offset s)
    width: int = 1920
    height: int = 1080
    grass: np.ndarray | None = None  # (F,) pitch-green share per frame
    ball_warm: np.ndarray | None = None  # (B,) 5.0 warm-colour share per ball box (NaN = not measured)


def load_runs(run_dirs: list[str]) -> Detections:
    """Concatenate one or more stage-1 outputs (e.g. video chunks) in time order."""
    parts = []
    for d in run_dirs:
        meta = json.loads((Path(d) / "meta.json").read_text())
        z = np.load(Path(d) / "detections.npz")
        parts.append((meta, z, Path(d)))
    parts.sort(key=lambda p: p[0]["t0"] + p[0]["start"])
    D, S, EI, E, B, W, T, SEG, crops, sources, G, BW = [], [], [], [], [], [], [], [], {}, [], [], []
    foff = doff = 0
    seg = 0
    fps, width, height = parts[0][0]["fps"], parts[0][0].get("width") or 1920, parts[0][0].get("height") or 1080
    for meta, z, path in parts:
        n_f = int(meta["frames"])
        dets = z["dets"].copy()
        dets[:, 0] += foff
        balls = z["balls"].copy()
        balls[:, 0] += foff
        segs = np.zeros(n_f, np.int64)
        cuts = set(int(c) for c in z["cuts"])
        for f in range(n_f):
            if f == 0 or f in cuts:
                seg += 1
            segs[f] = seg
        for p in (path / "crops").glob("*.jpg"):
            fr, di = p.stem.split("_")
            crops[int(di) + doff] = str(p)
        D.append(dets); S.append(z["sigs"]); EI.append(z["emb_idx"] + doff); E.append(z["embs"])
        B.append(balls); W.append(z["warps"]); T.append(z["times"]); SEG.append(segs)
        BW.append(z["ball_warm"].astype(np.float32) if "ball_warm" in z.files and len(z["ball_warm"]) == len(balls)
                  else np.full(len(balls), np.nan, np.float32))
        if "grass" in z.files:
            G.append(z["grass"].astype(np.float32))
        elif (path / "scene.npz").exists():
            G.append(np.load(path / "scene.npz")["grass"].astype(np.float32))
        else:
            G.append(np.full(n_f, np.nan, np.float32))
        sources.append((meta["video"], foff, n_f, float(meta.get("start", 0.0))))
        foff += n_f
        doff += len(dets)
    det = Detections(np.concatenate(D), np.concatenate(S).astype(np.float32), np.concatenate(EI),
                     np.concatenate(E), np.concatenate(B), np.concatenate(W), np.concatenate(T),
                     np.concatenate(SEG), crops, fps, sources, width, height)
    det.grass = np.concatenate(G)
    det.ball_warm = np.concatenate(BW) if BW else np.zeros(0, np.float32)
    return det


def panorama_transforms(warps: np.ndarray, segment: np.ndarray) -> np.ndarray:
    """(F,3,3) maps image coords of frame f -> coords of the first frame of its shot."""
    F = len(warps)
    out = np.zeros((F, 3, 3))
    M = np.eye(3)  # ref -> cur
    for f in range(F):
        if f == 0 or segment[f] != segment[f - 1]:
            M = np.eye(3)
        else:
            W = np.eye(3)
            W[:2] = warps[f, :6].reshape(2, 3)
            if warps[f, 6] < 0.15:  # unreliable estimate: assume no motion rather than a wild jump
                W = np.eye(3)
            M = W @ M
        out[f] = np.linalg.inv(M)
    return out


def to_pano(P: np.ndarray, x: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """P (n,3,3) per point; returns pano x, y and the local scale factor."""
    px = P[:, 0, 0] * x + P[:, 0, 1] * y + P[:, 0, 2]
    py = P[:, 1, 0] * x + P[:, 1, 1] * y + P[:, 1, 2]
    scale = np.sqrt(np.abs(P[:, 0, 0] * P[:, 1, 1] - P[:, 0, 1] * P[:, 1, 0]))
    return px, py, scale


def _shirt_parts(sigs: np.ndarray) -> np.ndarray:
    P = sigs[:, 20:40].astype(np.float32)
    return P / np.maximum(np.linalg.norm(P, axis=1, keepdims=True), 1e-9)


def purify(R: np.ndarray, sigs: np.ndarray, w: int = 4, thresh: float = 0.32) -> np.ndarray:
    """Split tracklets where the shirt colour changes for good (an identity swap the online
    tracker let through, e.g. two players crossing). Each piece gets a new id."""
    R = R.copy()
    next_id = int(R[:, 2].max()) + 1 if len(R) else 1
    order = np.lexsort((R[:, 0], R[:, 2]))
    tids, first = np.unique(R[order, 2], return_index=True)
    bounds = list(first) + [len(order)]
    for k in range(len(tids)):
        ix = order[bounds[k]:bounds[k + 1]]
        if len(ix) < 2 * w + 1:
            continue
        S = _shirt_parts(sigs[R[ix, 8].astype(int)])
        cs = np.cumsum(np.vstack([np.zeros((1, S.shape[1])), S]), 0)
        cuts = []
        i = w
        while i <= len(ix) - w:
            left = (cs[i] - cs[i - w]) / w
            right = (cs[i + w] - cs[i]) / w
            d = 1 - float(left @ right / max(np.linalg.norm(left) * np.linalg.norm(right), 1e-9))
            if d > thresh:
                # refine to the best split point nearby
                best, bd = i, d
                for j in range(i + 1, min(i + w, len(ix) - w + 1)):
                    l2 = (cs[j] - cs[j - w]) / w
                    r2 = (cs[j + w] - cs[j]) / w
                    dj = 1 - float(l2 @ r2 / max(np.linalg.norm(l2) * np.linalg.norm(r2), 1e-9))
                    if dj > bd:
                        best, bd = j, dj
                cuts.append(best)
                i = best + w
            else:
                i += 1
        for a, b in zip(cuts, cuts[1:] + [len(ix)]):
            R[ix[a:b], 2] = next_id
            next_id += 1
    return R


@dataclass
class Tracklets:
    rows: np.ndarray        # (R, 9) gframe, t, tid, x1,y1,x2,y2, score, det_idx
    pano: np.ndarray        # (R, 3) foot x, y in shot panorama coords, box height in pano units
    summary: list[dict]     # one dict per tracklet
    by_tid: dict            # tid -> row indices (sorted by frame)
    number_splits: int = 0  # tracklets split because of conflicting shirt-number reads


# A lone digit that cannot belong to a two-digit number read on the same tracklet splits it.
# Measured on IMG_4809: OCR misreads a lone digit even at confidence 1.0 (a "4" on #20's shirt),
# so splitting on one lone digit broke a correct track. Off: lone conflicting digits instead bound
# how far hard evidence reaches (identity.conflict_times / stats.build_timeline).
SPLIT_ON_DIGIT_CONFLICT = False
# Bump whenever tracklet building/splitting changes: it is part of the tracklet cache key.
TRACKLET_ALGO_VERSION = "3.2" if SPLIT_ON_DIGIT_CONFLICT else "3.1"


def compatible(a: str, b: str) -> bool:
    """Two number reads can come from the same shirt (a partial read is a substring)."""
    return a == b or (len(a) != len(b) and (a in b or b in a))


def split_on_number_conflicts(R: np.ndarray, sigs: np.ndarray, det_reads: dict[int, str]) -> tuple[np.ndarray, int]:
    """Split tracklets carrying incompatible shirt-number reads (e.g. "4"/"24" then "20"): an
    identity swap between team-mates that colour purification cannot see. The cut is placed at
    the largest shirt-colour change between the two conflicting reads (or midway)."""
    R = R.copy()
    next_id = int(R[:, 2].max()) + 1 if len(R) else 1
    splits = 0
    changed = True
    while changed:
        changed = False
        order = np.lexsort((R[:, 0], R[:, 2]))
        tids, first = np.unique(R[order, 2], return_index=True)
        bounds = list(first) + [len(order)]
        for k in range(len(tids)):
            ix = order[bounds[k]:bounds[k + 1]]
            reads = [(p, det_reads[int(R[r, 8])]) for p, r in enumerate(ix) if int(R[r, 8]) in det_reads]
            # A single-digit read is often half of a two-digit number or noise: it counts when the
            # same digit was read at least twice, or when it cannot be part of a two-digit number
            # read on this same tracklet ("20" ... "4": the "4" belongs to somebody else). Splitting
            # is the safe direction - a missed split lets hard evidence leak onto a team-mate.
            counts: dict[str, int] = {}
            for _, n_ in reads:
                counts[n_] = counts.get(n_, 0) + 1
            full = {n_ for _, n_ in reads if len(n_) >= 2}
            reads = [(p, n_) for p, n_ in reads
                     if len(n_) >= 2 or counts[n_] >= 2
                     or (SPLIT_ON_DIGIT_CONFLICT and any(not compatible(n_, f) for f in full))]
            cut = None
            for (pa, na), (pb, nb) in zip(reads, reads[1:]):
                if not compatible(na, nb) and pb - pa >= 1:
                    S = _shirt_parts(sigs[R[ix[pa:pb + 1], 8].astype(int)])
                    if len(S) >= 3:
                        d = 1 - np.sum(S[1:] * S[:-1], axis=1)
                        cut = pa + 1 + int(np.argmax(d))
                    else:
                        cut = pa + 1 + (pb - pa) // 2
                    break
            if cut is not None:
                R[ix[cut:], 2] = next_id
                next_id += 1
                splits += 1
                changed = True
                break
    return R, splits


def track_rows(D: Detections) -> np.ndarray:
    """The expensive part (frame-by-frame tracking + colour purification). Depends only on stage-1
    output, so it is computed once per match and reused by every correction."""
    trk = PlayerTracker(fps=D.fps)
    F = len(D.times)
    order = np.argsort(D.dets[:, 0], kind="stable")
    frames = D.dets[order, 0].astype(int)
    starts = np.searchsorted(frames, np.arange(F))
    ends = np.searchsorted(frames, np.arange(F), side="right")
    rows = []
    for f in range(F):
        if f > 0 and D.segment[f] != D.segment[f - 1]:
            trk.reset()
        idx = order[starts[f]:ends[f]]
        boxes = D.dets[idx, 2:6].astype(np.float32)
        scores = D.dets[idx, 6].astype(np.float32)
        feats = D.sigs[idx] if len(idx) else None
        warp = D.warps[f, :6].reshape(2, 3) if D.warps[f, 6] >= 0.15 else None
        for tid, box, sc, di in trk.update(boxes, scores, feats, warp, f):
            rows.append([f, D.times[f], tid, *box, sc, idx[di]])
    R = np.array(rows, np.float64).reshape(-1, 9)
    return purify(R, D.sigs)


def build_tracklets(D: Detections, kit_primary: str = "", kit_secondary: str = "",
                    det_reads: dict[int, str] | None = None, rows: np.ndarray | None = None) -> Tracklets:
    return assemble(D, track_rows(D) if rows is None else rows, kit_primary, kit_secondary, det_reads)


def assemble(D: Detections, R: np.ndarray, kit_primary: str = "", kit_secondary: str = "",
             det_reads: dict[int, str] | None = None) -> Tracklets:
    """Cheap part: number-conflict splits, panorama coordinates and per-tracklet summaries."""
    splits = 0
    if det_reads:
        R, splits = split_on_number_conflicts(R, D.sigs, det_reads)
    P = panorama_transforms(D.warps, D.segment)
    fr = R[:, 0].astype(int)
    fx = (R[:, 3] + R[:, 5]) / 2
    fy = R[:, 6]
    px, py, sc = to_pano(P[fr], fx, fy)
    pano = np.stack([px, py, (R[:, 6] - R[:, 4]) * sc], 1)

    emb_of = {int(i): k for k, i in enumerate(D.emb_idx)}
    by_tid: dict[int, np.ndarray] = {}
    order = np.lexsort((R[:, 0], R[:, 2]))
    tids, first = np.unique(R[order, 2], return_index=True)
    bounds = list(first) + [len(order)]
    summary = []
    for k, tid in enumerate(tids):
        ix = order[bounds[k]:bounds[k + 1]]
        by_tid[int(tid)] = ix
        di = R[ix, 8].astype(int)
        h = R[ix, 6] - R[ix, 4]
        w = np.clip(R[ix, 7], 0.1, 1) * np.clip(h, 10, 200)
        sig = (D.sigs[di] * w[:, None]).sum(0)
        sig /= max(np.linalg.norm(sig), 1e-9)
        e_rows = [emb_of[d] for d in di if d in emb_of]
        emb = None
        if e_rows:
            emb = D.embs[e_rows].astype(np.float32).mean(0)
            emb /= max(np.linalg.norm(emb), 1e-9)
        summary.append({
            "tid": int(tid), "f0": int(R[ix[0], 0]), "f1": int(R[ix[-1], 0]), "t0": float(R[ix[0], 1]),
            "t1": float(R[ix[-1], 1]), "n": int(len(ix)), "h_med": float(np.median(h)), "h_max": float(h.max()),
            "score": float(np.mean(R[ix, 7])), "segment": int(D.segment[int(R[ix[0], 0])]),
            "sig": sig.astype(np.float32), "emb": emb, "n_emb": len(e_rows),
            "kit1": float(kit_score(sig, kit_primary)) if kit_primary else 0.0,
            "kit2": float(kit_score(sig, kit_secondary)) if kit_secondary else 0.0,
            "crops": [D.crops[d] for d in di if d in D.crops],
            # Crop file heights follow the box (+5 % top pad): lets OCR selection skip image I/O.
            "crop_h": [float(hh * 1.05) for d, hh in zip(di, h) if d in D.crops],
            "p_start": pano[ix[0]].tolist(), "p_end": pano[ix[-1]].tolist(),
        })
    return Tracklets(R, pano, summary, by_tid, splits)


def tracklet_features(D: Detections, T: Tracklets, min_h: float = 36.0) -> dict[int, np.ndarray]:
    """Per-detection appearance vectors per tracklet for the per-match identity classifier.

    Only the body-region colour signature (x4) is used: the classifier reads columns 0-80, so the
    former CNN-embedding PCA (an SVD over all embeddings, ~9 s per correction on CPU) was computed
    and discarded. Rows: detections with a stored embedding (every 2nd frame) and box >= min_h px,
    exactly as before, so the classifier sees identical inputs."""
    R = T.rows
    has_emb = np.zeros(len(D.sigs), bool)
    has_emb[D.emb_idx.astype(int)] = True
    di = R[:, 8].astype(int)
    keep = has_emb[di] & (R[:, 6] - R[:, 4] >= min_h)
    sig4 = D.sigs.astype(np.float32) * 4.0
    out = {}
    for tid, ix in T.by_tid.items():
        sel = ix[keep[ix]]
        out[tid] = sig4[di[sel]].reshape(-1, sig4.shape[1])
    return out
