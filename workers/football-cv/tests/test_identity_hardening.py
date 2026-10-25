"""Synthetic regression evidence, not real-footage accuracy measurements."""
import numpy as np
import pytest

from app.identity import Track, TrackObservation, associate, availability_windows, candidate_payload, target_trace
from app.contract import SegmentRequest, SegmentResult
from app.pipeline import analyse_segment
from eval.evaluate import identity_counts
from test_worker import components, request_body
from app.backends import EasyOcrJerseyReader


BOX = (10, 10, 30, 60)


def observations(readings, start=0, team=0.9, box=BOX):
    return [TrackObservation(start + i * 0.5, value, confidence, team, box)
            for i, (value, confidence) in enumerate(readings)]


def times(association):
    return [p["timeSec"] for p in target_trace(association)]


@pytest.mark.parametrize("read", ["1?", "?7", "１７", "123", "", None, " 17", "17x"])
def test_invalid_readings_cannot_confirm(read):
    assert not associate([Track("a", observations([(read, 0.99)] * 8))], "17").target_tracks


@pytest.mark.parametrize("confidence", [float("nan"), float("inf"), -1, 1.1, 0.59])
def test_invalid_confidence_cannot_confirm(confidence):
    assert not associate([Track("a", observations([("17", confidence)] * 8))], "17").target_tracks


def test_consensus_beats_single_highest_confidence_and_excludes_conflict():
    track = Track("a", observations([("17", 0.9)] * 4 + [("7", 0.99)]))
    association = associate([track], "17")
    assert times(association) == [0, 0.5, 1, 1.5]
    assert candidate_payload([track])[0]["jerseyRead"] == "17"


def test_tied_conflicting_consensus_stays_unknown():
    track = Track("a", observations([("17", 0.9), ("7", 0.9)] * 3))
    assert not associate([track], "17").target_tracks
    assert candidate_payload([track])[0]["jerseyRead"] is None


def test_duplicate_frame_votes_do_not_confirm():
    track = Track("a", [TrackObservation(0, "17", 0.9, 0.9, BOX)] * 3)
    assert not associate([track], "17").target_tracks


@pytest.mark.parametrize("texts,expected", [(["17"], "17"), (["17", "7"], None),
                                           (["1?7"], None), (["17", "17"], "17")])
def test_ocr_never_strips_partial_digits_or_picks_conflicting_regions(texts, expected):
    class Reader:
        def readtext(self, *args, **kwargs):
            return [(None, text, 0.9) for text in texts]
    reader = EasyOcrJerseyReader.__new__(EasyOcrJerseyReader)
    reader._reader = Reader()
    assert reader.read(np.zeros((30, 20, 3), dtype=np.uint8))[0] == expected


def test_later_reads_do_not_contaminate_unread_prefix_or_switched_suffix():
    readings = [(None, 0)] * 20 + [("17", 0.9)] * 8 + [("7", 0.9)] * 20
    association = associate([Track("a", observations(readings))], "17")
    assert times(association)
    assert all(10 <= t < 14 for t in times(association))
    truth = [{"timeSec": i * 0.5, "box": list(BOX) if 20 <= i < 28 else None}
             for i in range(len(readings))]
    assert identity_counts(truth, target_trace(association), 0.01)["wrongPerson"] == 0


@pytest.mark.parametrize("boundary", ["gap", "jump", "kit"])
def test_tracker_reuse_needs_fresh_evidence(boundary):
    first = observations([("17", 0.9)] * 3)
    if boundary == "kit":
        first += observations([(None, 0)], start=1.5, team=0.1)
    second = observations([("17", 0.9)] * 2, start=20 if boundary == "gap" else 2,
                          box=(500, 10, 520, 60) if boundary == "jump" else BOX)
    association = associate([Track("a", first + second)], "17", kit_known=True)
    assert times(association) == [0, 0.5, 1]


def test_45_second_reentry_gap_remains_unknown_without_trace_or_action():
    track = Track("a", observations([("17", 0.9)] * 6)
                  + observations([("17", 0.9)] * 6, start=48))
    association = associate([track], "17")
    windows = availability_windows(association, 0, 60, 0.5, True)
    assert {"startSec": 3, "endSec": 48, "state": "UNKNOWN", "confidence": 0} in windows
    assert all(t < 3 or t >= 48 for t in times(association))


class SequenceSource:
    def __init__(self, times, cut=False):
        self.times, self.cut = times, cut

    def frames(self, *args):
        for i, time in enumerate(self.times):
            frame = np.full((720, 1280, 3), 255 if self.cut and i >= 3 else 0, dtype=np.uint8)
            frame[100:160, 600:630] = (205, 35, 45)
            yield time, frame


@pytest.mark.parametrize("source", [SequenceSource([0, 0.5, 1, 20, 20.5]),
                                    SequenceSource([0, 0.5, 1, 1.5, 2], cut=True)])
def test_pipeline_cut_or_gap_cannot_reuse_tracker_votes(source):
    trace = []
    result = analyse_segment(SegmentRequest.model_validate(request_body()), components(source), trace)
    assert [p["timeSec"] for p in trace] == [0, 0.5, 1]
    assert result.events == []
    assert SegmentResult.model_validate(result.model_dump()).contractVersion == 2
    assert set(result.model_dump()) == {"contractVersion", "workerVersion", "models", "segmentIndex",
        "stages", "cameraView", "identity", "availability", "coverage", "events"}


@pytest.mark.parametrize("bad_times", [[0, 0, 0.5], [1, 0.5], [0, float("nan")], [0, 60]])
def test_invalid_frame_times_fail_closed(bad_times):
    result = analyse_segment(SegmentRequest.model_validate(request_body()), components(SequenceSource(bad_times)))
    assert result.stages.tracking == "failed"
    assert result.coverage.targetVisibleSec == 0
