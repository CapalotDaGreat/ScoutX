"""Synthetic continuity checks with the installed tracker, not match accuracy."""
from types import SimpleNamespace
from contextlib import nullcontext

import numpy as np
import pytest

from app.backends import ByteTrackTracker, RtDetrDetector
from app.contract import SegmentRequest
from app.pipeline import Box, Components, analyse_segment, usable_box
from test_worker import request_body


def test_bytetrack_keeps_existing_id_through_low_score_detection():
    tracker = ByteTrackTracker(2.0)
    high = Box(100, 100, 130, 180, 0.95)
    low = Box(100, 100, 130, 180, 0.2)
    outputs = [tracker.update([box]) for box in (high, high, low, high)]
    assert all(len(output) == 1 for output in outputs)
    assert len({output[0][0] for output in outputs}) == 1
    assert outputs[2][0][1].score == pytest.approx(0.2)


def test_low_score_boxes_cannot_start_a_new_bytetrack_identity():
    tracker = ByteTrackTracker(2.0)
    assert all(tracker.update([Box(100, 100, 130, 180, 0.2)]) == [] for _ in range(8))


def test_detector_preserves_low_confidence_person_for_tracker():
    calls = []

    class Processor:
        def __call__(self, **kwargs):
            class Inputs(dict):
                def to(self, device):
                    return self
            return Inputs()

        def post_process_object_detection(self, outputs, **kwargs):
            calls.append(kwargs)
            return [{'scores': np.array([0.2, 0.95]), 'labels': np.array([0, 1]),
                     'boxes': np.array([[10, 10, 30, 60], [40, 10, 60, 60]])}]

    class Model:
        config = SimpleNamespace(id2label={0: 'person', 1: 'ball'})

        def __call__(self, **kwargs):
            return None

    detector = RtDetrDetector.__new__(RtDetrDetector)
    detector._torch = SimpleNamespace(no_grad=nullcontext)
    detector._device = 'cpu'
    detector._processor, detector._model = Processor(), Model()
    assert detector.people(np.zeros((100, 100, 3), dtype=np.uint8)) == [Box(10, 10, 30, 60, 0.2)]
    assert calls == [{'target_sizes': [(100, 100)], 'threshold': 0.1}]


@pytest.mark.parametrize('box', [Box(1, 2, 3, 4, float('nan')), Box(1, 2, 3, 4, 1.1),
                                Box(float('inf'), 2, 3, 4, 0.9), Box(3, 2, 1, 4, 0.9),
                                Box(1, 2, 3, 4, 0.1), Box(150, 2, 160, 4, 0.9)])
def test_invalid_or_outside_boxes_are_rejected(box):
    assert usable_box(box, 100, 100) is None


def test_partly_visible_detection_is_clipped_before_ocr():
    assert usable_box(Box(-5, -10, 120, 80, 0.9), 100, 100) == Box(0, 0, 100, 80, 0.9)


def parts(scores):
    tracker_inputs, ocr_inputs = [], []

    class Source:
        def frames(self, *args):
            for index in range(len(scores)):
                yield index * 0.5, np.full((200, 200, 3), (240, 130, 30), dtype=np.uint8)

    class Detector:
        def __init__(self):
            self.scores = iter(scores)

        def people(self, frame):
            return [Box(50, 20, 100, 180, next(self.scores))]

    class Tracker:
        def update(self, boxes):
            tracker_inputs.extend(boxes)
            return [('same-local-id', box) for box in boxes]

    def read(crop):
        ocr_inputs.append(crop.shape)
        return '8', 0.95

    return Components(Source(), Detector(), Tracker, SimpleNamespace(read=read)), tracker_inputs, ocr_inputs


def orange_request():
    body = request_body(endSec=6)
    body['target'] = {**body['target'], 'kitPrimaryColor': 'orange', 'kitSecondaryColor': ''}
    return SegmentRequest.model_validate(body)


def test_low_score_recovery_does_not_invent_jersey_evidence_or_visibility():
    components, tracker_inputs, ocr_inputs = parts([0.95] * 3 + [0.2] * 3 + [0.95] * 3)
    trace = []
    result = analyse_segment(orange_request(), components, trace)
    assert len(tracker_inputs) == 9
    assert len(ocr_inputs) == 12
    assert [point['timeSec'] for point in trace] == [0, 0.5, 1, 3, 3.5, 4]
    assert any(window.state == 'UNKNOWN' and window.startSec == 1.5 and window.endSec == 3
               for window in result.availability)
    assert result.coverage.targetVisibleSec == 3
    assert result.events == []
    assert result.stages.pitch == result.stages.events == 'unavailable'


def test_low_score_only_pipeline_never_calls_ocr_or_confirms_target():
    components, tracker_inputs, ocr_inputs = parts([0.2] * 8)
    trace = []
    result = analyse_segment(orange_request(), components, trace)
    assert len(tracker_inputs) == 8
    assert not ocr_inputs and not trace
    assert result.coverage.targetVisibleSec == 0
    assert all(window.state == 'UNKNOWN' for window in result.availability)
