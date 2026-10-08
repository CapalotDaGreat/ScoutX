"""Target association and availability windows. Pure functions, no ML dependencies.

The worker never identifies people: it only associates anonymous tracks with the *description*
the player gave (jersey number, kit colour). Faces are never used. Non-target tracks are
discarded at the end of the request.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# A jersey read this confident on enough frames makes a track the target.
JERSEY_CONFIRM_CONFIDENCE = 0.6
JERSEY_CONFIRM_READS = 3
# Team colour alone never confirms identity; it only makes a track a candidate.
TEAM_CANDIDATE_MATCH = 0.6
# A gap shorter than this between two sightings is bridged as LIKELY_ACTIVE_OFF_CAMERA.
MAX_BRIDGE_SEC = 20.0
BRIDGE_CONFIDENCE = 0.4


@dataclass
class TrackObservation:
    time_sec: float
    jersey_read: str | None
    jersey_confidence: float
    team_match: float


@dataclass
class Track:
    track_id: str
    observations: list[TrackObservation] = field(default_factory=list)

    @property
    def first_sec(self) -> float:
        return min(o.time_sec for o in self.observations)

    @property
    def last_sec(self) -> float:
        return max(o.time_sec for o in self.observations)

    def jersey_votes(self, number: str) -> int:
        return sum(
            1
            for o in self.observations
            if o.jersey_read == number and o.jersey_confidence >= JERSEY_CONFIRM_CONFIDENCE
        )

    def best_jersey(self) -> tuple[str | None, float]:
        reads = [o for o in self.observations if o.jersey_read]
        if not reads:
            return None, 0.0
        best = max(reads, key=lambda o: o.jersey_confidence)
        return best.jersey_read, best.jersey_confidence

    def mean_team_match(self) -> float:
        return sum(o.team_match for o in self.observations) / len(self.observations)


@dataclass
class Association:
    state: str  # CONFIRMED_VISIBLE | CANDIDATE | UNKNOWN
    target_tracks: list[Track]
    candidates: list[Track]


def associate(tracks: list[Track], jersey_number: str) -> Association:
    """Tracks whose jersey was read as the target number often enough become the target."""
    tracks = [t for t in tracks if t.observations]
    confirmed = [t for t in tracks if jersey_number and t.jersey_votes(jersey_number) >= JERSEY_CONFIRM_READS]
    if confirmed:
        return Association("CONFIRMED_VISIBLE", confirmed, confirmed)
    candidates = sorted(
        (t for t in tracks if t.mean_team_match() >= TEAM_CANDIDATE_MATCH),
        key=lambda t: (t.jersey_votes(jersey_number) if jersey_number else 0, len(t.observations)),
        reverse=True,
    )[:5]
    return Association("CANDIDATE" if candidates else "UNKNOWN", [], candidates)


def visible_intervals(tracks: list[Track], sample_step_sec: float) -> list[tuple[float, float]]:
    """Merges target sightings into intervals; consecutive samples join, gaps split."""
    times = sorted({o.time_sec for t in tracks for o in t.observations})
    intervals: list[tuple[float, float]] = []
    for time in times:
        if intervals and time - intervals[-1][1] <= sample_step_sec * 1.5:
            intervals[-1] = (intervals[-1][0], time)
        else:
            intervals.append((time, time))
    return [(start, end + sample_step_sec) for start, end in intervals]


def availability_windows(
    association: Association,
    start_sec: float,
    end_sec: float,
    sample_step_sec: float,
    wide_camera: bool,
) -> list[dict]:
    """CONFIRMED_VISIBLE only for a confirmed target; short gaps on a wide camera become
    LIKELY_ACTIVE_OFF_CAMERA; everything else is UNKNOWN. Never CONFIRMED_OFF_PITCH: that needs
    substitution detection, which this worker does not do."""
    if association.state != "CONFIRMED_VISIBLE":
        return [{"startSec": start_sec, "endSec": end_sec, "state": "UNKNOWN", "confidence": 0.0}]
    intervals = [
        (max(start_sec, s), min(end_sec, e))
        for s, e in visible_intervals(association.target_tracks, sample_step_sec)
        if min(end_sec, e) > max(start_sec, s)
    ]
    windows: list[dict] = []
    cursor = start_sec
    for index, (s, e) in enumerate(intervals):
        if s > cursor:
            bridged = wide_camera and index > 0 and s - cursor <= MAX_BRIDGE_SEC
            windows.append({
                "startSec": cursor,
                "endSec": s,
                "state": "LIKELY_ACTIVE_OFF_CAMERA" if bridged else "UNKNOWN",
                "confidence": BRIDGE_CONFIDENCE if bridged else 0.0,
            })
        windows.append({"startSec": s, "endSec": e, "state": "CONFIRMED_VISIBLE", "confidence": 0.8})
        cursor = e
    if cursor < end_sec:
        windows.append({"startSec": cursor, "endSec": end_sec, "state": "UNKNOWN", "confidence": 0.0})
    return windows


def visible_seconds(windows: list[dict]) -> float:
    return sum(w["endSec"] - w["startSec"] for w in windows if w["state"] == "CONFIRMED_VISIBLE")


def candidate_payload(tracks: list[Track]) -> list[dict]:
    payload = []
    for track in tracks[:10]:
        jersey, confidence = track.best_jersey()
        payload.append({
            "trackId": track.track_id,
            "jerseyRead": jersey if jersey and jersey.isdigit() and len(jersey) <= 3 else None,
            "jerseyConfidence": round(min(1.0, max(0.0, confidence)), 3),
            "teamMatch": round(min(1.0, max(0.0, track.mean_team_match())), 3),
            "firstSec": track.first_sec,
            "lastSec": track.last_sec,
        })
    return payload
