# Flagship overhaul progress

Phase 3 selection repair, measured on the archived IMG_4809 windows. No full-match
candidate has been run. The CPU8 reference is unchanged: claimed recall 0.621,
IDF1 0.766, 6,628.491 seconds, confirmed-correct 10.5 seconds.

## E3 root cause

On `reference_i0225` the chain published tracklet 78 (a distant same-kit player)
instead of tracklet 188 (the player who continues into the verified number read).

| | tracklet 78 (chosen before) | tracklet 188 (the target) |
|---|---|---|
| raw colour logit | 2.35 | below the reported top |
| appearance score | 0.795 | 0.258 |
| median height | 60.8 px | 142.2 px |
| samples | 17 | 36 |
| jersey reads | none | none |
| unary before the repair | +2.31 | −3.80 |
| gap to the number read | 1.0 s | 0.1 s |
| panorama step to that read | 2.65 body heights | 0.09 body heights |

The colour score really does prefer the small distant crop. Rank normalisation is
not inventing that preference from a negative logit. The chain already treats a
step of at most 0.5 s and 0.75 body heights as one followed player, but it pays
that reward to the verified piece, which is already selected. The fragment that
actually joins the read keeps the "probably someone else" prior, and the
look-alike's appearance unary wins the overlap.

## Change

`resolve_identity` now cancels that prior on a fragment that ends in a clean
hand-off into a verified sighting, and adds the same fixed hand-off preference
(`3.0`) that `_transition` pays a forward continuation. The limits are the
existing hand-off limits. An unclear contact link does not qualify, and a
contact piece only accepts its recorded predecessor. No tracklet id, frame,
jersey number, or fixture is named in the rule. `SCOUTX_DETOUR_SPLIT` and
`SCOUTX_RESUME_SPLIT` stay off. The publication guards and the consulted-only
OCR filter are unchanged.

Symbols: `_clean_predecessor`, the unary adjustment inside `resolve_identity`.

## Reference window, exchange split off

Compared with the archived timeline, frames 127–162 move onto the target and
frame 211 stays unpublished (the existing one-frame guard).

- Correct claims added: 35 (IoU ≥ 0.5 with a T label).
- Correct claims removed: 0.
- Wrong claims added: 0 (IoU ≥ 0.5 with an N label).
- Wrong claims removed: 9, including the E3 frames 136–138 and 145–149.
- Those E3 frames are now LIKELY / anchored, IoU with T from 0.91 to 0.97.
- No other frames of this window change.

Exchange split on also puts those frames on T and adds no N claim at IoU ≥ 0.5.
It still rewrites the later confirmed stretch, which is that candidate's existing
behaviour, so it stays off.

## Default window

Before this recovery the only difference from the archive was frames 194–197, which
the publication guard dropped. The section below is what those frames are now.

## Pause-and-resume recovery

Tracklet 171 is anchored to the number read through w191 and has no rows at w192–193.
Its rows at w194–197 are the other player: the panorama step is real, and the box
shrinks below three quarters of the previous body size, so the publication guard
still refuses them. The target is not missing from the detections. Track 202, the
post-contact piece of the other raw track (the link at 19.3 s is unclear, so
identity does not cross it), keeps the body size on exactly those four frames and
sits on the target.

`reacquire_interrupted_rows` publishes that other track, and only on the frames the
guard already refused. w193 is the steal frame and is not one of those frames, so
it stays unclaimed. The chain, the OCR crop set and the tracklet boundaries are
unchanged. `SCOUTX_RESUME_SPLIT` stays off.

On the default window the only frames that differ from the archive are still
194–197. They are now LIKELY / anchored on the target (IoU 0.84 with the labelled
continuation at 194, and 0.89–0.94 with piece 39 at 195–197) and clear of player A.
w185–191 are unchanged. w192–193 stay absent, so distance is not bridged across the
hole. The window is too short for a physical total (still "only 2 s of valid motion"),
and the sprint list stays empty. Likely time stays 5.7 s because four wrong claims
were replaced by four correct ones.

The reference window is unchanged from the E3 repair: frames 127–162 on the target,
frame 211 unpublished. No further frames moved.

## Continuation after the refused tail

`extend_recovered_track` walks forward on the track that filled the refused frames.
Each row has to continue the previous one in the same shot. The walk stops before a
gap longer than the publication hole, before a panorama step of at least 0.45 body
heights that also misses the previous image box, before a row already in contact
with a team-mate, and before a frame another chosen tracklet already owns. A pan,
which moves the image box and not the panorama point, is kept. The contact row is
not published.

On the default window this adds frames 198–207. They are LIKELY / reacquired, IoU
0.82–0.97 with piece 39, the same player as the recovered tail. Frame 208 is the
first step that jumps and misses the previous box, so it stays absent, as do 192–193.
Frames 185–191 and the chain are unchanged. Likely time goes from 5.7 s to 6.7 s.
Distance is still unavailable (only 2 s of valid motion) and the sprint list is empty.
The reference window is unchanged from the E3 repair.

Evidence `reacquired` is likely and never confirmed. It is not written back into the
identity gallery. `SCOUTX_RESUME_SPLIT` stays off.

## Tests

`pytest -q` in `workers/football-cv`, venv, 139 seconds: 720 passed, 11 skipped, 1 warning. No executed xfails. The 11 skips are the full-match replay. The warning is the existing Starlette deprecation from the FastAPI test client.

## Not measured

- Full-match claimed recall, IDF1, and runtime. The replay is not in this environment.
- F6 and F17. Their tests still skip without that replay. They are not repaired.
- A speedup against the 6,628-second CPU8 run.

The only other archived development windows on disk are these two replays.
There is no held-out window in the local results tree to score.

## Gates and flags

`balanced_5.2` and `coverage_floor.json` were not edited. Production defaults
were not changed. OCR entries that this pass did not consult are still not
identity evidence, and `SCOUTX_OCR_CONSULTED_ONLY=0` is still ignored.

## Phase 6 candidate freeze

Git HEAD `96d88b1565add01cbbe8f5056a970a020d60b93f`. The identity changes are uncommitted. Working tree: 15 modified files, 429 insertions, 72 deletions, plus untracked `docs/video/flagship-overhaul-progress.md`, `bench/gates/coverage_floor.json`, `tests/test_continuous_observations.py`, and the untracked `bench/results/5.3/cpu8-regate-20261122/` cloud session, which is not part of this candidate. Not committed and not pushed.

Source hashes (SHA-256):

- `identity.py` `131c76d2d153c6f73a55267ffc25d3e36515ef679e568c8451bc2a5da00dbaa0`
- `stats.py` `6ca8a5002a1787bfcc681da8f3ae1063cfec9f4073af5e1e3296f57b4323b409`
- `analyze.py` `662bca94f9266707ff2972dcc8b6272e379226d2affa7e3b5f92b211b8d020b6`

Flags, all at their current defaults: `SCOUTX_DETOUR_SPLIT` off, `SCOUTX_RESUME_SPLIT` off, `SCOUTX_EXCHANGE_SPLIT` off, `SCOUTX_APPEARANCE_ONLY_LIKELY` on, `SCOUTX_OCR_CONSULTED_ONLY` ignored. Gallery self-training off. Gates `balanced_5.2.json` and `coverage_floor.json` unchanged. Last worker suite: 720 passed, 11 skipped, 139 seconds.

Archived windows, exchange split off: reference frames 127–162 on the target and frame 211 unpublished; default frames 194–207 on the target, 192–193 and 208 unclaimed.

## Full-match replay

`SCOUTX_FULL_MATCH_REPLAY` must be a directory. `bench/full_match_replay.py run` expects `provenance.json` with schema `pitchproof.full-match-replay.v1`, seven chunk directories `chunks/c_00000` through `chunks/c_00006` each holding `detections.npz` and `meta.json`, plus `crops.json`, `ocr_reads.json`, `sightings.json`, `original_result.json` and `original_timeline.npz`. No footage and no crop images. The test `test_replay_inputs_match_the_committed_provenance` requires every file hash to equal `bench/results/5.3/full-match-identity-20261103/full_match_replay_provenance.json`. The first chunk's detections hash is `4b9914adf42ad21d0b8e0ddd0f214b84e55c971297d115ba3f84661c2e4f322d`. The discovery fingerprint is `c84c3e2f5a9594a8c54ae326ef669ca0a0a58dceb15adb0f286152db270ec4df`. The original timeline hash is `fad444c127030a41c9e07e1b7bb0fbc25f668a6f6860f65c605c96e8e0277d7c`. The documented location is `/home/claude/work/fmr/replay`, built from `/home/claude/work/fm/work_x0` plus the extra OCR cache `/home/claude/work/fm/work_x1/stage1/ocr_cache.json`.

That directory is not on this machine. The ScoutX, ScoutX-gpu-benchmark and ScoutX-resolve-timeout trees contain only the hash file. Local stage-1 works under `.local/fm-linux-cold-20261106` and `.local/fm-detour-cpu-20261106-resolve` have first-chunk hashes `a060fb73…` and `0e9054b3…`, and discovery fingerprint `81451a61…`. They are different extractions and were not used.

YOLOX weights are present in `%USERPROFILE%\.cache\scoutx\weights` (`yolox_s.1280.onnx`, `yolox_s.416.onnx`, `yolox_s.pth`). ffmpeg and ffprobe are on PATH. The proxy parts and `IMG_4809_proxy_10fps.mp4` are in the authorized downloads folder. Re-detecting them would not reproduce the hashed chunks.

`pytest tests/test_full_match_identity.py -q -rs` skips all 10 tests with `set SCOUTX_FULL_MATCH_REPLAY (opt-in)`. F6 and F17 were not executed. Full-match recall, IDF1, both gates, and stage timings against this candidate were not measured. The CPU8 numbers stay 0.621, 0.766, 10.5 seconds confirmed-correct, 6,628.491 seconds.

Once `work_x0` is restored:

```
python bench/full_match_replay.py build --work <work_x0> --extra-reads <work_x1>/stage1/ocr_cache.json --out <replay>
```

Confirm `provenance.json` `files` equals the committed hash file, then:

```
$env:SCOUTX_FULL_MATCH_REPLAY='<replay>'
python -m pytest tests/test_full_match_identity.py -q --tb=line
```

## Replay recovery, 2026-11-24

`/home/claude/work/fm/work_x0` and `/home/claude/work/fmr/replay` are not on this machine. Ubuntu WSL has no `/home/claude`. The ScoutX, GPU-benchmark and resolve-timeout trees, their `.local` stage-1 works, and git contain no file with detections hash `4b9914ad…`. Local stage-1 works stay rejected (`a060fb73…` and `0e9054b3…`, discovery `81451a61…`).

One required file is present and byte-identical: `full-match-exchange-audit-20261103/baseline/timeline.npz` is `fad444c127030a41c9e07e1b7bb0fbc25f668a6f6860f65c605c96e8e0277d7c`, 262,330 bytes. The other 18 replay files are absent. `bench/full_match_replay.py build` was not run.

The manifest is `bench/results/5.3/full-match-identity-20261103/replay_recovery_manifest.json`. Recovery needs a private copy of the original replay directory, or of `work_x0` plus `work_x1/stage1/ocr_cache.json`, from the Linux host that produced them. No object-store path for that bundle is recorded.

## Next step

Restore that replay directory and run the ten full-match identity tests, including F6 and F17, before any further tracking change.
