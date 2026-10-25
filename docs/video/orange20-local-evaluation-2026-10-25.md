# Orange #20 local evaluation - 2026-10-25

## Outcome

**Continuous tracking is not validated or fully functional on this recording.**
This work ran actual local detector/OCR/tracker inference, not only synthetic
tests. It found actionable crop and kit-matching failures, implemented guarded
improvements and retained the remaining failure in the results.

No model weights were trained or fine-tuned. No footage, frames, labels or
predictions were uploaded. No production deployment, secret, feature flag or CV
approval was changed. The new candidate worker is `football-cv/0.7.0`;
`APPROVED_CV_WORKER` remains `null`.

## Source And Reference

- Authorized local file: `C:\Users\masap\Downloads\Mobile Devices\IMG_4809.MOV`.
- Size: 2,234,907,293 bytes; resolution: 1920 x 1080.
- Duration: 2034.8916667 seconds, about 33:55. This is not the separate 140-minute
  orange #8 Veo recording.
- Source SHA-256, rechecked after processing:
  `6450a5bbcbddd593447b30b531c4e8925640e944ff9a776533179b5a3cdaaaaf`.
- User's reference: 04:02. The prepared source frame is at exact PTS
  `145214 / 600 = 242.02333333333334` seconds, recording origin zero.
- RGB24 frame SHA-256:
  `264b69c3e41bb92755d590992096598721b34b78bb052adfc47406ebb8d64c10`.
- The nearby orange/white player has readable **20 on his shorts**. The observed
  image is not evidence that the torso OCR can read his jersey at that moment.

The draft frame and manifest are local-only in
`.local/orange20-anchor-20261025-1/`. They are not independently reviewed anchor
approval. The manually selected diagnostic box `[595,337,1006,877]` is a
developer reference, not sealed benchmark ground truth.

## Real-Footage Findings

At the reference frame, the detector's nearest box overlaps the manually selected
player box at IoU 0.9765, with raw detector score 0.9561. This does not validate
other frames or identity continuity.

Torso-only OCR returned no number. The shorts crop read `20`, including in the
detector's own box, at raw OCR confidence about 0.999997. That is a model output,
not a calibrated probability that the player is correctly tracked.

The original median-colour kit score was 0.4793, below the unchanged 0.6 kit
threshold: the running player's broad box included a lot of grass. A diagnostic
grass-suppressed median scored about 0.6326. This motivated the bounded heuristic
below; it is not a validation of colour matching across the match.

Actual offline runs, all with orange #20 and white secondary kit:

- Original `0.5.0`, 240-245 seconds, 2 FPS: 10 frames, `UNKNOWN`, no target trace,
  zero confirmed-visible seconds; about 26.68 seconds inference/decode time.
- Torso/shorts `0.6.0`, same interval/rate: `UNKNOWN`, no target trace, zero
  confirmed-visible seconds; about 30.00 seconds inference/decode time.
- Background-aware `0.7.0`, same interval/rate: `UNKNOWN`, no target trace, zero
  confirmed-visible seconds; about 28.98 seconds inference/decode time.
- `0.7.0`, 241-244 seconds, 5 FPS: 15 frames, `CANDIDATE`, no confirmed target
  trace or visibility; about 48.70 seconds inference/decode time.

Aggregate target-only diagnostics of the five-FPS run found **two** valid number
reads on one anonymous track: 241.8233333 and 242.0233333 seconds. Both passed kit
matching after background handling. They do not satisfy the existing requirement
for three distinct-frame reads. No threshold was lowered, no second garment was
counted as another frame, and no unread interval was silently confirmed.

These are development diagnostics on the reference interval, not independently
measured accuracy. No precision, recall, wrong-player rate or full-recording
success percentage can be claimed without reviewed labels.

## Implemented Changes

- `app/pipeline.py`: read torso and shorts, reject conflicting readable numbers,
  and emit at most one conservative OCR vote per source frame. Weak detections
  still cannot trigger identity OCR or increase confirmed coverage. Versioned
  worker behavior requires a new immutable approval before production.
- `app/teams.py`: suppress green-dominant background for non-green nominated
  kits; refuse colour evidence when fewer than 10%/16 pixels remain. Green-kit
  handling is preserved. This is an uncalibrated RGB heuristic, not a learned
  segmentation model; green clothing/backgrounds and lighting remain limitations.
- `eval/smoke.py`: explicit local authorization, cached CPU-only models, offline
  model loading, bounded configurable sampling up to the existing 5-FPS contract
  limit, and before/after source fingerprint checks. New results record source
  SHA-256 and sampling rate. Existing output files are never overwritten.
- `eval/full_match_validation.py`: remove the hard-coded orange #8 target;
  preparation requires an explicit target, sealed reports retain it, and runs for
  another player or CLI target overrides are rejected. Reviewer independence,
  blinding, source/PTS proof and non-training/non-upload gates remain mandatory.
- `eval/match.py`: preserve secondary kit colour in source-bound plans and runs.
- Tests: new garment/background cases and target #20 report round trips; updated
  per-crop fake-reader fixtures; authorization, offline loading and FPS bounds.
- `docs/video/full-match-validation.md`: explicit target preparation commands.

Downloaded the existing reference RT-DETR and EasyOCR weights from their official
distributions to the normal local caches. The initial missing-cache check failed,
and ordinary Python TLS failed on the certificate chain. Download preparation
then used pip's bundled Windows trust-store integration **with verification
enabled**. No CA trust setting, antivirus exception or TLS verification was
disabled. Inference subsequently ran offline using the caches. Models were not
trained and the video was not supplied during downloading.

Model inventory: `PekingU/rtdetr_r50vd_coco_o365`, Transformers 4.57.1,
Supervision 0.26.1 ByteTrack, EasyOCR 1.7.2, PyAV 14.2.0. No CUDA GPU is available.
Identifiers/library versions alone are not immutable weight-content hashes or
evidence of deployment approval.

## Verification

- Full worker suite: **380 passed**, one existing Starlette/httpx deprecation
  warning. No skipped tests.
- TypeScript CV evidence/coordinator tests: **13 passed**.
- Functions TypeScript build: passed.
- CV approval check: absent, as required.
- Whitespace check: passed.
- Production approval source SHA-256 unchanged:
  `cb883f3fff38528b3fcb58044af4d74ac3c20686aed8e787437a38db7aa5e753`.

Local artifacts are under `.local/orange20-*20261025*`; they are not committed.
The source-bound full-recording plan covers four ten-minute-or-shorter segments.
It is **plan-only**, not a completed full-recording inference run. No misleading
completion or benchmark-accuracy artifact was generated.

Reproduce the bounded offline diagnostic from `workers/football-cv`, using a new
output filename on each run:

```powershell
.\.venv\Scripts\python.exe -m eval.smoke --input "C:\Users\masap\Downloads\Mobile Devices\IMG_4809.MOV" --out "C:\ZLI\M335\ScoutX\.local\orange20-new-run.json" --start 241 --end 244 --fps 5 --jersey-number 20 --kit-primary-color orange --kit-secondary-color white --authorize-local-evaluation
```

## Remaining Work

The immediate measured blocker is insufficient readable-number observations,
even at five FPS. Reliable continuous identity through unreadable views needs
additional independently evaluated evidence, not relaxed number/kit thresholds
or whole-track assignment after one reference image.

Before supervised training, obtain reviewed number/visibility/trajectory labels
and an independent validation split. The 04:02 interval has now been used for
development and must not be presented as a held-out accuracy test. Training or
tuning repeatedly on it cannot establish generalization.

Use the selected-player [independent review protocol](full-match-validation.md)
with jersey `20`, orange primary and white secondary kit. This source requires
407 preselected five-second review samples across all 2034.89 seconds, not
cherry-picked easy frames. Reviewer attestations must be genuine; do not claim
that separate pseudonyms automatically establish independence. This labeling is
for development validation, not a proposed manual requirement for every app user.

Train/evaluate a suitable jersey/garment-number model or match-scoped appearance
association only after the labeled development/test sets and compute plan exist.
Retain abstention across cuts, occlusion and re-entry, and measure wrong-player
claims as well as missed visibility. Full-match inference alone, without labels,
cannot demonstrate that tracking works as intended. Production stays gated until
the existing acceptance and immutable approval process is satisfied.

## Research

[ByteTrack official implementation](https://github.com/FoundationVision/ByteTrack)
supports separating anonymous trajectory recovery from readable identity evidence.
[SoccerNet's jersey benchmark](https://github.com/SoccerNet/sn-jersey) documents
small, blurry numbers visible in only a subset of tracklet frames, supporting
explicit legibility/temporal evaluation rather than a single-frame success claim.
[SoccerNet Game State Reconstruction](https://www.soccer-net.org/tasks/game-state-reconstruction)
evaluates identity with team and jersey information alongside localization.
The [RT-DETR model card](https://huggingface.co/PekingU/rtdetr_r50vd_coco_o365) and
[EasyOCR repository](https://github.com/JaidedAI/EasyOCR) identify the reference
distributions used here. No SoccerNet dataset or footage was downloaded.
