"""Kit-colour matching for team assignment. Pure numpy; no faces, no identity."""

from __future__ import annotations

import numpy as np

# Reference colours (RGB) for the kit names the app offers. Unknown names match nothing.
KIT_COLOURS: dict[str, tuple[int, int, int]] = {
    "red": (200, 30, 40),
    "blue": (30, 60, 180),
    "sky blue": (110, 170, 230),
    "navy": (20, 30, 80),
    "white": (235, 235, 235),
    "black": (20, 20, 20),
    "yellow": (240, 210, 40),
    "orange": (240, 130, 30),
    "green": (30, 140, 60),
    "purple": (110, 50, 150),
    "pink": (235, 120, 170),
    "grey": (128, 128, 128),
    "gray": (128, 128, 128),
    "maroon": (110, 20, 40),
}

_MAX_DISTANCE = float(np.sqrt(3 * 255**2))


def kit_rgb(name: str) -> tuple[int, int, int] | None:
    return KIT_COLOURS.get(name.strip().lower())


def dominant_colour(torso: np.ndarray) -> np.ndarray:
    """Median colour of the torso crop (H x W x 3, RGB). Median resists grass and shadows."""
    if torso.ndim != 3 or torso.shape[2] != 3 or torso.size == 0:
        raise ValueError("expected an RGB crop")
    return np.median(torso.reshape(-1, 3), axis=0)


def team_match(torso: np.ndarray, primary: str, secondary: str = "") -> float:
    """0..1 similarity between the crop and the nominated kit; 0 when the kit is unknown."""
    references = [rgb for rgb in (kit_rgb(primary), kit_rgb(secondary)) if rgb is not None]
    if not references:
        return 0.0
    # Running poses make the person box much wider than the shirt. Suppress
    # green-dominant background only for non-green kits, without selecting the
    # requested colour itself. This is an uncalibrated heuristic, not segmentation.
    colour = dominant_colour(torso)
    if KIT_COLOURS['green'] not in references:
        pixels = torso.reshape(-1, 3).astype(float)
        grass = (pixels[:, 1] > pixels[:, 0] * 1.05) & (pixels[:, 1] > pixels[:, 2] * 1.05)
        retained = pixels[~grass]
        if len(retained) < max(16, len(pixels) * 0.1):
            return 0.0
        colour = np.median(retained, axis=0)
    best = min(float(np.linalg.norm(colour - np.array(rgb, dtype=float))) for rgb in references)
    return max(0.0, 1.0 - best / (_MAX_DISTANCE * 0.5))
