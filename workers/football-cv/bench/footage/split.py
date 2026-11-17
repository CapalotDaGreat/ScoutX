"""Freeze the match-level split BEFORE any candidate prediction is produced for a match group.

Usage: python3 split.py SPLIT.json add GROUP_ID --members NAME... [--exposed REASON]
       python3 split.py SPLIT.json join GROUP_ID --members NAME...   (same match found later)
       python3 split.py SPLIT.json show
Rule (predeclared 2026-11-17, owner brief c490c61b section 5):
- Groups already inspected or used for tuning -> development (IMG_4809's match is development).
- Every other group is assigned by SHA-256(group id): first byte < 0x66 (40 %) validation, else held-out.
  The rule ignores performance and difficulty, so hard footage cannot be swapped out; stratification is
  checked afterwards and reported, never fixed by moving groups.
- Assignments are append-only; a held-out group whose results influence a fix is marked `exposed`, keeps its
  partition label and is excluded from later untouched-evaluation claims.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path


def partition(group_id: str, exposed: str | None) -> str:
    if exposed:
        return "development"
    return "validation" if hashlib.sha256(group_id.encode()).digest()[0] < 0x66 else "held-out"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("cmd", choices=["add", "show", "expose", "join"])
    ap.add_argument("group", nargs="?")
    ap.add_argument("--members", nargs="*", default=[])
    ap.add_argument("--exposed")
    a = ap.parse_args()
    p = Path(a.path)
    s = json.loads(p.read_text()) if p.exists() else {"rule": __doc__.split("Rule", 1)[1].strip(), "groups": {}, "events": []}
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z"
    if a.cmd == "add":
        if a.group in s["groups"]:
            raise SystemExit(f"{a.group} already frozen as {s['groups'][a.group]['partition']} (append-only)")
        taken = {m: g for g, v in s["groups"].items() for m in v["members"]}
        clash = [m for m in a.members if m in taken]
        if clash:
            raise SystemExit(f"members already in other groups: {[(m, taken[m]) for m in clash]}")
        s["groups"][a.group] = {"members": a.members, "partition": partition(a.group, a.exposed),
                                "exposedBeforeFreeze": a.exposed, "frozenAt": now}
        s["events"].append({"at": now, "event": "freeze", "group": a.group})
    elif a.cmd == "join":  # a later-found recording of an already frozen match inherits its partition
        taken = {m for v in s["groups"].values() for m in v["members"]}
        new = [m for m in a.members if m not in taken]
        s["groups"][a.group]["members"] += new
        s["events"].append({"at": now, "event": "join", "group": a.group, "members": new})
    elif a.cmd == "expose":
        s["groups"][a.group]["exposedAfterFreeze"] = a.exposed or "unspecified"
        s["events"].append({"at": now, "event": "exposed", "group": a.group, "reason": a.exposed})
    p.write_text(json.dumps(s, indent=1))
    print(json.dumps({g: (v["partition"], v["members"]) for g, v in s["groups"].items()}, indent=0))


if __name__ == "__main__":
    main()
