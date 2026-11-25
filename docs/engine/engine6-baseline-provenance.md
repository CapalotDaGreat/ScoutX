# Engine 6.1 baseline attempt, 2026-11-25

The full-recording replay was not started. This PC is not the container that passed the gate.

## What matches

The gate-passing file is commit `4c2a827`, path `workers/football-cv/bench/results/cpu8-cloudrun-20261122/full_match.json`. That commit is not on `main`. An exact copy is in `.local/engine6/cpu8-4c2a827/`, which is gitignored.

| File | SHA-256 | Bytes |
|---|---|---|
| `full_match.json` | `cee22a220030de4bcfedbe72adeb6e7a9e4c112baf229fb63ab16daa3fabe14f` | 15,044 |
| `full_match_claims.json` | `cbd2dbb8576954acde3d0d156f19db8ae91f225b3802f93b7aad5e871592b846` | 683,865 |

Those two hashes are the ones in `docs/release/cpu8-regate-session-summary-2026-11-23.md`. The preserved numbers are unchanged: 2,035 s proxy, wall 6,628.491 s, extraction 4,897.764 s, detect 3,878.86 s, discovery 1,035.395 s, resolve 610.872 s, claimed recall 0.621, IDF1 0.766, confirmed-correct 10.5 s, wrong identity 0. The result's own gate check passed `balanced-5.2` on the absolute wrong-identity fields only (`baselineUsed: false`). `coverage_floor` was not re-run.

The result records `image.gitCommit` and `SCOUTX_GIT_COMMIT` as `bc5a9d13f669bc92f869b6937ad4085b26551d2b`. The worktree `C:\ZLI\M335\ScoutX-resolve-timeout` is that commit. Its `workers/football-cv/requirements-gpu.lock` hashes to `7a7dfa9601658ffe0c00fb403f95e60c46d2badd482bc41bfdaf6824f3e96389`. So `7a7dfa96` is the lock inside `bc5a9d1`, not a second image. It stays the historical reference lock. It was not merged into `main`.

The build record `image.json` names image digest `sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d`. The result JSON itself has `image.lockSha256: null` and `image.built: null`. The process did not attest the lock or the digest.

## What does not match, and why the replay stopped

| Piece | Gate run | This PC |
|---|---|---|
| OS | Linux, glibc 2.39 | Windows |
| Python | 3.13.17 | 3.12.10 |
| torch | 2.14.1+cu130, CUDA reported unavailable | 2.8.0+cpu |
| OpenCV | 4.14.0 | 5.0.0 |
| ffmpeg | 6.1.1-3ubuntu5 | 9.0.2 gyan.dev |
| ONNX Runtime | 1.29.0, CPU provider selected | not the benchmark stack |
| Container | digest `7e8d4872…` | Docker is not running. The image was not pulled |

A fresh extraction here would be a new configuration. It cannot be used as `fmr-v2` and it cannot be compared as a reproduction of the CPU8 claims. `compare_runs.py` was not run. F6 and F17 were not re-pointed. The 2026-11-03 replay remains the 18 missing files in `replay_recovery_manifest.json`.

What is required to reconstruct the run: the image `europe-west6-docker.pkg.dev/pitchproof-stg-pilot2/scoutx-pilot-images/tracker@sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d`, run with `SCOUTX_ORT_PROVIDERS=CPUExecutionProvider` and balanced mode, on the proxy whose SHA-256 is below. Pulling or starting that image was not done. A rebuild from `bc5a9d1` would be a new digest until it is shown to equal `7e8d4872`.

## Decoder measurement

Measured on this PC only. Detection, OCR and identity were not run. Source files were read and not modified.

| File | SHA-256 prefix | Bytes | Probe |
|---|---|---|---|
| `IMG_4809_proxy_10fps.mp4` | `b1077af3c975e0e1` | 1,413,632,177 | 1920×1080, 10 fps, 2,035.0 s, `yuv420p10le`, HLG, BT.2020, tv |
| `IMG_4809.MOV` | `6450a5bbcbddd593` | 2,234,907,293 | 1920×1080, 29.997 fps, 2,034.892 s, `yuv420p10le`, HLG, BT.2020, tv, Dolby Vision side data not used |

The original is the same match length as the proxy, at three times the frame rate. It is not a 140-minute file.

Window 1,150–1,151 s, ten proxy frames. OpenCV 5.0.0 and an FFmpeg BT.601 limited-range conversion were byte-identical on all ten (`meanAbs` 0). BT.709 limited-range differed by mean absolute code 1.948, identical frames 0. The explicit HLG working-space filter in `colour.py` (`zscale`, `npl=203`, BT.709 output) differed by mean absolute code 27.42, identical frames 0. The production extractor still uses OpenCV. On this PC that is the BT.601 path. The Linux OpenCV path that passed the gate was a different conversion, already shown in `windows-bundle-decode-trace-2026-11-02.md`.

One frame of the original at 1,150 s, without a frame-rate filter, was also byte-identical to BT.601. A ten-frame pairing that resampled the 30 fps file to 10 fps was not frame-aligned, so its mean absolute difference of about 5 is not a colour result.

The default decoder was not changed.

## Planner

`tests/unit/trackingOrchestrator.test.ts` already plans a 8,400 s recording as contiguous segments, first segment 120 s, none over 900 s, at most 61 segments. That test passed with the rest of the file: 10 passed, 0 failed. That is the planner's shape. It does not show that resolve finishes. The measured resolve is 610.872 s for 2,035 s of video. Scaled in a straight line to 8,400 s it is about 2,522 s, past the 1,680 s client. That scale is not a measurement.

## Not done

No speed change, no cost change, no identity change, no gate edit, no production flag, no cloud call. The uncommitted 0.706 candidate was not promoted. Phase 18 stays paused.
