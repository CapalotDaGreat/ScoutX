"""5.3 HDR decoding reference candidate: reference-value checks and the metadata guard (bench/hdr_reference.py)."""
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bench"))
import hdr_reference as hr  # noqa: E402

GOOD = {"stream": dict(hr.SUPPORTED, chroma_location="left", width=1920, height=1080, r_frame_rate="10/1"),
        "firstFrame": dict(hr.SUPPORTED), "sideData": [], "dolbyVisionProfile": None}


def test_bt2020_to_bt709_matrix_matches_the_published_bt2087_values():
    published = np.array([[1.6605, -0.5876, -0.0728], [-0.1246, 1.1329, -0.0083], [-0.0182, -0.1006, 1.1187]])
    assert np.allclose(hr.bt2020_to_bt709(), published, atol=1e-4)
    assert np.allclose(hr.bt2020_to_bt709().sum(1), 1.0, atol=1e-12)        # D65 white is preserved


def test_narrow_range_bt2020_ycbcr_reference_values():
    rgb = hr.ycbcr10_narrow_to_rgb(np.array([64, 940, 502]), np.array([512, 512, 512]), np.array([512, 512, 512]))
    assert np.allclose(rgb[0], 0) and np.allclose(rgb[1], 1) and np.allclose(rgb[2], 0.5)
    # encode pure R', G', B' with the BT.2020 NCL equations and decode them back
    for target in np.eye(3):
        r, g, b = target
        y = hr.KR * r + (1 - hr.KR - hr.KB) * g + hr.KB * b
        cb, cr = (b - y) / (2 * (1 - hr.KB)), (r - y) / (2 * (1 - hr.KR))
        codes = 64 + 876 * y, 512 + 896 * cb, 512 + 896 * cr
        assert np.allclose(hr.ycbcr10_narrow_to_rgb(*codes), target, atol=1e-12)


def test_chroma_upsampling_respects_left_siting_and_constants():
    c = np.arange(12, dtype=float).reshape(3, 4) * 10
    up = hr.upsample_chroma_420_loc0(c, 6, 8)
    assert up.shape == (6, 8)
    assert np.allclose(hr.upsample_chroma_420_loc0(np.full((3, 4), 7.0), 6, 8), 7.0)
    # even columns are co-sited horizontally; vertically every chroma row sits between two luma rows
    assert np.allclose(up[0::2, 0::2], 0.75 * c + 0.25 * np.vstack([c[:1], c[:-1]]))
    assert np.allclose(up[0, 1], 0.75 * 5 + 0.25 * 5)                      # between chroma columns 0 and 1


def test_render_keeps_neutrals_and_outputs_bgr():
    grey = hr.render(np.array([[[0.25, 0.25, 0.25], [0.75, 0.75, 0.75]]]))
    assert np.all(np.abs(grey[0, 0].astype(int) - 64) <= 1) and np.all(np.abs(grey[0, 1].astype(int) - 191) <= 1)
    red = hr.render(np.array([[[0.8, 0.0, 0.0]]]))[0, 0]
    assert red[2] > 200 and red[0] == 0                                     # BGR order; out-of-gamut blue clipped


def test_metadata_guard_refuses_sdr_missing_and_conflicting_metadata():
    assert hr.check_source(GOOD) == []
    sdr = {**GOOD, "stream": {**GOOD["stream"], "color_transfer": "bt709", "color_primaries": "bt709", "color_space": "bt709"}}
    with pytest.raises(hr.UnsupportedSource):
        hr.check_source(sdr)
    missing = {**GOOD, "stream": {**GOOD["stream"], "color_transfer": None}}
    with pytest.raises(hr.UnsupportedSource):
        hr.check_source(missing)
    conflict = {**GOOD, "firstFrame": {**GOOD["firstFrame"], "color_range": "pc"}}
    with pytest.raises(hr.UnsupportedSource):
        hr.check_source(conflict)
    dv = {**GOOD, "dolbyVisionProfile": 8}
    assert any("Dolby Vision" in w for w in hr.check_source(dv))
