"""Account for every non-passing test outcome in pytest JUnit XML files (5.3). Bench-only.

    python bench/test_accounting.py --junit NAME=junit.xml [...] --out accounting.json

Lists, per run, every SKIPPED test (with its reason) and every XFAIL / XPASS test (with its reason), so a summary like
"626 passed, 9 skipped, 6 xfailed" names exactly which behaviour was NOT validated in that run and why.
"""
from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def account(path: Path) -> dict:
    root = ET.parse(path).getroot()
    out = {"passed": 0, "failed": [], "skipped": [], "xfailed": [], "xpassed": [], "errors": []}
    for tc in root.iter("testcase"):
        name = f"{tc.get('classname')}::{tc.get('name')}"
        sk, fa, er = tc.find("skipped"), tc.find("failure"), tc.find("error")
        if sk is not None:
            kind = "xfailed" if (sk.get("type") or "").endswith("xfail") else "skipped"
            out[kind].append({"test": name, "reason": (sk.get("message") or "").strip()})
        elif fa is not None:
            msg = fa.get("message") or ""
            (out["xpassed"] if "XPASS" in msg else out["failed"]).append({"test": name, "reason": msg[:300]})
        elif er is not None:
            out["errors"].append({"test": name, "reason": (er.get("message") or "")[:300]})
        else:
            out["passed"] += 1
    out["counts"] = {k: (v if isinstance(v, int) else len(v)) for k, v in out.items() if k != "counts"}
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--junit", action="append", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    res = {n: account(Path(p)) for n, p in (j.split("=", 1) for j in a.junit)}
    Path(a.out).write_text(json.dumps(res, indent=1))
    for n, r in res.items():
        print(n, r["counts"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
