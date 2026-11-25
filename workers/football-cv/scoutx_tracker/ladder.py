"""Admission rules for the benchmark ladder.

A small hypothesis does not get a fresh full-recording run. An extraction change does not get
to claim correctness from cached features. Fixed stride and the rejected window candidate are
refused by name.
"""

from __future__ import annotations

from dataclasses import dataclass

LEVELS = {
    0: "unit_synthetic",
    1: "difficult_windows",
    2: "multi_window",
    3: "frozen_replay",
    4: "fresh_full_recording",
    5: "held_out_match",
}
FULL_RECORDING_LIMIT_SEC = 2 * 60 * 60


@dataclass(frozen=True)
class Proposal:
    hypothesis: str
    expected_benefit: str
    inputs: str
    expected_runtime_sec: float
    resource: str
    acceptance: str
    stop: str
    level: int
    changes_extraction: bool = False
    uses_cached_extraction: bool = False
    owner_approval: bool = False
    name: str = ""


@dataclass(frozen=True)
class Admission:
    admitted: bool
    reason: str
    level: int
    level_name: str


def _blank(value: str) -> bool:
    return not value or not value.strip()


def review(proposal: Proposal) -> Admission:
    if proposal.level not in LEVELS:
        raise ValueError(f"level must be one of {sorted(LEVELS)}")
    name = LEVELS[proposal.level]
    text = f"{proposal.name} {proposal.hypothesis}".lower()
    if "fixed stride" in text or "keyframe every 2" in text or "keyframe_every" in text:
        return Admission(False, "fixed stride already failed and is not adaptive inference", proposal.level, name)
    if "0.706" in text:
        return Admission(False, "the 0.706 window candidate failed both gates and is not promoted", proposal.level, name)
    missing = [field for field in ("hypothesis", "expected_benefit", "inputs", "resource", "acceptance", "stop")
               if _blank(getattr(proposal, field))]
    if missing:
        return Admission(False, "missing " + ", ".join(missing), proposal.level, name)
    if not (proposal.expected_runtime_sec >= 0):
        return Admission(False, "expected runtime must be a non-negative number of seconds", proposal.level, name)
    if proposal.changes_extraction and proposal.uses_cached_extraction and proposal.level >= 3:
        return Admission(False, "an extraction change cannot establish correctness from stale cached features",
                         proposal.level, name)
    if proposal.level >= 4 and not proposal.owner_approval:
        return Admission(False, "a fresh or held-out full recording needs owner approval", proposal.level, name)
    if proposal.level >= 4 and proposal.expected_runtime_sec > FULL_RECORDING_LIMIT_SEC:
        return Admission(False, "a run longer than two hours has to be justified on a lower rung first",
                         proposal.level, name)
    if proposal.level == 5 and proposal.changes_extraction:
        return Admission(False, "held-out footage is for validation, not for changing extraction", proposal.level, name)
    return Admission(True, "admitted", proposal.level, name)
