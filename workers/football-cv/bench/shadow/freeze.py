"""Freeze one shadow-evaluation match BEFORE inference. Refuses without the owner's identity confirmation.

    python3 bench/shadow/freeze.py --group GROUP --identity identity.json --proxy P.mp4 --proxy-json P.json \
        --plan plan.json --difficult difficult_stretches.csv --tree /path/to/frozen/tree --weights DIR --out freeze.json \
        [--source SOURCE.MOV --mapping-check 8]      (source checks run on the owner PC, where the original is)

identity.json (written from the owner's own answer, never inferred):
  {"group": ..., "sourceFile": "IMG_xxxx.MOV", "sourceTimestampSec": 1234.5, "answer": "yes",
   "shirtNumber": "20", "kit": "orange", "scope": "this recording" | "until <time>" | "this timestamp only",
   "confirmedBy": "owner", "confirmedAt": "<ISO>", "how": "owner answered Qn in <file>"}
The record contains every hash and value the run and the scoring depend on; run_shadow.sh refuses to run if any
of them no longer matches. Freeze records are never overwritten.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import sample_plan  # noqa: E402

# Full flag values of the five predeclared configurations (docs/video/flag-and-candidate-names.md).
BASE_FLAGS = {"SCOUTX_OCR_CONSULTED_ONLY": "1", "SCOUTX_TELEPORT_SPLIT": "0", "SCOUTX_APPEARANCE_ONLY_LIKELY": "1",
              "SCOUTX_OCR_VARIANT": "binarised", "SCOUTX_INTERP_NO_UPGRADE": "0"}
CONFIGS = {
    "control_all_off": {},
    "teleport_split": {"SCOUTX_TELEPORT_SPLIT": "1"},
    "no_appearance_only_likely": {"SCOUTX_APPEARANCE_ONLY_LIKELY": "0"},
    "combined_number_reader": {"SCOUTX_OCR_VARIANT": "combined"},
    "candidate_tdc_plus_interp_no_upgrade": {"SCOUTX_TELEPORT_SPLIT": "1", "SCOUTX_APPEARANCE_ONLY_LIKELY": "0",
                                             "SCOUTX_OCR_VARIANT": "combined", "SCOUTX_INTERP_NO_UPGRADE": "1"},
}


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def gray_frame(path: Path, t: float) -> bytes:
    return subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", str(path), "-frames:v", "1", "-vf", "scale=320:-2,format=gray",
                           "-f", "rawvideo", "-"], check=True, capture_output=True).stdout


def mad(a: bytes, b: bytes) -> float:
    n = min(len(a), len(b))
    return sum(abs(x - y) for x, y in zip(a[:n], b[:n])) / max(n, 1)


def main() -> None:
    ap = argparse.ArgumentParser()
    for k in ("group", "identity", "proxy", "proxy-json", "plan", "difficult", "tree", "weights", "out"):
        ap.add_argument(f"--{k}", required=True)
    ap.add_argument("--source")
    ap.add_argument("--mapping-check", type=int, default=0)
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        raise SystemExit(f"{out} exists: freeze records are never overwritten")
    ident = json.loads(Path(a.identity).read_text())
    if ident.get("answer") != "yes" or ident.get("confirmedBy") != "owner" or ident.get("group") != a.group:
        raise SystemExit("no explicit owner confirmation for this group: inference must not start")
    for k in ("sourceFile", "sourceTimestampSec", "scope", "confirmedAt", "how"):
        if ident.get(k) in (None, ""):
            raise SystemExit(f"identity confirmation lacks {k}")
    meta = json.loads(Path(a.proxy_json).read_text())
    proxy = Path(a.proxy)
    proxy_sha = sha(proxy)
    if proxy_sha != meta["sha256"]:
        raise SystemExit("proxy bytes differ from the proxy record")
    plan = json.loads(Path(a.plan).read_text())
    rebuilt = sample_plan.build(plan["durationSec"], meta["videoStreamSha256"], a.group, plan["interval"], len(plan["sequences"]),
                                plan["sequences"][0]["end"] - plan["sequences"][0]["start"] if plan["sequences"] else 20.0,
                                (len(plan["sequences"][0]["frames"]) / (plan["sequences"][0]["end"] - plan["sequences"][0]["start"])) if plan["sequences"] else 2.0,
                                [tuple(x) for x in plan["exclude"]])
    if json.loads(json.dumps(rebuilt)) != plan:
        raise SystemExit("sample plan is not the deterministic plan for this proxy and group")
    tree = Path(a.tree)
    commit = subprocess.run(["git", "-C", str(tree), "rev-parse", "HEAD"], check=True, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(["git", "-C", str(tree), "status", "--porcelain", "--", "workers/football-cv/scoutx_tracker"],
                           check=True, capture_output=True, text=True).stdout.strip()
    if dirty:
        raise SystemExit("frozen tree has uncommitted engine changes")
    weights = {p.name: sha(p) for p in sorted(Path(a.weights).iterdir()) if p.is_file()}
    record = {
        "schema": "pitchproof.shadow-freeze.v1", "group": a.group,
        "frozenAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "identityConfirmation": ident, "identitySha256": sha(Path(a.identity)),
        "proxy": {"file": proxy.name, "sha256": proxy_sha, "videoStreamSha256": meta["videoStreamSha256"], "frames": meta["frames"],
                  "timeMapping": meta.get("timeMapping"), "sourceFirstVideoPts": meta.get("sourceFirstVideoPts")},
        "tree": {"path": str(tree), "commit": commit},
        "models": {"weightsDir": str(a.weights), "files": weights},
        "flags": {"base": BASE_FLAGS, "configs": {n: {**BASE_FLAGS, **o} for n, o in CONFIGS.items()}},
        "plan": {"file": Path(a.plan).name, "sha256": sha(Path(a.plan)), "fixed": len(plan["fixed"]),
                 "sequences": [(s["start"], s["end"]) for s in plan["sequences"]]},
        "difficultStretches": {"file": Path(a.difficult).name, "sha256": sha(Path(a.difficult))},
        "scoring": {"file": "bench/shadow/score.py", "sha256": sha(HERE / "score.py")},
        "mode": "automatic first; owner-assisted only under a separately frozen anchor protocol",
    }
    if a.source:
        src = Path(a.source)
        record["source"] = {"file": src.name, "sha256": sha(src)}
        if a.mapping_check:
            off = float(meta.get("sourceFirstVideoPts") or 0.0)
            ts = [plan["fixed"][int(i * (len(plan["fixed"]) - 1) / max(a.mapping_check - 1, 1))] for i in range(a.mapping_check)]
            checks = [{"proxyT": t, "madSame": round(mad(gray_frame(proxy, t), gray_frame(src, t + off)), 2),
                       "madPlus1s": round(mad(gray_frame(proxy, t), gray_frame(src, t + off + 1.0)), 2)} for t in ts]
            record["source"]["mappingCheck"] = checks
            if any(c["madSame"] >= c["madPlus1s"] for c in checks):
                raise SystemExit(f"proxy/source timestamp mapping check failed: {checks}")
    out.write_text(json.dumps(record, indent=1))
    print(json.dumps({"frozen": str(out), "commit": commit, "proxy": proxy_sha[:16]}))


if __name__ == "__main__":
    main()
