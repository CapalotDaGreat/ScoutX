"""Video Intelligence 4.1: early discovery pass (number sightings -> playable moments)."""

import numpy as np

from scoutx_tracker.discovery import DiscoveryConfig, _cluster, discover, sighting_priority

ORANGE = (0, 128, 255)  # BGR
BLUE = (200, 60, 20)


def frames(n=60, fps=10.0, box=(800, 300, 900, 600), colour=ORANGE, cut_at=None):
    out = []
    for k in range(n):
        f = np.full((1080, 1920, 3), (40, 140, 40), np.uint8)  # grass
        x1, y1, x2, y2 = box
        f[y1:y2, x1:x2] = colour
        if cut_at is not None and k >= cut_at:
            f[:540] = (200, 200, 200)
        out.append((k / fps, f))
    return out


class Det:
    def __init__(self, box=(800, 300, 900, 600)):
        self.box = np.array([box], np.float32)
        self.calls = 0

    def __call__(self, frame):
        self.calls += 1
        return self.box, np.array([0.9], np.float32)


class Reader:
    def __init__(self, by_frame):
        self.by_frame, self.calls, self.k = by_frame, 0, 0

    def read(self, crop):
        self.calls += 1
        return self.by_frame(self.calls)


def test_number_sighting_becomes_a_playable_moment():
    res = discover("", 0, 6, "20", "orange", Det(), Reader(lambda i: ("20", 0.97, "shirt:white") if i % 2 else (None, 0.0, None)),
                   cfg=DiscoveryConfig(), frames=frames())
    assert res.sightings, "the read number must produce a sighting"
    s = res.sightings[0]
    assert s.number == "20" and s.frames >= 1
    m = res.moments[0]
    assert m["evidence"] == "number_read" and m["identityState"] == "CONFIRMED_VISIBLE"
    assert m["clipStart"] <= s.t <= m["clipEnd"] and 3.0 <= m["clipEnd"] - m["clipStart"] <= 9.0 + 1e-6
    assert m["indicator"] and all(0 <= p[1] <= 1 for p in m["indicator"])
    assert res.first_sighting_wall_sec is not None


def test_conflicting_number_in_the_same_sighting_abstains_and_other_numbers_are_ignored():
    reads = [(1.0, [0, 0, 10, 30], "20", 0.97, "s", 10), (1.2, [0, 0, 10, 30], "28", 0.96, "s", 12)]
    assert _cluster(reads, "20", 1.5) == []
    reads = [(1.0, [0, 0, 10, 30], "17", 0.97, "s", 10)]
    assert _cluster(reads, "20", 1.5) == []
    # a lone digit (partial view of a turning shirt) neither confirms nor blocks
    reads = [(1.0, [0, 0, 10, 30], "1", 0.97, "s", 10), (1.2, [0, 0, 10, 30], "20", 0.96, "s", 12)]
    assert [s.number for s in _cluster(reads, "20", 1.5)] == ["20"]
    assert _cluster([(1.0, [0, 0, 10, 30], "2", 0.99, "s", 10)], "20", 1.5) == []
    reads = [(1.0, [0, 0, 10, 30], "20", 0.97, "s", 10), (9.0, [500, 0, 510, 30], "20", 0.95, "s", 90)]
    assert len(_cluster(reads, "20", 1.5)) == 2


def test_only_large_target_kit_players_are_read():
    reader = Reader(lambda i: ("20", 0.99, "shirt"))
    res = discover("", 0, 6, "20", "orange", Det(box=(800, 300, 840, 380)), reader, frames=frames(box=(800, 300, 840, 380)))
    assert reader.calls == 0 and not res.sightings, "an 80 px player is too small to read"
    reader = Reader(lambda i: ("20", 0.99, "shirt"))
    res = discover("", 0, 6, "20", "orange", Det(), reader, frames=frames(colour=BLUE))
    assert reader.calls == 0 and not res.sightings, "an opponent-kit player is never read"


def test_clip_stops_at_a_camera_cut():
    res = discover("", 0, 6, "20", "orange", Det(), Reader(lambda i: ("20", 0.97, "s")), frames=frames(cut_at=30))
    for m in res.moments:
        assert not (m["clipStart"] < 3.0 < m["clipEnd"]) or m["start"] >= 3.0


def test_segments_with_sightings_are_scheduled_first():
    segs = [(0, 120), (120, 420), (420, 720), (720, 1020)]
    assert sighting_priority([242.0, 900.0], segs) == [1, 3, 0, 2]
    assert sighting_priority([], segs) == [0, 1, 2, 3]


def test_extract_endpoint_passes_absolute_segment_bounds(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app import tracking_v3
    from app.main import app

    seen = {}

    def fake_extract(url, out, t0=0.0, start=0.0, end=None):
        seen.update(t0=t0, start=start, end=end)
        from pathlib import Path  # noqa: PLC0415

        (Path(out) / "crops").mkdir(parents=True, exist_ok=True)
        (Path(out) / "detections.npz").write_bytes(b"npz")
        (Path(out) / "meta.json").write_text("{}")
        return {"frames": 3000, "seconds": 12.5}

    monkeypatch.setenv("TRACKING_V3_ENABLED", "true")
    monkeypatch.setenv("TRACKING_ARTIFACT_ROOT", str(tmp_path))
    tracking_v3.set_engine(extract=fake_extract)
    try:
        with TestClient(app) as client:
            r = client.post("/v3/tracking:extract", json={
                "contractVersion": 3, "jobId": "j1", "segmentIndex": 1, "startSec": 120, "endSec": 420,
                "source": {"url": "https://example.org/v.mp4"},
                "privacy": {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False}})
    finally:
        tracking_v3.set_engine()
    assert r.status_code == 200 and r.json()["processingSec"] == 12.5
    assert seen == {"t0": 0.0, "start": 120.0, "end": 420.0}


def test_discover_endpoint_is_gated_target_only_and_needs_a_number(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app import tracking_v3
    from app.main import app
    from scoutx_tracker.discovery import DiscoveryResult

    def fake(url, start, end, number, kit, detector, reader, crops_dir=None):
        r = DiscoveryResult(frames=100, timings={"wall": 3.2})
        r.moments = [{"id": "d_2420", "kind": "sighting", "start": 242.0, "end": 242.0, "clipStart": 237.0, "clipEnd": 246.0,
                      "identityState": "CONFIRMED_VISIBLE", "evidence": "number_read", "number": number, "readFrames": 2,
                      "candidate": False, "indicator": [[242.0, 0.3, 0.3, 0.1, 0.4]], "thumbCrop": "/secret/s_002420.jpg",
                      "otherPlayers": [{"number": "17"}]}]
        return r

    body = {"contractVersion": 3, "jobId": "j1", "chunkIndex": 0, "startSec": 0, "endSec": 600,
            "source": {"url": "https://example.org/v.mp4"}, "target": {"jerseyNumber": "20", "kitPrimaryColor": "orange"},
            "privacy": {"retainNonTargetIdentities": False, "faceRecognition": False, "persistMedia": False}}
    with TestClient(app) as client:
        monkeypatch.delenv("TRACKING_V3_ENABLED", raising=False)
        assert client.post("/v3/tracking:discover", json=body).status_code == 404
        monkeypatch.setenv("TRACKING_V3_ENABLED", "true")
        monkeypatch.setenv("TRACKING_ARTIFACT_ROOT", str(tmp_path))
        tracking_v3.set_engine(discover=fake)
        try:
            r = client.post("/v3/tracking:discover", json=body)
            none = client.post("/v3/tracking:discover", json={**body, "target": {"jerseyNumber": "", "kitPrimaryColor": "orange"}})
            long = client.post("/v3/tracking:discover", json={**body, "endSec": 4000})
        finally:
            tracking_v3.set_engine()
    assert r.status_code == 200
    text = str(r.json())
    assert "secret" not in text and "otherPlayers" not in text and "'17'" not in text
    assert r.json()["moments"][0]["evidence"] == "number_read"
    assert none.json()["status"] == "no_number"
    assert long.status_code == 422


def test_sightings_attach_to_the_overlapping_detection_as_number_reads():
    from types import SimpleNamespace

    from scoutx_tracker.analyze import attach_sightings

    D = SimpleNamespace(times=np.arange(0, 10, 0.1))
    rows = np.array([[50, 5.0, 7, 100, 100, 150, 300], [50, 5.0, 8, 400, 100, 450, 300], [60, 6.0, 7, 110, 100, 160, 300]], float)
    T = SimpleNamespace(rows=rows)
    reads: dict = {}
    n = attach_sightings(reads, [{"t": 5.0, "box": [102, 98, 151, 302], "number": "20", "conf": 0.97},
                                 {"t": 5.0, "box": [700, 98, 751, 302], "number": "20", "conf": 0.97},  # no overlap
                                 {"t": 6.0, "box": [110, 100, 160, 300], "number": "17", "conf": 0.97}],  # other number
                         "20", D, T)
    assert n == 1 and list(reads) == [7] and reads[7][0][1] == "20" and reads[7][0][3] == "discovery"
    assert attach_sightings(reads, [{"t": 5.0, "box": [102, 98, 151, 302], "number": "20"}], "20", D, T) == 0, "idempotent"


def test_overlapping_sightings_merge_into_one_moment():
    from scoutx_tracker.discovery import merge_overlapping

    a = {"id": "d_19559", "clipStart": 1950.9, "clipEnd": 1959.9, "readFrames": 1, "start": 1955.9, "indicator": [[1955.9, 0.1, 0.1, 0.1, 0.2]]}
    b = {"id": "d_19564", "clipStart": 1951.4, "clipEnd": 1960.4, "readFrames": 3, "start": 1956.4, "indicator": [[1956.4, 0.1, 0.1, 0.1, 0.2]]}
    c = {"id": "d_3600", "clipStart": 31.0, "clipEnd": 40.0, "readFrames": 1, "start": 36.0, "indicator": []}
    out = merge_overlapping([b, c, a])
    assert [m["id"] for m in out] == ["d_3600", "d_19564"]
    assert out[1]["clipStart"] == 1950.9 and out[1]["clipEnd"] == 1960.4 and out[1]["readFrames"] == 4 and len(out[1]["indicator"]) == 2
