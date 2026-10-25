"""Target association and availability windows. Pure functions, no ML dependencies.

The worker never identifies people: it only associates anonymous tracks with the *description*
the player gave (jersey number, kit colour). Faces are never used. Non-target tracks are
discarded at the end of the request.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import isfinite
from bisect import bisect_left, bisect_right

# A jersey read this confident on enough frames makes a track the target.
JERSEY_CONFIRM_CONFIDENCE = 0.6
JERSEY_CONFIRM_READS = 3
# Team colour alone never confirms identity; it only makes a track a candidate.
TEAM_CANDIDATE_MATCH = 0.6
# Uncalibrated, conservative evidence bounds, not probabilities.
CONSENSUS_RADIUS_SEC = 2.5
CONSENSUS_SHARE = 0.75
MAX_CONTINUITY_GAP_SEC = 2.0


def valid_read(number: str | None, confidence: float) -> bool:
    return bool(number and number.isascii() and number.isdigit() and len(number) <= 2
                and isfinite(confidence) and JERSEY_CONFIRM_CONFIDENCE <= confidence <= 1)


def consensus(observations: list[TrackObservation]) -> tuple[str | None, float]:
    # One vote per timestamp; duplicate or conflicting same-frame reads add no evidence.
    frames: dict[float, list[TrackObservation]] = {}
    for observation in observations:
        frames.setdefault(observation.time_sec, []).append(observation)
    reads = [items[0] for items in frames.values() if len(items) == 1
             and valid_read(items[0].jersey_read, items[0].jersey_confidence)]
    weights: dict[str, float] = {}
    counts: dict[str, int] = {}
    for observation in reads:
        number = observation.jersey_read
        weights[number] = weights.get(number, 0) + observation.jersey_confidence
        counts[number] = counts.get(number, 0) + 1
    if not weights:
        return None, 0.0
    winner = max(weights, key=weights.get)
    if counts[winner] < JERSEY_CONFIRM_READS or weights[winner] / sum(weights.values()) < CONSENSUS_SHARE:
        return None, 0.0
    return winner, weights[winner] / counts[winner]


@dataclass
class TrackObservation:
    time_sec: float
    jersey_read: str | None
    jersey_confidence: float
    team_match: float
    # Pixel box for local continuity checks/evaluation; never part of the HTTP response.
    box: tuple[float, float, float, float] | None = None


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
        return consensus(self.observations)

    def mean_team_match(self) -> float:
        return sum(o.team_match for o in self.observations) / len(self.observations)


@dataclass
class Association:
    state: str  # CONFIRMED_VISIBLE | CANDIDATE | UNKNOWN
    target_tracks: list[Track]
    candidates: list[Track]
    # Two people carried the target number at the same moment, so neither is confirmed.
    ambiguous: bool = False


def _co_visible(tracks: list[Track]) -> bool:
    # Supported episodes are bounded by continuity guards. Comparing their time
    # ranges is deliberately conservative and cannot miss millisecond PTS jitter.
    last_end = float("-inf")
    for track in sorted(tracks, key=lambda t: t.first_sec):
        if track.first_sec <= last_end:
            return True
        last_end = max(last_end, track.last_sec)
    return False


def associate(tracks: list[Track], jersey_number: str, kit_known: bool = False) -> Association:
    """Only locally supported observations become heuristic target samples.

    With a known kit, a number match in the wrong colours is someone else (e.g. the opponent
    wearing the same number). If two remaining number matches are on screen at the same time
    the worker cannot tell them apart and reports CANDIDATE instead of picking one."""
    tracks = [t for t in tracks if t.observations]
    confirmed = []
    for track in tracks:
        # Never let distant evidence confirm an entire tracker ID. Gaps, kit changes and
        # gross box jumps break continuity; each observation needs local OCR support.
        episodes: list[list[TrackObservation]] = []
        for observation in sorted(track.observations, key=lambda o: o.time_sec):
            if kit_known and observation.team_match < TEAM_CANDIDATE_MATCH:
                episodes.append([])
                continue
            previous = episodes[-1][-1] if episodes and episodes[-1] else None
            jump = False
            if previous and previous.box and observation.box:
                a, b = previous.box, observation.box
                scale = max(a[2] - a[0], a[3] - a[1], 1)
                jump = max(abs((a[0] + a[2] - b[0] - b[2]) / 2),
                           abs((a[1] + a[3] - b[1] - b[3]) / 2)) > 2 * scale
            if previous is None or observation.time_sec - previous.time_sec > MAX_CONTINUITY_GAP_SEC or jump:
                episodes.append([])
            episodes[-1].append(observation)
        for episode in episodes:
            supported = []
            times = [o.time_sec for o in episode]
            for observation in episode:
                left = bisect_left(times, observation.time_sec - CONSENSUS_RADIUS_SEC)
                right = bisect_right(times, observation.time_sec + CONSENSUS_RADIUS_SEC)
                local = episode[left:right]
                number, _ = consensus(local)
                if (number == jersey_number and valid_read(observation.jersey_read, observation.jersey_confidence)
                        and observation.jersey_read == jersey_number):
                    supported.append(observation)
            if supported:
                confirmed.append(Track(track.track_id, supported))
    if confirmed and _co_visible(confirmed):
        return Association("CANDIDATE", [], confirmed[:5], ambiguous=True)
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
        if intervals and time - intervals[-1][1] <= sample_step_sec + 1e-6:
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
    """Unseen intervals are UNKNOWN regardless of camera view. No activity is inferred."""
    if association.state != "CONFIRMED_VISIBLE":
        return [{"startSec": start_sec, "endSec": end_sec, "state": "UNKNOWN", "confidence": 0.0}]
    intervals = [
        (max(start_sec, s), min(end_sec, e))
        for s, e in visible_intervals(association.target_tracks, sample_step_sec)
        if min(end_sec, e) > max(start_sec, s)
    ]
    windows: list[dict] = []
    cursor = start_sec
    for s, e in intervals:
        if s > cursor:
            windows.append({
                "startSec": cursor,
                "endSec": s,
                "state": "UNKNOWN",
                "confidence": 0.0,
            })
        windows.append({"startSec": s, "endSec": e, "state": "CONFIRMED_VISIBLE", "confidence": 0.8})
        cursor = e
    if cursor < end_sec:
        windows.append({"startSec": cursor, "endSec": end_sec, "state": "UNKNOWN", "confidence": 0.0})
    return windows


def target_trace(association: Association) -> list[dict]:
    """Where the worker believed the target was, per sample. Evaluation only."""
    points = [
        {"timeSec": o.time_sec, "box": list(o.box)}
        for t in association.target_tracks
        for o in t.observations
        if o.box is not None
    ]
    return sorted(points, key=lambda p: p["timeSec"])


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
