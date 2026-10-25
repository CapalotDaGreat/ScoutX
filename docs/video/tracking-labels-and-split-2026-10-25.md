# Tracking labels and evaluation split

This is a specification, not authorization to train, upload or collect additional
recordings. No weights or production gates are changed by these workflows.

## Diagnostic Labels

`python -m eval.tracking_diagnosis` emits `labels.template.json` next to its
diagnosis. It retains every decoded sampled PTS, source SHA-256 and explicit
jersey/kit target. `reviewed` starts false; every sample starts uncertain. The
template cannot be used as reviewed ground truth until a real reviewer completes
it. Use a separately saved file and actual pseudonymous reviewer ID.

For each exact sampled timestamp, independently inspect the source video:

- `visible`: identify the selected target and draw a source-pixel box, not a
  predicted box. A partly occluded player can be visible if identity and location
  remain genuinely judgeable.
- `off_camera`: reviewed target is absent; box must be null.
- `occluded`: identity/location cannot be reliably judged because of occlusion;
  box must be null.
- `uncertain`: cannot establish identity or visibility; box must be null.
- Record `occlusion` as none/partial/full/unknown and `camera` as
  stable/pan/zoom/cut/unknown; mark `crossing` where players cross. Do not infer
  these labels from tracker failures.

Retain all samples, including hard frames and intervals with no prediction.
Only mark reviewed true after the whole supplied sample grid has been reviewed.
The code checks geometry, timestamp completeness and source/target binding; it
cannot verify that an attestation is honest or that two IDs mean two humans.
These diagnostic labels do not grant production approval.

## Additional Training Labels, If Later Authorized

Use anonymous match-scoped ground-truth track IDs, not player names or global
identity embeddings. Label every relevant person box around crossings, cuts,
occlusions and re-entry so wrong-player claims can be separated from loose
localization. Retain the intended target's identity through the reviewed episode,
including alternate tracker IDs. Do not equate a raw tracker ID with ground truth.

For each torso/shorts number crop label: source PTS, region box, legible/not
legible, exact visible digits, partial digits, non-number text, conflicting
regions, blur category, angle and occlusion. Mark illegible digits unknown rather
than forcing the requested number. Include wrong players, opposing duplicate
numbers, similar kits and goalkeeper/referee distractors. No face recognition.

## Split And Blinding

The reference interval around 04:02 has been used for development repeatedly. It
is not held out. Freeze independent labels and acceptance criteria before seeing
new predictions. A reviewer who sees candidate output first cannot provide a
blinded benchmark for that candidate. Do not claim agent-written or copied
prediction boxes as independent labels.

Prefer match-disjoint train/development/test sets, covering multiple camera
positions, weather, kit colours and teams. Do not randomly split adjacent crops
or frames: near-duplicates and neighboring tracklets leak appearance/motion
information. Keep all views of one reviewed episode within one split. If only
this recording exists, use preselected disjoint temporal blocks with exclusion
buffers around boundaries and report this strictly as within-recording evidence,
not unseen-match generalization. Do not adjust the sealed test after results.

Any future change from three locally supported reads to tracklet-level anchors
must be evaluated against the unchanged baseline on the frozen negative and
positive holdout. Report raw numerator/denominator counts, uncertainty, and
wrong-player/localization errors separately. An increase in coverage accompanied
by an unaccepted false-claim increase is a failure, not a gate to production.

## Full Recording

The local source lasts 2034.8916667 seconds, not 140 minutes. The existing
`eval.match` plan has four ten-minute-or-shorter segments. The independent
[full-recording review workflow](full-match-validation.md) has 407 preselected
five-second samples for this source. Those sparse labels measure sampled
accuracy, not every source frame.

Full trail coverage/ID-switch analysis additionally needs dense, exact-PTS
trajectory labels on selected independently frozen episodes, plus reviewed
visibility/non-play/camera boundaries throughout the recording. Reconcile target
IDs across segments and halftime; do not interpolate through unseen intervals.
Run complete source/decode audits and the existing independent source/anchor
binding workflow. Missing approval gates remain blockers; never set a production
approval flag to run an experiment. Full inference without those labels is not
full-recording validation.

## Metric Definitions

Diagnostic trail coverage is correct sampled visible claims / reviewed visible
samples, with IoU >= 0.5. False-claim rate is wrong-or-mislocalized and
absent-target claims / scorable reviewed samples; the companion
`falseClaimsAmongClaims` uses scorable claims as denominator. Low IoU alone
cannot prove that a box is a different player. The existing independent benchmark
supports anonymous other-player boxes for that distinction.

ID switches count changed anonymous predicted IDs between correctly localized
claims in one visible episode, including across misses. Fragmentation counts a
correct reacquisition after a miss while the target remains reviewed visible.
Off-camera, uncertain and unjudgeable-occlusion labels reset the episode.
These definitions are explicit sampled diagnostic metrics, not a replacement
for standard MOT/HOTA evaluation. Detection recall uses valid detector proposals
at the existing tracking floor, not the number of proposals in a frame.

Without reviewed labels, coverage, false claims, ID switches, fragmentation and
detection recall are null. The observed prediction abstention rate remains
measurable, but it is not accuracy. Confirmed confidence values are inherited
uncalibrated evidence scores, not calibrated identity probabilities.
