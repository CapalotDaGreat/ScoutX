"""5.2 inference modes: named, reproducible engine configurations (environment presets).

The engine reads its knobs from SCOUTX_* environment variables, several of them at import time,
so a mode is applied by exporting its variables BEFORE the worker starts:

    eval "$(python3 -m scoutx_tracker.modes balanced)"

Only "balanced" (the production default - every variable at its default) is validated for
accuracy. "fast" uses the 5.1 keyframe A/B configuration (detector every 2nd frame, optical-flow
propagation in between), which was 4.3x faster on CPU but produced 0.5 s of wrong claims on a 60 s
slice of IMG_4809 (bench/results/5.1/dense_keyframe_ab.json) - so it is refused unless explicitly
allowed for benchmarking. "detailed" spends more on number reading (no correction OCR deferral);
its benefit is not measured. No mode changes confirmation thresholds.
"""

from __future__ import annotations

import os
import shlex
import sys

MODES: dict[str, dict] = {
    "balanced": {"env": {}, "accuracyValidated": True,
                 "basis": "5.1 production defaults (identity_5.1_final.json)"},
    "fast": {"env": {"SCOUTX_KEYFRAME_EVERY": "2"}, "accuracyValidated": False,
             "basis": "5.1 dense_keyframe_ab.json: 0.5 s wrong claims on one 60 s slice - not approved"},
    "detailed": {"env": {"SCOUTX_CORRECTION_OCR_BUDGET_SEC": "30"}, "accuracyValidated": False,
                 "basis": "reads deferred crops during the correction itself (slower corrections); not measured"},
}
ALLOW_ENV = "SCOUTX_ALLOW_UNVALIDATED_MODE"


def mode_env(name: str, allow_unvalidated: bool | None = None) -> dict[str, str]:
    if name not in MODES:
        raise ValueError(f"unknown mode {name!r}; one of {sorted(MODES)}")
    m = MODES[name]
    allow = os.environ.get(ALLOW_ENV) == "1" if allow_unvalidated is None else allow_unvalidated
    if not m["accuracyValidated"] and not allow:
        raise PermissionError(f"mode {name!r} is not validated for accuracy ({m['basis']}); set {ALLOW_ENV}=1 to benchmark it")
    return dict(m["env"])


def main(argv: list[str]) -> int:
    name = argv[1] if len(argv) > 1 else "balanced"
    try:
        env = mode_env(name)
    except (ValueError, PermissionError) as e:
        print(f"echo {shlex.quote(str(e))} >&2; false", end="")
        return 2
    print("\n".join(f"export {k}={shlex.quote(v)}" for k, v in sorted(env.items())) + f"\nexport SCOUTX_MODE={name}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
