import numpy as np
import pytest

from app.backends import EasyOcrJerseyReader
from eval.ocr_augmentation import ConservativeScaleReader


def reader(rows):
    calls = []
    class Engine:
        def readtext(self, crop, **kwargs):
            calls.append(crop.shape)
            return [(None, text, score) for text, score in rows[len(calls)-1]]
    delegate = EasyOcrJerseyReader.__new__(EasyOcrJerseyReader)
    engine = delegate._reader = Engine()
    return ConservativeScaleReader(delegate), calls, engine


@pytest.mark.parametrize('rows,expected', [
    ([[], [('20', .9)]], ('20', .9)),
    ([[('20', .99)], [('20', .85)]], ('20', .85)),
    ([[('8', .9)], [('20', .99)]], (None, 0.)),
    ([[('8', .9), ('20', .99)], [('20', .99)]], (None, 0.)),
    ([[('20', .4)], [('20', .5)]], (None, 0.)),
    ([[('2?', .99)], []], (None, 0.)),
])
def test_augmentation_never_counts_multiple_votes_or_ignores_original_conflict(rows, expected):
    wrapped, calls, engine = reader(rows)
    assert wrapped.read(np.zeros((30, 20, 3), dtype=np.uint8)) == expected
    assert calls == [(30, 20, 3), (60, 40, 3)]
    assert wrapped._reader is engine


def test_too_small_crop_is_not_rescued_by_resizing():
    wrapped, calls, _ = reader([[]])
    assert wrapped.read(np.zeros((20, 15, 3), dtype=np.uint8)) == (None, 0.)
    assert calls == []


def test_large_crop_is_not_expanded_without_a_memory_bound():
    wrapped, calls, _ = reader([[('20', .9)]])
    assert wrapped.read(np.zeros((1100, 1000, 3), dtype=np.uint8)) == ('20', .9)
    assert len(calls) == 1


def test_delegate_is_restored_if_augmentation_throws():
    wrapped, _, engine = reader([[('20', .9)]])
    with pytest.raises(IndexError):
        wrapped.read(np.zeros((30, 20, 3), dtype=np.uint8))
    assert wrapped._reader is engine
