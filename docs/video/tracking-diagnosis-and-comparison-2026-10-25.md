# Tracking diagnosis and rejected OCR comparison

## Outcome

The local orange #20 recording was evaluated around and after 04:02. **Continuous
tracking remains incomplete. The full recording was not validated.** The tested
interpolation candidate did not improve target reads and was rejected as a fix.
No production tracking behavior, confirmation requirement, configuration or gate
was changed. No weights were trained/fine-tuned and no footage was uploaded.

This report supplements, rather than replaces, the earlier
[local evaluation](orange20-local-evaluation-2026-10-25.md).

## Source And Scope

- Source: `C:\Users\masap\Downloads\Mobile Devices\IMG_4809.MOV`.
- SHA-256: `6450a5bbcbddd593447b30b531c4e8925640e944ff9a776533179b5a3cdaaaaf`.
- Duration: 2034.8916667 seconds, approximately 33:55, not the different
  140-minute orange #8 Veo source.
- Target: explicitly selected orange #20, white secondary kit. No recording,
  timestamp, number or kit-specific selection rule was added to the code.
- Comparison: 241-247 seconds at five sampled frames/second, 30 exact decoded
  sample timestamps. The source hash was checked before and after both runs.
- Worker policy: unchanged `football-cv/0.7.0`; cached RT-DETR, Supervision
  ByteTrack and EasyOCR, CPU-only. Baseline and candidate use fresh trackers,
  the same model objects, source, interval, sampling and confirmation policy.

## Diagnosis Before Experiment

The baseline's 30 sampled frames had 31-84 detector proposals/frame, averaging
59.13. Tracker outputs ranged from 1-11/frame, averaging 4.4. These are proposals
and anonymous tracker outputs, **not unique people, detection recall or target
fragmentation**. Reviewed target boxes are required for those conclusions.

Across 250 torso/shorts crop calls, including non-target detections:

- 198: no text returned.
- 39: below the existing OCR input-size floor.
- 6: low-confidence text, rejected.
- 7: accepted crop-number results, not seven target observations.
- 0: garment conflicts in this baseline run.

Exactly two distinct-frame target-number reads qualified:

- 241.8233333 seconds: shorts crop 229 x 131; raw confidence 0.99999966;
  kit score 0.65024. Torso 229 x 183 returned no text.
- 242.0233333 seconds: shorts crop 408 x 132; raw confidence 0.99999730;
  kit score 0.63257. Torso 408 x 186 returned no text.

Both reads are on the same anonymous candidate track. Both pass the unchanged
kit threshold. Neither accepted shorts crop is too small. The recorded vertical
finite-difference focus proxies were 164.23 and 122.02 for the shorts crops;
these are not calibrated blur measurements or evidence of a particular angle.

The pipeline has a rolling 2.5-second consensus radius and requires three
distinct-timestamp reads with its existing weighted consensus share. It does
**not** require strictly consecutive reads. Two reads cannot satisfy it. They
also do not justify painting the entire tracker ID as the target.

The measured bottleneck for confirmation here is sparse qualifying OCR evidence.
This does not prove that detection/association are adequate elsewhere. No
qualifying #20 read was emitted after 242.0233 through the sampled end at
246.8233. Without reviewed trajectory/visibility labels, a target ID switch,
occlusion, crossing or camera-motion-induced loss in those frames cannot be
distinguished from an unread number or absent target. Those fields are explicitly
unmeasured, not guessed from a drop in tracker output count.

Complete per-frame proposal counts, rejections, target-number candidate crop
dimensions/scores and trail states are in the local comparison artifact:
`.local/tracking-comparison-orange20-20261025-1/diagnosis.json`. Other players'
numbers, candidate tracks, raw crops and frames are not persisted by this tool.
Anonymous keys are retained only for nominated-number candidates and confirmed
target claims; a number candidate is not a confirmed player identity.

## Before And After

The candidate applies 2x bicubic interpolation to already admissible OCR inputs.
It does not generate learned detail, download a model or train weights. It keeps
the original 24 x 16 minimum crop-size gate, imposes a memory bound, rejects
conflicts across original/resized raw reads and emits at most one vote per frame.

- Qualifying target reads: **2 before; 2 after**.
- Nominated-number candidate tracks: **1 before; 1 after**.
- Confirmed claimed samples: **0/30 before; 0/30 after**.
- Prediction abstention: **100% before; 100% after**. This is not accuracy.
- Accepted crop reads across all examined detections: **7 before; 20 after**.
- No-text crops: **198 before; 171 after**.
- Too-small crops: **39 before; 39 after**; no size-gate bypass.
- Low-confidence crop rejections: **6 before; 18 after**.
- Conflicting-region crop rejections: **0 before; 2 after**.
- Inference/decode/instrumentation time: **83.06 s before; 143.70 s after**.
- Correct trail coverage, false-claim rate, ID switches, fragmentation and target
  detection recall: **unmeasured/null before and after**, because reviewed
  source-bound ground truth was not supplied.

Result: no target-read or claimed-coverage gain, with about 73% more runtime.
**The candidate is rejected and not selected for production.** No threshold was
loosened to obtain a successful-looking trace. More accepted text in unrelated
crops is not tracking improvement. False-claim safety is not established merely
because no target claim was made in this small development interval.

## Implemented Code

- `eval/tracking_diagnosis.py`: per-frame instrumentation around the existing
  pipeline, source/decode checks, privacy-filtered diagnostics, one-command
  baseline/candidate comparison and an unreviewed label template. New runs also
  fingerprint the relevant source-code files before/after inference.
- `eval/trail_metrics.py`: exact-sample reviewed-label validation and explicit
  trail coverage, false-claim, ID-switch, fragmentation and abstention metrics.
  Missing labels produce null accuracy/error metrics, not invented zero errors.
- `eval/ocr_augmentation.py`: separately selectable, offline-only interpolation
  experiment with raw-region conflict preservation and reader cleanup.
- Tests cover instrumentation parity, two crops not becoming two frame votes,
  wrong numbers, unread/weak inputs, loss after confirmed observations,
  fragmentation/switch denominators, unknown-label exclusion, malformed traces,
  incomplete decode, wrong source labels, actual image dimensions, remote-path
  rejection, authorization, source mutation, exclusive output, and augmentation
  cleanup/conflict/size limits.

Local output states are `confirmed`, `lost` and `abstained`. Lost means earlier
confirmed evidence no longer supports a current claim, not proof of off-camera
absence. Confidence is inherited uncalibrated worker evidence, not a probability.
`inferred-from-tracklet` is intentionally not emitted: no held-out false-claim
evidence exists to approve propagation. This is a diagnostic output format, not
an app renderer integration or a production contract change.

## Reproduce With One Command

From `workers/football-cv`, use a new output directory each time:

```powershell
.\.venv\Scripts\python.exe -m eval.tracking_diagnosis --input "C:\Users\masap\Downloads\Mobile Devices\IMG_4809.MOV" --out "C:\ZLI\M335\ScoutX\.local\tracking-comparison-orange20-new" --start 241 --end 247 --fps 5 --jersey-number 20 --kit-primary-color orange --kit-secondary-color white --compare-scale2x --authorize-local-evaluation
```

Add `--labels C:\Evaluation\reviewed-trail-labels.json` for reviewed metrics. The
labels must cover every exact sampled timestamp, use source-pixel boxes fitting
the decoded frame and match the source hash and explicit target. The generated
`labels.template.json` starts `reviewed: false` and is not usable ground truth.
Supplying reviewed labels is a human attestation, not cryptographic proof of
blinding or independence. Existing outputs are never overwritten.

The comparison uses existing cached models only. Reproducing inference requires
the same model weights and package versions; model-name/version strings alone
are not immutable weight-content fingerprints or production approval. Timing
also varies with CPU contention. The actual run above predates the final
code-fingerprint metadata and output-hardening additions; its source/model/interval provenance and
diagnostic values are retained unchanged, not rewritten to imply a later run.

## Checks And Gates

All required checks were rerun: **412 worker tests passed**, **13 TypeScript
contract tests passed**, and the Functions TypeScript build passed. No skips;
one existing Starlette/httpx deprecation warning remains. Whitespace checks pass.
The approval check reports no approval record. Its source SHA-256 remains
`cb883f3fff38528b3fcb58044af4d74ac3c20686aed8e787437a38db7aa5e753`.

Production Functions, app rendering, consent/privacy rules, configuration and
deployment were not changed. There was no training, provider API use, footage
upload or new model download. Existing unrelated dirty files were preserved.

## Still Required

1. Independently reviewed target trajectories, visibility, number-legibility and
   hard-case labels. A single readable reference is not a full trajectory label.
2. A frozen held-out split with wrong-player and conflicting-number negatives
   before accepting a fusion/association or OCR change. This development window
   is not a holdout. See the separate
   [labeling and split specification](tracking-labels-and-split-2026-10-25.md).
3. Evidence that tracklet propagation does not carry identity through an ID
   switch, similar kit, crossing, cut, long occlusion or re-entry. No motion/ReID
   model or forward/backward identity propagation was enabled without that proof.
4. Complete inference and independent review over all 2034.89 seconds, with
   source/PTS audits and the existing full-recording approval workflow. The
   previous four-segment plan is not execution or validation. Sparse five-second
   review samples also cannot prove every-frame continuity.

The flagship goal remains open. This work establishes a reproducible diagnosis
and a rejected experiment, not a claim that orange #20 is now tracked throughout.

## Research Basis

[ByteTrack](https://github.com/FoundationVision/ByteTrack) recovers anonymous
trajectories through detection association; that alone does not establish jersey
identity. [SoccerNet's jersey benchmark](https://github.com/SoccerNet/sn-jersey)
identifies small/blurred numbers visible in only a subset of tracklet frames as
part of the recognition problem. These motivate separate legibility, tracking
and identity evaluation, not removing the current confirmation gate.
