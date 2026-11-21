"""E9 decision: read REAL labelled crops through the engine's own NumberReader, once with the pinned PARSeq and once
with fine-tuned weights, and apply the predeclared keep rule (research notes 2026-11-15, section 5).

    python -m bench.e9.eval_crops --crops crops.jsonl --root CROP_DIR --number 20 \
        --weights data/e9_run1/parseq_e9.pt --sha256 <sha> --out e9_eval.json

`crops.jsonl` lines: {"file": "relative/path.jpg", "target": true|false, "piece": "piece id", "number": "17"|null}.
`target` marks crops of the followed player. `number` is the legible number when a labeller could read it, else null.
The IMG_4809 set is 245 target crops (19 pieces) and 1,221 same-kit team-mate crops.

Keep rule, all required (fixed before any fine-tuned result is seen):
  1. Target crops read as the target number rise clearly (here: by >= 5 crops AND >= 2 pieces).
  2. Zero team-mate crops read as the target number.
  3. No rise in other-number reads on target crops (those exclude real target pieces).
Everything is reported per crop AND per piece, because crops of one piece are not independent.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def score(rows: list[dict], reads: list[str | None], number: str) -> dict:
    t_hit, t_other, m_hit, m_other = [], [], [], []
    pieces_hit, mate_pieces_hit = set(), set()
    for r, got in zip(rows, reads):
        if got is None:
            continue
        if r["target"]:
            (t_hit if got == number else t_other).append(r["file"])
            if got == number:
                pieces_hit.add(r.get("piece"))
        else:
            (m_hit if got == number else m_other).append(r["file"])
            if got == number:
                mate_pieces_hit.add(r.get("piece"))
    n_t = sum(1 for r in rows if r["target"])
    return {"targetCrops": n_t, "teammateCrops": len(rows) - n_t,
            "targetReadAsNumber": len(t_hit), "targetPiecesReadAsNumber": len(pieces_hit),
            "targetReadAsOtherNumber": len(t_other),
            "teammateReadAsNumber": len(m_hit), "teammatePiecesReadAsNumber": len(mate_pieces_hit),
            "teammateReadAsOtherNumber": len(m_other), "teammateFilesReadAsNumber": m_hit[:50]}


def decide(base: dict, cand: dict) -> dict:
    checks = {
        "targetRisesClearly": cand["targetReadAsNumber"] - base["targetReadAsNumber"] >= 5
        and cand["targetPiecesReadAsNumber"] - base["targetPiecesReadAsNumber"] >= 2,
        "zeroTeammateReadAsNumber": cand["teammateReadAsNumber"] == 0,
        "noRiseInOtherNumberOnTarget": cand["targetReadAsOtherNumber"] <= base["targetReadAsOtherNumber"],
    }
    return {"checks": checks, "keep": all(checks.values())}


def read_all(rows: list[dict], root: Path) -> list[str | None]:
    import cv2  # noqa: PLC0415

    from scoutx_tracker.ocr import NumberReader  # noqa: PLC0415

    reader = NumberReader()
    out = []
    for r in rows:
        img = cv2.imread(str(root / r["file"]))
        out.append(None if img is None else reader.read(img)[0])
    return out, reader.device_report


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--crops", required=True)
    ap.add_argument("--root", required=True)
    ap.add_argument("--number", default="20")
    ap.add_argument("--weights", required=True)
    ap.add_argument("--sha256", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rows = [json.loads(line) for line in Path(a.crops).open()]
    os.environ.pop("SCOUTX_PARSEQ_WEIGHTS", None)
    base_reads, base_dev = read_all(rows, Path(a.root))
    os.environ["SCOUTX_PARSEQ_WEIGHTS"], os.environ["SCOUTX_PARSEQ_WEIGHTS_SHA256"] = a.weights, a.sha256
    cand_reads, cand_dev = read_all(rows, Path(a.root))
    base, cand = score(rows, base_reads, a.number), score(rows, cand_reads, a.number)
    res = {"number": a.number, "baseline": base, "candidate": cand, "baselineDevice": base_dev,
           "candidateDevice": cand_dev, "decision": decide(base, cand)}
    Path(a.out).write_text(json.dumps(res, indent=1) + "\n")
    print(json.dumps({"baseline": {k: base[k] for k in list(base)[:8]}, "candidate": {k: cand[k] for k in list(cand)[:8]},
                      "decision": res["decision"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
