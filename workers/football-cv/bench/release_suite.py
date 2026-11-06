"""Pinned accounting for the worker release test run.

SCOUTX_RELEASE_SUITE=1 compares the run with bench/release_suite_pin.json.
A different strict known-failure set, or any skip outside the opt-in
whole-match replay, fails the run. Updating the lists means editing that
file and stating the reason in the commit message.
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

PIN_PATH = Path(__file__).with_name("release_suite_pin.json")


def load_pin(path: Path = PIN_PATH) -> dict:
    pin = json.loads(path.read_text(encoding="utf-8"))
    reason = pin.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        raise ValueError(f"{path} needs a non-empty reason")
    for key in ("strictXfail", "allowedSkips"):
        values = pin.get(key)
        if not isinstance(values, list) or not values or len(values) != len(set(values)):
            raise ValueError(f"{path} {key} must be a non-empty list of unique node ids")
    return pin


def release_errors(pin: dict, xfailed: list[str], strict_by_node: dict[str, bool], skipped: list[str]) -> list[str]:
    """Differences between this run and the pinned known-failure and skip lists."""
    errors = []
    expected = list(pin["strictXfail"])
    got = sorted(set(xfailed))
    if got != sorted(expected):
        missing = sorted(set(expected) - set(got))
        extra = sorted(set(got) - set(expected))
        errors.append(f"strict known-failure set changed; missing={missing}; extra={extra}")
    loose = sorted(node for node in got if not strict_by_node.get(node))
    if loose:
        errors.append(f"known-failure tests are not strict=True: {loose}")
    extra_skips = sorted(set(skipped) - set(pin["allowedSkips"]))
    if extra_skips:
        errors.append("skips outside the opt-in whole-match replay: " + ", ".join(extra_skips))
    return errors


def require_release_ffmpeg() -> None:
    """The release run fails when ffmpeg is absent. Other runs still skip."""
    import pytest

    if shutil.which("ffmpeg"):
        return
    if os.environ.get("SCOUTX_RELEASE_SUITE") == "1":
        pytest.fail("ffmpeg is required for the release suite and was not found on PATH")
    pytest.skip("ffmpeg not installed")
