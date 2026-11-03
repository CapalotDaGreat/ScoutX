"""Full-match exchange-split trigger audit (5.3). Bench-only; does not change engine behaviour.

    SCOUTX_EXCHANGE_SPLIT={0,1} python bench/full_match_exchange_audit.py --triggers TRIGGERS.json -- \
        <full_match_benchmark.py arguments>

Runs bench/full_match_benchmark.py unchanged (discovery + every stage-1 chunk + resolve) and records, for EVERY call
of the contact/steal splitter during resolve, the rows where `crossings.exchange_rows` fires - in shadow mode when
SCOUTX_EXCHANGE_SPLIT=0 (computed, never applied) and as applied when =1 - plus the steal rows, so the baseline and
candidate runs list the same trigger set. Each trigger keeps frame, time, both tracks and both boxes (numbers only).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))


def _row(R, i):
    r = R[int(i)]
    return {"frame": int(r[0]), "t": round(float(r[1]), 2), "track": int(r[2]), "box": [round(float(v), 1) for v in r[3:7]]}


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    sep = argv.index("--") if "--" in argv else len(argv)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--triggers", required=True)
    a = ap.parse_args(argv[:sep])
    from scoutx_tracker import crossings  # noqa: PLC0415
    import full_match_benchmark as fmb  # noqa: PLC0415

    calls: list = []
    real_steal, real_exchange = crossings.steal_rows, crossings.exchange_rows

    def steal_rows(R, row_kit, skip=None, *x, **k):
        out = real_steal(R, row_kit, skip, *x, **k)
        shadow = real_exchange(R, row_kit, skip=skip)
        seen = {b for b, _ in out}
        calls.append({"call": len(calls), "rows": int(len(R)), "applied": bool(crossings.EXCHANGE_SPLIT),
                      "steals": [{"row": _row(R, b), "other": _row(R, q)} for b, q in out],
                      "exchanges": [{"row": _row(R, b), "other": _row(R, q), "alsoSteal": b in seen} for b, q in shadow]})
        Path(a.triggers).write_text(json.dumps({"exchangeSplit": bool(crossings.EXCHANGE_SPLIT), "calls": calls}))
        return out

    crossings.steal_rows = steal_rows
    rc = fmb.main(argv[sep + 1:])
    Path(a.triggers).write_text(json.dumps({"exchangeSplit": bool(crossings.EXCHANGE_SPLIT), "calls": calls, "rc": rc}))
    return rc


if __name__ == "__main__":
    sys.exit(main())
