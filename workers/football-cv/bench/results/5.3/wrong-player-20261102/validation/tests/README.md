# Worker test-suite evidence (exchange-split candidate)

The logs are kept here on purpose even though the repository ignores `*.log`, so they were force-added.

## Original runs, 2026-11-03 00:13 / 00:14 CET (`suite_x0_20261103T0013.log`, `suite_x1_20261103T0014.log`)

These are the runs behind "614 passed" in commit `c8e95ce`.

- **Code:** checked out at `6559725`. Its worker code is identical to the candidate `93258f7`; the commits after it touched only docs and bench files.
- **Working directory:** `workers/football-cv`.
- **Commands** (exactly as run). Note that `-x` (stop at the first failure) was set only for the flag-off run.
  - `SCOUTX_WEIGHTS_DIR=/home/claude/work/det SCOUTX_EXCHANGE_SPLIT=0 timeout 3000 python3 -m pytest -q -x -p no:cacheprovider`
  - `SCOUTX_WEIGHTS_DIR=/home/claude/work/det SCOUTX_EXCHANGE_SPLIT=1 timeout 3000 python3 -m pytest -q -p no:cacheprovider`
- **Results:**
  - Exit codes 0 and 0. Each file ends with its exit code, recorded as an `rc=` line.
  - 614 passed in each run, with 2 deprecation warnings (ONNX export).
- **Environment:**
  - Linux container (kernel 6.18), Python 3.13.17, CPU only.
  - torch 2.14.1+cu130 (no CUDA device), numpy 2.5.3, OpenCV 4.14.0, onnxruntime 1.29.0, pytest 9.1.1.
  - No other `SCOUTX_*` variables were set.

## Verbose rerun, 2026-11-03 ~13:15 CET (`suite_x{0,1}_verbose.log`, `junit_x{0,1}.xml`, `suite_x{0,1}_provenance.json`)

- Commit `49ec8f0`. It adds only a bench wrapper; the worker code is identical to `93258f7`.
- Command and flag: see each provenance JSON. Both runs used `-v -rA` and wrote a JUnit file.
- Results: exit code 0 for both runs; 614 passed in each, the same counts as the original runs.
- Each log lists every test with its outcome.
- A full-match benchmark was running on the same 2-CPU container at the same time, so the durations are not timing evidence.

## Rerun with the known-failure replays, 2026-11-03 ~17:05 CET (`rerun_with_known_failures/`)

- Commit `c1a0e56`. It adds `tests/test_known_identity_failures.py`; the engine code is unchanged.
- Command: `rerun_with_known_failures/../run_suite.sh` with the output directory changed. Each run is recorded in its provenance JSON.
- **Flag off: 620 passed, 6 xfailed, exit code 0. Flag on: the same.**
  - The 620 passed are the 614 earlier tests plus the 6 new characterisation tests.
  - The 6 xfailed are the strict xfail tests for P, E3 and E4.
