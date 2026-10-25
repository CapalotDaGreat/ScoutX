"""Deterministic orange-8 scenarios; not real-footage accuracy evidence."""
import pytest
from pydantic import ValidationError

from app.match_identity import MatchIdentityRequest, resolve_match


def samples(start=0.0, count=3, jersey="8", team=0.9):
    return [{"timestampSec": start + i * 0.5, "jerseyRead": jersey,
             "jerseyConfidence": 0.9 if jersey else 0.0, "teamMatch": team,
             "box": (10.0, 10.0, 30.0, 60.0)} for i in range(count)]


def payload():
    return {"scope": {"jobId": "orange8", "sourceSha256": "a" * 64,
                      "generation": 1, "modelSetDigest": "b" * 64},
            "target": {"jerseyNumber": "8", "kitPrimaryColor": "orange"},
            "durationSec": 8400.0,
            "segments": [{"segmentId": "s0", "startSec": 0.0, "endSec": 600.0,
                          "tracklets": [{"trackletId": "t0", "samples": samples()}]}]}


def run(raw):
    return resolve_match(MatchIdentityRequest.model_validate(raw))


def test_orange_eight_preserves_source_target_and_unknown_remainder():
    result = run(payload())
    assert result.target.jerseyNumber == "8"
    assert result.target.kitPrimaryColor == "orange"
    assert [s.sample.timestampSec for s in result.sightings] == [0, 0.5, 1]
    assert result.windows[-1].endSec == 8400
    assert result.windows[-1].state == "UNKNOWN"
    assert result.scope.sourceSha256 == "a" * 64
    assert result.calibrated is result.continuousIdentityValidated is False


@pytest.mark.parametrize("jersey,team,expected", [("8", 0.1, 3), (None, 0.9, 3), ("18", 0.9, 3), ("8", 0.9, 0)])
def test_opposing_duplicate_number_similar_kit_and_ocr_failure(jersey, team, expected):
    raw = payload()
    raw["segments"][0]["tracklets"].append({"trackletId": "competitor", "samples": samples(jersey=jersey, team=team)})
    assert len(run(raw).sightings) == expected


def test_competing_orange_eights_with_millisecond_jitter_are_ambiguous():
    raw = payload()
    raw["segments"][0]["tracklets"].append({"trackletId": "competitor", "samples": samples(0.001)})
    result = run(raw)
    assert not result.sightings
    assert all(w.state == "UNKNOWN" for w in result.windows)


@pytest.mark.parametrize("reason", ["halftime", "camera_cut", "manual_reset"])
def test_break_requires_fresh_votes_even_with_same_tracker_id(reason):
    raw = payload()
    raw["segments"][0]["tracklets"][0]["samples"] = samples(count=5)
    raw["breaks"] = [{"timestampSec": 1.5, "reason": reason}]
    assert [s.sample.timestampSec for s in run(raw).sightings] == [0, 0.5, 1]


def test_reentry_and_segment_boundary_do_not_inherit_identity():
    raw = payload()
    raw["segments"].append({"segmentId": "s1", "startSec": 600.0, "endSec": 1200.0,
                            "tracklets": [{"trackletId": "t0", "samples": samples(600.0, 2)}]})
    result = run(raw)
    assert len(result.sightings) == 3
    raw["segments"][1]["tracklets"][0]["samples"] = samples(620.0, 3)
    result = run(raw)
    assert len(result.sightings) == 6
    assert any(w.startSec == 600 and w.endSec == 620 and w.state == "UNKNOWN" for w in result.windows)
    assert len({s.segmentId for s in result.sightings}) == 2


def test_halftime_is_unknown_even_when_target_is_visible_warming_up():
    raw = payload()
    raw["nonPlayIntervals"] = [{"startSec": 0.0, "endSec": 1.5}]
    assert run(raw).sightings == []
    assert all(w.state == "UNKNOWN" for w in run(raw).windows)


def test_large_camera_motion_does_not_carry_old_votes():
    raw = payload()
    track = raw["segments"][0]["tracklets"][0]
    moved = samples(1.5, 2)
    for sample in moved:
        sample["box"] = (500.0, 10.0, 520.0, 60.0)
    track["samples"].extend(moved)
    assert [s.sample.timestampSec for s in run(raw).sightings] == [0, 0.5, 1]


def test_reference_is_preserved_but_never_labels_unread_track():
    raw = payload()
    raw["references"] = [{"anchorId": "ref8", "scope": raw["scope"], "frameIndex": 30,
                          "timestampSec": 1.0, "evidenceHash": "c" * 64,
                          "box": {"x": 0.1, "y": 0.1, "width": 0.1, "height": 0.2}}]
    raw["segments"][0]["tracklets"][0]["samples"] = samples(jersey=None)
    first = run(raw)
    assert first.references[0].timestampSec == 1
    assert first.references[0].scope == first.scope
    assert first.sightings == []
    assert first == run(raw)
    raw["references"][0]["scope"] = {**raw["scope"], "generation": 2}
    with pytest.raises(ValidationError):
        run(raw)


@pytest.mark.parametrize("change", ["missing_target", "overlap", "scope", "duplicate_time", "nan", "blank_kit"])
def test_invalid_match_evidence_fails_closed(change):
    raw = payload()
    if change == "missing_target":
        del raw["target"]["jerseyNumber"]
    elif change == "overlap":
        raw["segments"].append({**raw["segments"][0], "segmentId": "s1"})
    elif change == "scope":
        raw["scope"]["sourceSha256"] = "invalid"
    elif change == "duplicate_time":
        raw["segments"][0]["tracklets"][0]["samples"][1]["timestampSec"] = 0.0
    elif change == "nan":
        raw["segments"][0]["tracklets"][0]["samples"][0]["teamMatch"] = float("nan")
    else:
        raw["target"]["kitPrimaryColor"] = " "
    with pytest.raises(ValidationError):
        run(raw)
