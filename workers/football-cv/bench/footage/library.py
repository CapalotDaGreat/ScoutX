"""Footage library helpers (stdlib only, so the same file runs on the owner's PC VM and in the workspace).

Covers: capture-date extraction with explicit confidence, jersey-number hints with boundary ambiguity,
resumable JSONL manifests, transfer-size planning and source-to-proxy timestamp mapping.
Nothing here reads pixels or decides identity: a number hint is only a hint (owner brief c490c61b, section 4).
"""
from __future__ import annotations

import datetime as dt
import json
import math
import os
import re
from pathlib import Path

# Owner-stated number periods (brief c490c61b section 4). Dates are local calendar dates at the recording place.
NUMBER_PERIODS = [(None, dt.date(2022, 7, 1), "4"), (dt.date(2022, 7, 1), dt.date(2025, 5, 1), "20"),
                  (dt.date(2025, 5, 1), None, "7")]
BOUNDARY_DAYS = 2  # within this many days of a period edge the hint is "ambiguous" (time-zone / export drift)

TRANSFER_LIMIT_BYTES = 400 * 1024 * 1024  # bridge staging limit, verified by refusal message 2026-11-17 ("400MB")
TRANSFER_TARGET_BYTES = int(0.85 * 400 * 1000 * 1000)  # 340 MB: margin below both MB and MiB readings

_APPLE = "com.apple.quicktime.creationdate"
_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$")


def parse_ts(raw: str | None) -> dict | None:
    """Parse an ISO-like metadata timestamp. Keeps the raw text, the stated offset and whether one was stated."""
    if not raw:
        return None
    m = _ISO.match(raw.strip())
    if not m:
        return {"raw": raw, "parsed": False}
    y, mo, d, h, mi, s, off = m.groups()
    naive = dt.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s))
    if off is None:
        return {"raw": raw, "parsed": True, "local": naive.isoformat(), "offset": None, "utc": None}
    if off == "Z":
        minutes = 0
    else:
        sign = 1 if off[0] == "+" else -1
        digits = off[1:].replace(":", "")
        minutes = sign * (int(digits[:2]) * 60 + int(digits[2:]))
    utc = naive - dt.timedelta(minutes=minutes)
    return {"raw": raw, "parsed": True, "local": naive.isoformat(), "offset": "Z" if off == "Z" else off,
            "offsetMinutes": minutes, "utc": utc.isoformat() + "Z"}


def capture_date(probe: dict, file_mtime: float | None = None) -> dict:
    """Choose the filming date from ffprobe JSON (format + stream tags) with stated confidence.

    high:   Apple creationdate with a local offset (written by the camera at capture).
    medium: only container/stream creation_time (UTC); may be an export/edit time - local date derived only if
            no day boundary is crossed within +/-14 h (otherwise the calendar date is uncertain).
    low:    nothing embedded; the filesystem date is reported as a clue only and never used as the date.
    """
    tags = dict((probe.get("format") or {}).get("tags") or {})
    stream_times = [((s.get("tags") or {}).get("creation_time")) for s in probe.get("streams") or []]
    fields = {"apple": parse_ts(tags.get(_APPLE)), "format": parse_ts(tags.get("creation_time")),
              "streams": [parse_ts(t) for t in stream_times if t]}
    conflicts = []
    out = {"fields": fields, "conflicts": conflicts, "fileMtime": (dt.datetime.fromtimestamp(file_mtime, dt.timezone.utc).replace(tzinfo=None).isoformat() + "Z")
           if file_mtime else None}
    a = fields["apple"]
    f = fields["format"]
    if f and f.get("utc") and a and a.get("utc"):
        gap = abs((dt.datetime.fromisoformat(a["utc"][:-1]) - dt.datetime.fromisoformat(f["utc"][:-1])).total_seconds())
        if gap > 6 * 3600:
            conflicts.append(f"apple creationdate and container creation_time differ by {gap / 3600:.1f} h "
                             "(container time is likely an export/sync time)")
    if a and a.get("parsed") and a.get("offset") is not None:
        out.update(localDate=a["local"][:10], confidence="high", basis="apple creationdate with offset")
    elif a and a.get("parsed"):
        out.update(localDate=a["local"][:10], confidence="medium", basis="apple creationdate without offset")
    elif f and f.get("utc"):
        u = dt.datetime.fromisoformat(f["utc"][:-1])
        lo, hi = (u - dt.timedelta(hours=14)).date(), (u + dt.timedelta(hours=14)).date()
        out.update(localDate=lo.isoformat() if lo == hi else None, localDateRange=[lo.isoformat(), hi.isoformat()],
                   confidence="medium" if lo == hi else "low", basis="container creation_time (UTC, may be export)")
    else:
        out.update(localDate=None, confidence="low", basis="no embedded date")
    return out


def number_hint(local_date: str | None, date_range: list[str] | None = None) -> dict:
    """Candidate jersey number from the owner's date periods. Never identity evidence on its own."""
    if not local_date and not date_range:
        return {"hint": None, "status": "no date"}
    days = [dt.date.fromisoformat(d) for d in ([local_date] if local_date else date_range)]
    hints = set()
    for day in days:
        for lo, hi, n in NUMBER_PERIODS:
            if (lo is None or day >= lo) and (hi is None or day < hi):
                hints.add(n)
    edges = [p[1] for p in NUMBER_PERIODS if p[1]]
    near = any(abs((day - e).days) <= BOUNDARY_DAYS for day in days for e in edges)
    if len(hints) != 1:
        return {"hint": sorted(hints), "status": "ambiguous: date range spans a period edge"}
    return {"hint": hints.pop(), "status": "ambiguous: within %d days of a period edge" % BOUNDARY_DAYS if near
            else "date-based hypothesis"}


def chunk_plan(duration: float, chunk_sec: float = 300.0) -> list[dict]:
    """Proxy chunks exactly as the product makes them (scoutx_tracker.cli.make_proxies): [k*chunk, (k+1)*chunk)."""
    if not duration or duration <= 0:
        raise ValueError("duration must be positive")
    n = math.ceil(duration / chunk_sec - 1e-9)
    return [{"index": k, "sourceStart": k * chunk_sec, "sourceEnd": min(duration, (k + 1) * chunk_sec)} for k in range(n)]


def split_for_size(chunk: dict, size: int, limit: int = TRANSFER_TARGET_BYTES) -> list[dict]:
    """If an encoded chunk is above the transfer target, re-plan it as equal halves (recursively by caller)."""
    if size <= limit:
        return [chunk]
    mid = (chunk["sourceStart"] + chunk["sourceEnd"]) / 2
    return [{**chunk, "sourceEnd": mid}, {**chunk, "sourceStart": mid}]


def proxy_time(source_t: float, source_start_pts: float = 0.0) -> float:
    """Proxy timestamps are source presentation time minus the source's first video PTS (both seconds)."""
    return round(source_t - source_start_pts, 6)


def expected_frames(duration: float, fps: float = 10.0) -> int:
    return int(math.floor(duration * fps + 1e-6)) or 1


def validate_proxy(info: dict, *, duration: float, fps: float = 10.0, limit: int = TRANSFER_LIMIT_BYTES,
                   margin_bytes: int = 20 * 1000 * 1000) -> list[str]:
    """Problems with a proxy chunk description (sizes in bytes; empty list = valid)."""
    errs = []
    if info.get("sizeBytes", 0) > limit - margin_bytes:
        errs.append(f"size {info.get('sizeBytes')} exceeds transfer limit minus margin")
    if abs((info.get("fps") or 0) - fps) > 1e-3:
        errs.append(f"fps {info.get('fps')} != {fps}")
    frames = info.get("frames")
    exp = expected_frames(duration, fps)
    if frames is None or abs(frames - exp) > 1:
        errs.append(f"frames {frames} != expected {exp} (+/-1)")
    if info.get("audioStreams", 0):
        errs.append("audio stream present")
    if not info.get("decodeOk"):
        errs.append("decode check failed")
    return errs


class Manifest:
    """Append-only JSONL keyed by `key`; the latest record per key wins. Safe to re-run (resumable)."""

    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self.rows: dict[str, dict] = {}
        if self.path.exists():
            for line in self.path.read_text(encoding="utf-8").splitlines():
                if line.strip():
                    r = json.loads(line)
                    self.rows[r["key"]] = {**self.rows.get(r["key"], {}), **r}

    def get(self, key: str) -> dict | None:
        return self.rows.get(key)

    def put(self, key: str, **fields) -> dict:
        rec = {"key": key, **fields, "updatedAt": dt.datetime.now(dt.timezone.utc).replace(microsecond=0, tzinfo=None).isoformat() + "Z"}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, sort_keys=True) + "\n")
        self.rows[key] = {**self.rows.get(key, {}), **rec}
        return self.rows[key]
