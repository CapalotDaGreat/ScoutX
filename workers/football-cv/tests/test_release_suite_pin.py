"""The release pin is the reviewed list. The comparator is what the suite enforces."""
import json

import pytest
from _pytest.outcomes import Failed, Skipped

from bench.release_suite import PIN_PATH, load_pin, release_errors, require_release_ffmpeg

PINNED_XFAIL = [
    "tests/test_known_identity_failures.py::test_P_desired_no_claim_on_player_a[0]",
    "tests/test_known_identity_failures.py::test_P_desired_no_claim_on_player_a[1]",
    "tests/test_known_identity_failures.py::test_E3_desired_no_claim_on_n_labelled_player[0]",
    "tests/test_known_identity_failures.py::test_E3_desired_no_claim_on_n_labelled_player[1]",
    "tests/test_known_identity_failures.py::test_E4_desired_no_confirmed_claim_on_other_player[0]",
    "tests/test_known_identity_failures.py::test_E4_desired_no_confirmed_claim_on_other_player[1]",
]
PINNED_SKIPS = [
    "tests/test_full_match_identity.py::test_replay_inputs_match_the_committed_provenance",
    "tests/test_full_match_identity.py::test_replay_reproduces_the_full_match_baseline_exactly_and_repeatably",
    "tests/test_full_match_identity.py::test_legitimate_confirmed_20_evidence_at_1161_is_kept",
    "tests/test_full_match_identity.py::test_F6_characterisation_likely_appearance_claims_on_player_6",
    "tests/test_full_match_identity.py::test_F6_desired_no_claim_on_player_6",
    "tests/test_full_match_identity.py::test_F17_characterisation_likely_appearance_claims_on_player_17",
    "tests/test_full_match_identity.py::test_F17_desired_no_claim_on_player_17",
    "tests/test_full_match_identity.py::test_cache_state_characterisation_warm_ocr_cache_changes_identity",
    "tests/test_full_match_identity.py::test_cache_state_desired_same_identity_warm_or_cold",
    "tests/test_full_match_identity.py::test_candidate_C_warm_cache_resolves_exactly_like_the_cold_baseline",
    "tests/test_full_match_identity.py::test_candidate_D_removes_appearance_only_claims_and_keeps_confirmed_20",
]


def test_pin_file_is_the_reviewed_known_failure_and_skip_list():
    pin = load_pin()
    raw = json.loads(PIN_PATH.read_text(encoding="utf-8"))
    assert pin["strictXfail"] == PINNED_XFAIL
    assert pin["allowedSkips"] == PINNED_SKIPS
    assert raw["reason"].strip()


def test_an_extra_skip_or_a_changed_xfail_fails_the_release_run():
    pin = load_pin()
    strict = {node: True for node in pin["strictXfail"]}
    assert release_errors(pin, pin["strictXfail"], strict, pin["allowedSkips"][:3]) == []
    changed = release_errors(pin, pin["strictXfail"][:-1], strict, [])
    assert changed and "missing=" in changed[0]
    loose = dict(strict)
    loose[pin["strictXfail"][0]] = False
    assert any("not strict=True" in line for line in release_errors(pin, pin["strictXfail"], loose, []))
    extra = release_errors(pin, pin["strictXfail"], strict, ["tests/test_full_match_benchmark.py::test_benchmark_refuses_unverified_models"])
    assert any("opt-in whole-match replay" in line for line in extra)


def test_missing_ffmpeg_fails_the_release_suite(monkeypatch):
    monkeypatch.setenv("SCOUTX_RELEASE_SUITE", "1")
    monkeypatch.setattr("bench.release_suite.shutil.which", lambda _name: None)
    with pytest.raises(Failed, match="ffmpeg is required"):
        require_release_ffmpeg()


def test_missing_ffmpeg_skips_outside_the_release_suite(monkeypatch):
    monkeypatch.delenv("SCOUTX_RELEASE_SUITE", raising=False)
    monkeypatch.setattr("bench.release_suite.shutil.which", lambda _name: None)
    with pytest.raises(Skipped, match="ffmpeg not installed"):
        require_release_ffmpeg()
