"""Appearance-feature isolation (5.3 CPU-divergence follow-up). Local, bench-only; no inference change.

Recomputes the two pixel-derived appearance fields of a stage-1 `detections.npz` - colour signatures (`sigs`,
features.colour_signature) and grid embeddings (`embs`, features.GridEmbedder) - for FIXED detection boxes, from
frames decoded by an explicitly named path, exactly as extract.consume computes them (same box values as float32,
same per-frame order, float16 storage, same embedding selection rule). Then writes stage-1 variants that differ from
a base only in the chosen field(s).

    python bench/appearance_features.py extract --dets <detections.npz> --meta <meta.json> --video V \
        --decoder {cv2,ffmpeg-bt601} --probe <decode probe JSON with expected hashes> --out feats.npz
    python bench/appearance_features.py build --base <stage1 chunk dir> --sigs feats_a.npz --embs feats_b.npz --out <dir>

Unchanged in every variant (copied byte-for-byte from the base): dets (boxes, scores, frame, time, order), emb_idx,
balls, ball_warm, warps, cuts, times, grass, propagated, meta.json and the OCR crop files. Pixel-derived fields
that are NOT swapped and therefore stay at the base decode: grass, warps/cuts (camera motion), ball_warm, OCR crops.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

BT601_VF = "scale=in_color_matrix=bt601:in_range=tv"
FIELDS = ("dets", "sigs", "emb_idx", "embs", "balls", "ball_warm", "warps", "cuts", "times", "grass", "propagated")


def frames(video: str, first: int, count: int, decoder: str):
    """Yields (source frame index, BGR frame) for first..first+count-1."""
    if decoder == "cv2":
        import cv2  # noqa: PLC0415

        cap = cv2.VideoCapture(video)
        cap.set(cv2.CAP_PROP_POS_FRAMES, first)
        try:
            for _ in range(count):
                ok, f = cap.read()
                if not ok:
                    return
                yield round(cap.get(cv2.CAP_PROP_POS_FRAMES)) - 1, f
        finally:
            cap.release()
    elif decoder == "ffmpeg-bt601":
        info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                               "stream=width,height,r_frame_rate", "-of", "csv=p=0", video],
                              capture_output=True, text=True, check=True).stdout.strip().split(",")
        w, h = int(info[0]), int(info[1])
        num, den = info[2].split("/")
        fps = float(num) / float(den)
        p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{first / fps:.6f}", "-i", video, "-frames:v", str(count),
                              "-vf", BT601_VF, "-pix_fmt", "bgr24", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
        try:
            for k in range(first, first + count):
                b = p.stdout.read(w * h * 3)
                if len(b) < w * h * 3:
                    return
                yield k, np.frombuffer(b, np.uint8).reshape(h, w, 3)
        finally:
            p.stdout.close()
            p.wait()
    else:
        raise ValueError(decoder)


def embedding_selection(dets: np.ndarray) -> np.ndarray:
    """extract.consume: embeddings for detections on even frames with box height >= 36 and score >= 0.25."""
    b = dets[:, 2:6].astype(np.float32)
    h = b[:, 3] - b[:, 1]
    s = dets[:, 6].astype(np.float32)
    fi = dets[:, 0].astype(np.int64)
    return np.where((fi % 2 == 0) & (h >= 36) & (s >= 0.25))[0]


def recompute(dets: np.ndarray, emb_idx: np.ndarray, frame_iter, first_source_frame: int) -> dict:
    from scoutx_tracker.features import EMB_DIM, SIG_DIM, GridEmbedder, colour_signature  # noqa: PLC0415

    if not np.array_equal(embedding_selection(dets), np.sort(emb_idx)) or not np.all(np.diff(emb_idx) > 0):
        raise ValueError("saved emb_idx is not the extract.consume selection for these boxes")
    sigs = np.zeros((len(dets), SIG_DIM), np.float16)
    embs = np.zeros((len(emb_idx), EMB_DIM), np.float16)
    emb_row = {int(d): r for r, d in enumerate(emb_idx)}
    grid = GridEmbedder()
    hashes, seen = {}, set()
    by_frame = {}
    for i, f in enumerate(dets[:, 0].astype(np.int64)):
        by_frame.setdefault(int(f), []).append(i)
    for k, frame in frame_iter:
        fi = k - first_source_frame
        hashes[str(k)] = hashlib.sha256(np.ascontiguousarray(frame).tobytes()).hexdigest()
        ix = by_frame.get(fi, [])
        if not ix:
            seen.add(fi)
            continue
        pb = dets[ix, 2:6].astype(np.float32)          # the detector's float32 boxes, as in consume()
        for j, b in zip(ix, pb):
            sig, _ = colour_signature(frame, b)
            sigs[j] = sig.astype(np.float16)
        want = [n for n, j in enumerate(ix) if j in emb_row]
        if want:
            for n, e in zip(want, grid(frame, pb[want])):
                embs[emb_row[ix[n]]] = e.astype(np.float16)
        seen.add(fi)
    missing = sorted(set(by_frame) - seen)
    if missing:
        raise ValueError(f"frames without decoded pixels: {missing[:5]}")
    return {"sigs": sigs, "embs": embs, "hashes": hashes}


def field_diff(a: np.ndarray, b: np.ndarray) -> dict:
    d = np.abs(a.astype(np.float32) - b.astype(np.float32))
    return {"shape": list(a.shape), "identical": bool(np.array_equal(a, b)), "maxAbs": float(d.max()) if d.size else 0.0,
            "elementsDiffering": int((d > 0).sum()), "rowsDiffering": int((d.reshape(len(d), -1).max(1) > 0).sum()) if d.size else 0}


def build(base_chunk: Path, sigs_src: dict | None, embs_src: dict | None, out_chunk: Path,
          sig_frames: tuple[int, int] | None = None) -> dict:
    """Copy a stage-1 chunk, replacing only `sigs` and/or `embs`. Every other field is asserted unchanged.
    `sig_frames` (inclusive window frame range) limits the `sigs` replacement to detections on those frames."""
    if out_chunk.exists():
        raise ValueError("output exists; variants use fresh directories")
    with np.load(base_chunk / "detections.npz", allow_pickle=False) as z:
        base = {k: z[k].copy() for k in z.files}
    new = dict(base)
    if sigs_src is not None:
        if sigs_src["sigs"].shape != base["sigs"].shape or sigs_src["sigs"].dtype != base["sigs"].dtype:
            raise ValueError("sigs shape/dtype differ")
        if sig_frames is None:
            new["sigs"] = sigs_src["sigs"]
        else:
            f = base["dets"][:, 0]
            m = (f >= sig_frames[0]) & (f <= sig_frames[1])
            new["sigs"] = np.where(m[:, None], sigs_src["sigs"], base["sigs"]).astype(base["sigs"].dtype)
    if embs_src is not None:
        if embs_src["embs"].shape != base["embs"].shape or embs_src["embs"].dtype != base["embs"].dtype:
            raise ValueError("embs shape/dtype differ")
        new["embs"] = embs_src["embs"]
    out_chunk.mkdir(parents=True)
    np.savez_compressed(out_chunk / "detections.npz", **new)
    shutil.copy2(base_chunk / "meta.json", out_chunk / "meta.json")
    if (base_chunk / "crops").exists():
        shutil.copytree(base_chunk / "crops", out_chunk / "crops")
    with np.load(out_chunk / "detections.npz", allow_pickle=False) as z:
        check = {k: z[k].copy() for k in z.files}
    unchanged = [k for k in base if k not in ("sigs", "embs")]
    for k in unchanged:
        if not np.array_equal(check[k], base[k]):
            raise AssertionError(f"field {k} changed")
    return {"unchangedFields": unchanged, "sigs": field_diff(check["sigs"], base["sigs"]),
            "embs": field_diff(check["embs"], base["embs"])}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("extract")
    e.add_argument("--dets", required=True)
    e.add_argument("--meta", required=True)
    e.add_argument("--video", required=True)
    e.add_argument("--decoder", choices=("cv2", "ffmpeg-bt601"), required=True)
    e.add_argument("--probe", help="decode probe JSON whose hashes the decoded frames must match")
    e.add_argument("--out", required=True)
    b = sub.add_parser("build")
    b.add_argument("--base", required=True)
    b.add_argument("--sigs")
    b.add_argument("--embs")
    b.add_argument("--sig-frames", nargs=2, type=int, help="replace sigs only on these window frames (inclusive)")
    b.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if a.cmd == "extract":
        meta = json.loads(Path(a.meta).read_text())
        with np.load(a.dets, allow_pickle=False) as z:
            dets, emb_idx = z["dets"].copy(), z["emb_idx"].copy()
        first = int(round(meta["start"] * meta["fps"]))
        r = recompute(dets, emb_idx, frames(a.video, first, int(meta["frames"]), a.decoder), first)
        probe = {}
        if a.probe:
            exp = json.loads(Path(a.probe).read_text())["hashes"]
            common = [k for k in r["hashes"] if k in exp]
            probe = {"framesCompared": len(common), "identical": sum(r["hashes"][k] == exp[k] for k in common)}
            if probe["identical"] != len(common) or not common:
                raise ValueError(f"decoded pixels do not match the probe: {probe}")
        np.savez_compressed(a.out, sigs=r["sigs"], embs=r["embs"])
        Path(a.out).with_suffix(".json").write_text(json.dumps(
            {"decoder": a.decoder, "dets": a.dets, "firstSourceFrame": first, "frames": len(r["hashes"]),
             "probeCheck": probe, "frameHashes": r["hashes"]}, indent=1))
        print(json.dumps({"decoder": a.decoder, "frames": len(r["hashes"]), "probeCheck": probe}))
    else:
        load = lambda p: dict(np.load(p, allow_pickle=False)) if p else None  # noqa: E731
        rec = build(Path(a.base), load(a.sigs), load(a.embs), Path(a.out), tuple(a.sig_frames) if a.sig_frames else None)
        Path(a.out, "variant.json").write_text(json.dumps({"base": a.base, "sigsFrom": a.sigs, "embsFrom": a.embs,
                                                          "sigFrames": a.sig_frames, **rec}, indent=1))
        print(json.dumps(rec))
    return 0


if __name__ == "__main__":
    sys.exit(main())
