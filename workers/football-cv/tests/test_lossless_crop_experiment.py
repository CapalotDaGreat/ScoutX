"""Codec experiments preserve all crop pixels and detection associations."""
from pathlib import Path
import sys
from types import SimpleNamespace

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'bench'))
import lossless_crop_experiment as experiment


@pytest.mark.parametrize('incomplete', [False, True])
def test_regeneration_preserves_every_retained_crop_and_rejects_missing_frames(tmp_path, monkeypatch, incomplete):
    rng = np.random.default_rng(4)
    frames = [rng.integers(0, 256, (60, 80, 3), dtype=np.uint8) for _ in range(2)]
    box = [10., 10., 30., 50.]
    paths = {}
    for i in range(2):
        path = tmp_path / f'{i:06d}_{i}.jpg'
        cv2.imwrite(str(path), experiment.padded_crop(frames[i], box), [cv2.IMWRITE_JPEG_QUALITY, 92])
        paths[i] = str(path)
    class Capture:
        released = False
        def __init__(self): self.index = 0
        def get(self, _): return 10.
        def set(self, *_): return True
        def read(self):
            if self.index >= (1 if incomplete else 2): return False, None
            frame = frames[self.index]; self.index += 1
            return True, frame
        def release(self): self.released = True
    capture = Capture()
    monkeypatch.setattr(experiment.cv2, 'VideoCapture', lambda _: capture)
    data = SimpleNamespace(dets=np.array([[i, i / 10, *box, .9] for i in range(2)]),
                           times=np.array([0., .1]), crops=paths)
    if incomplete:
        with pytest.raises(ValueError, match='incomplete'):
            experiment.regenerate_crops(Path('fake'), data, tmp_path / 'png')
    else:
        result = experiment.regenerate_crops(Path('fake'), data, tmp_path / 'png')
        assert set(result) == set(paths)
        for i in paths:
            assert result[i].endswith('.png')
            np.testing.assert_array_equal(cv2.imread(result[i]), experiment.padded_crop(frames[i], box))
    assert capture.released
