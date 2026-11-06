"""Release-suite accounting. Active only when SCOUTX_RELEASE_SUITE=1."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from bench.release_suite import load_pin, release_errors

_skipped: list[str] = []
_xfailed: list[str] = []
_strict: dict[str, bool] = {}


def _release_run() -> bool:
    return os.environ.get("SCOUTX_RELEASE_SUITE") == "1"


def pytest_configure(config):
    if _release_run():
        config._release_pin = load_pin()


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    del call
    outcome = yield
    if not _release_run():
        return
    report = outcome.get_result()
    if getattr(report, "wasxfail", False):
        if report.when == "call" and report.skipped:
            _xfailed.append(item.nodeid)
            _strict[item.nodeid] = any(mark.kwargs.get("strict") for mark in item.iter_markers("xfail"))
        return
    if report.skipped and report.when in ("setup", "call"):
        _skipped.append(item.nodeid)


def pytest_sessionfinish(session, exitstatus):
    del exitstatus
    if not _release_run():
        return
    errors = release_errors(session.config._release_pin, _xfailed, _strict, _skipped)
    if not errors:
        return
    message = "release suite pin\n" + "\n".join(errors)
    reporter = session.config.pluginmanager.get_plugin("terminalreporter")
    if reporter is not None:
        reporter.write_sep("!", message)
    else:
        print(message, file=sys.stderr)
    session.exitstatus = 1
