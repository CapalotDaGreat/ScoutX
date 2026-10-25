"""Controlled background cases, not evidence of calibrated real-match accuracy."""
import numpy as np
import pytest

from app.teams import team_match


def crop(kit, fraction=.3):
    pixels = np.full((100, 100, 3), (100, 160, 50), dtype=np.uint8)
    pixels[:int(100*fraction)] = kit
    return pixels


def test_orange_shirt_is_not_rejected_because_grass_dominates_person_box():
    assert team_match(crop((240, 130, 30)), 'orange') > .99


def test_wrong_kit_remains_rejected_after_background_suppression():
    assert team_match(crop((30, 60, 180)), 'orange', 'white') < .6


@pytest.mark.parametrize('fraction', [0., .01, .09])
def test_too_few_foreground_pixels_fail_closed(fraction):
    assert team_match(crop((240, 130, 30), fraction), 'orange') == 0


def test_green_kit_is_not_suppressed_as_grass():
    assert team_match(np.full((20, 20, 3), (30, 140, 60), dtype=np.uint8), 'green') > .99


def test_unknown_kit_does_not_become_known_from_non_green_pixels():
    assert team_match(crop((240, 130, 30)), 'unknown') == 0
