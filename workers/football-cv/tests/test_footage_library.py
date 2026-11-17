"""bench/footage/library.py: dates, number hints, chunk/time mapping, size validation, manifest resume."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bench" / "footage"))
import library as L


def probe(apple=None, fmt=None, stream=None):
    tags = {}
    if apple:
        tags["com.apple.quicktime.creationdate"] = apple
    if fmt:
        tags["creation_time"] = fmt
    return {"format": {"tags": tags}, "streams": [{"tags": {"creation_time": stream}}] if stream else []}


def test_apple_date_with_offset_is_high_and_local():
    cd = L.capture_date(probe("2024-04-04T19:17:50+0100", "2026-11-17T18:09:37.000000Z"))
    assert cd["localDate"] == "2024-04-04" and cd["confidence"] == "high"
    assert cd["fields"]["apple"]["utc"] == "2024-04-04T18:17:50Z"
    assert cd["conflicts"] and "export" in cd["conflicts"][0]  # container time is the iCloud export, not filming


def test_late_evening_local_date_differs_from_utc_date():
    cd = L.capture_date(probe("2022-06-30T23:30:00+0200"))
    assert cd["localDate"] == "2022-06-30" and cd["fields"]["apple"]["utc"].startswith("2022-06-30T21:30")
    assert L.number_hint(cd["localDate"])["hint"] == "4"


def test_container_only_date_near_midnight_is_uncertain():
    cd = L.capture_date(probe(fmt="2023-03-01T23:00:00.000000Z"))
    assert cd["localDate"] is None and cd["confidence"] == "low" and cd["localDateRange"] == ["2023-03-01", "2023-03-02"]
    cd2 = L.capture_date(probe(fmt="2023-03-01T12:00:00Z"))
    assert cd2["localDate"] is None or cd2["localDate"] == "2023-03-01"


def test_missing_metadata_never_uses_file_date():
    cd = L.capture_date(probe(), file_mtime=1_700_000_000)
    assert cd["localDate"] is None and cd["confidence"] == "low" and cd["fileMtime"].startswith("2023-11-14")
    assert L.number_hint(None)["hint"] is None


@pytest.mark.parametrize("day,hint,status", [
    ("2022-06-28", "4", "date-based hypothesis"), ("2022-06-30", "4", "ambiguous"), ("2022-07-01", "20", "ambiguous"),
    ("2023-05-13", "20", "date-based hypothesis"), ("2025-04-30", "20", "ambiguous"), ("2025-05-01", "7", "ambiguous"),
    ("2025-08-10", "7", "date-based hypothesis")])
def test_number_periods_and_boundaries(day, hint, status):
    h = L.number_hint(day)
    assert h["hint"] == hint and h["status"].startswith(status)


def test_range_across_edge_gives_both_numbers():
    h = L.number_hint(None, ["2025-04-30", "2025-05-01"])
    assert h["hint"] == ["20", "7"] and h["status"].startswith("ambiguous")


def test_chunk_plan_covers_duration_without_overlap():
    plan = L.chunk_plan(2034.9)
    assert len(plan) == 7 and plan[0]["sourceStart"] == 0 and plan[-1]["sourceEnd"] == 2034.9
    assert all(a["sourceEnd"] == b["sourceStart"] for a, b in zip(plan, plan[1:]))
    assert len(L.chunk_plan(600.0)) == 2
    with pytest.raises(ValueError):
        L.chunk_plan(0)


def test_oversize_chunk_splits_in_half():
    c = {"index": 3, "sourceStart": 900.0, "sourceEnd": 1200.0}
    assert L.split_for_size(c, L.TRANSFER_TARGET_BYTES) == [c]
    a, b = L.split_for_size(c, L.TRANSFER_TARGET_BYTES + 1)
    assert (a["sourceStart"], a["sourceEnd"], b["sourceStart"], b["sourceEnd"]) == (900.0, 1050.0, 1050.0, 1200.0)


def test_proxy_time_mapping_and_frames():
    assert L.proxy_time(12.5, 0.033) == 12.467
    assert L.expected_frames(300.0) == 3000 and L.expected_frames(34.95) == 349


def test_validate_proxy_size_frames_audio_decode():
    ok = {"sizeBytes": 200_000_000, "fps": 10.0, "frames": 3000, "audioStreams": 0, "decodeOk": True}
    assert L.validate_proxy(ok, duration=300) == []
    big = {**ok, "sizeBytes": L.TRANSFER_LIMIT_BYTES - 1}
    assert any("transfer limit" in e for e in L.validate_proxy(big, duration=300))
    short = {**ok, "frames": 2990}
    assert any("frames" in e for e in L.validate_proxy(short, duration=300))
    assert any("audio" in e for e in L.validate_proxy({**ok, "audioStreams": 1}, duration=300))
    assert any("decode" in e for e in L.validate_proxy({**ok, "decodeOk": False}, duration=300))


def test_manifest_is_resumable_and_latest_wins(tmp_path):
    m = L.Manifest(tmp_path / "m.jsonl")
    m.put("Photos/IMG_1.MOV", availability="cloud", sizeBytes=5)
    m.put("Photos/IMG_1.MOV", availability="local")
    m2 = L.Manifest(tmp_path / "m.jsonl")
    assert m2.get("Photos/IMG_1.MOV")["availability"] == "local" and m2.get("Photos/IMG_1.MOV")["sizeBytes"] == 5


def test_split_is_append_only_and_rule_based(tmp_path):
    import subprocess
    sp = str(Path(__file__).resolve().parents[1] / "bench" / "footage" / "split.py")
    f = str(tmp_path / "split.json")
    run = lambda *a: subprocess.run([sys.executable, sp, f, *a], capture_output=True, text=True, check=False)
    assert run("add", "m-img4809", "--members", "IMG_4809.MOV", "--exposed", "tuning since 2026-10").returncode == 0
    assert run("add", "m-a", "--members", "IMG_1.MOV", "IMG_2.MOV").returncode == 0
    assert run("add", "m-a", "--members", "IMG_3.MOV").returncode != 0  # cannot re-freeze
    assert run("add", "m-b", "--members", "IMG_2.MOV").returncode != 0  # one recording, one group
    import json as _j
    s = _j.loads(Path(f).read_text())
    assert s["groups"]["m-img4809"]["partition"] == "development"
    import split as SP
    assert s["groups"]["m-a"]["partition"] == SP.partition("m-a", None)
