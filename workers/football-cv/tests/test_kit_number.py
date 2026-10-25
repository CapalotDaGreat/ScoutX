"""Garment OCR policy; synthetic inputs are not real-match validation labels."""
from types import SimpleNamespace

import numpy as np
import pytest

from app.identity import Track, TrackObservation, associate
from app.pipeline import Box, Components, analyse_segment, read_kit_number
from app.contract import SegmentRequest


@pytest.mark.parametrize('torso,shorts,expected', [
    ((None, 0.), ('20', .99), ('20', .99)),
    (('20', .95), (None, 0.), ('20', .95)),
    (('20', .95), ('20', .9), ('20', .9)),
    (('20', .95), ('8', .99), (None, 0.)),
    ((None, 0.), ('2?', .99), (None, 0.)),
    ((None, 0.), ('20', .59), (None, 0.)),
    (('20', float('nan')), (None, 0.), (None, 0.)),
    (('20', .95), ('8', .2), ('20', .95)),
])
def test_garment_reads_are_one_conservative_vote(torso, shorts, expected):
    results = iter([torso, shorts])
    reader = SimpleNamespace(read=lambda _: next(results))
    assert read_kit_number(np.zeros((200, 100, 3), dtype=np.uint8),
                           Box(0, 0, 100, 200, .95), reader) == expected


def test_two_matching_garments_on_one_frame_cannot_supply_three_votes():
    result = read_kit_number(np.zeros((200, 100, 3), dtype=np.uint8), Box(0, 0, 100, 200, .95),
                             SimpleNamespace(read=lambda _: ('20', .99)))
    observations = [TrackObservation(242., result[0], result[1], .9, (0, 0, 100, 200))]
    assert associate([Track('orange20', observations)], '20', kit_known=True).target_tracks == []


@pytest.mark.parametrize('torso,shorts,expected', [(None, '20', 3), ('20', '18', 0)])
def test_pipeline_requires_three_distinct_uncontested_number_observations(torso, shorts, expected):
    class Source:
        def frames(self, *args):
            for t in (0., .5, 1.):
                yield t, np.full((200, 100, 3), (240, 130, 30), dtype=np.uint8)
    reads = iter([(torso, .99), (shorts, .99)] * 3)
    components = Components(Source(), SimpleNamespace(people=lambda _: [Box(0, 0, 100, 200, .99)]),
        lambda: SimpleNamespace(update=lambda boxes: [('target', box) for box in boxes]),
        SimpleNamespace(read=lambda _: next(reads)))
    request = SegmentRequest.model_validate({'contractVersion': 2, 'jobId': 'orange20', 'segmentIndex': 0,
        'startSec': 0., 'endSec': 2., 'source': {'url': 'https://evaluation.invalid/local'},
        'target': {'jerseyNumber': '20', 'kitPrimaryColor': 'orange'}, 'sampling': {'fps': 2},
        'privacy': {'retainNonTargetIdentities': False, 'faceRecognition': False, 'persistMedia': False}})
    trace = []
    result = analyse_segment(request, components, trace)
    assert len(trace) == expected
    assert result.coverage.targetVisibleSec == expected * .5
