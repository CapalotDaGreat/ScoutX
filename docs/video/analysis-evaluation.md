# Match-analysis evaluation harness

Scores what the player is shown (a published report) against human labels, with the development split kept apart from the
held-out split. Complements `workers/football-cv/eval/evaluate.py`, which scores worker output (identity, events) against
annotations. Nothing here calls a worker, provider or network, and nothing changes a production switch.

## Run

```
npm run eval:analysis                       # fixture replay: recorded IMG_4809 report vs developer labels
node --import ./tests/unit/support/register.mjs scripts/analysis-eval.mjs --corpus <corpus.json> --out result.json
node scripts/analysis-eval-labels-from-gt.mjs > docs/video/evaluation/img4809-dev.labels.json   # regenerate derived labels
node --import ./tests/unit/support/register.mjs --test tests/unit/reportEval.test.ts
```

Corpus file: `{ datasetId, clips: [{ clipId, split: "development"|"heldout", report, scope?, labels?, answers?, timings? }] }`.
Bare worker output has no publication scope: it is not assumed full. Supply a recorded `scope` in the input or explicitly
attest `scope: "full"` in the corpus for a known full-recording fixture.
Label format: `ClipLabels` in `tests/unit/support/reportEval.ts` (visible intervals, reviewed-absent intervals, events, reviewers,
blinded attestation, source SHA-256).

## What is scored

| Measure | Definition |
|---|---|
| Wrong-player claim | A claimed moment or event (`CONFIRMED_VISIBLE`/`LIKELY_VISIBLE`) lying mostly inside a reviewer-labelled **absent** interval |
| Supported / unverified claim | Mostly inside a labelled visible interval / in time nobody labelled (never counted as correct) |
| Event precision, recall, timestamp error | One-to-one by type within 2.0 s; only when events were labelled (`eventsLabelled`), otherwise null, never 0 |
| Narrative citation support | Each answer cites supplied frames inside its clip/moment and a labelled-visible interval, none inside a labelled-absent interval; this checks citations, not whether the football explanation is factually correct |
| Usable report | Full scope, at least one claim, no wrong-player claim and, with labels, at least one verified claim |
| Usable share | Usable clips / labelled clips (a failed run counts as unusable), Wilson 95% interval |
| Timing | p50 always, p95 only from 20 or more samples |

Wrong-player rate uses only supported plus wrong-player claims as its denominator. It is null when all claims are unverified;
adding unlabelled claims cannot dilute it. Presence labels only establish temporal support: they cannot identify a particular
box when the target and a teammate are both in view. These report-level metrics cannot replace the worker's identity gate.
Overlapping annotation intervals count once, and event matching maximises one-to-one matches before minimising timestamp
error, independent of prediction order. Counts are raw; ratios are ratios of sums. `compareRuns` rejects an optimisation that adds a wrong-player claim, lowers the
usable share, loses event recall (even if precision rises because fewer events are reported), weakens citation support,
worsens timestamp error by more than 0.25 s, uses different clips or label fingerprints, or has an invalid baseline or candidate.

## Split rules enforced

Held-out is `valid` only with at least 30 labelled clips from 30 distinct source recordings (proposed `minimumVideos`), an
explicit real-data (`synthetic: false`) attestation, blinded review, two distinct non-empty reviewers, and no source recording
shared with the development split. Each held-out identity label file must include reviewed presence/absence intervals.
Duplicate clip ids, mismatched clip/split labels, invalid hashes/timestamps and conflicting
presence/absence intervals are refused before scoring. Development
numbers never feed `releaseEvidence`; with a valid held-out split it is still `heldout_present_thresholds_still_proposed`
because `workers/football-cv/eval/thresholds.json` is a proposal.

## What exists today

- **Development**: IMG_4809 (2035 s), single developer annotator, nine 30 s windows, 50.4 s target-visible and **no reviewed-absent intervals**.
  The T/N/? annotations in `bench/results/5.1/gt_img4809_intervals.json` cover selected player boxes. N identifies another player
  in that box; it does not prove the target is absent from the frame. Only T yields derived presence labels. Used repeatedly for tuning, so it
  is development only. Labels carry a documented 0.1 s time-basis offset in later windows (`gt_time_basis_corrections.json`);
  that is far below the claim-interval scale used here, but report both bases when scoring frame-level metrics.
- **Fixture replay result** (`docs/video/evaluation/img4809-fixture-result.json`): 15 claimed moments, 0 wrong-player, **0 verified,
  15 unverified** (every recorded moment lies outside the labelled windows), wrong-player rate **null**, no event labels, so usable share is 0 of 1 and
  `releaseEvidence` is `insufficient`. Fixture equivalence before and after a change proves the change did not alter output; it
  says nothing about accuracy on real footage.
- **Held-out**: none. No second match, no blinded labels, no second reviewer.

## Clips and labels needed before any output-changing optimisation is accepted

1. At least 30 matches or disjoint recordings with authorised footage, covering the slices in `thresholds.json`
   (occlusion, camera movement, low light, similar kits, identical numbers, substitution, off-camera periods, re-entry), several
   camera positions and kits, plus the low-resolution and ambiguous-jersey-number cases.
2. Per clip: target number and kit, reviewed visible and absent intervals (dense around crossings, cuts, occlusion and re-entry),
   labelled events with timestamps, and for each report narrative claim a reviewer verdict.
3. Two reviewers per held-out clip, labelled before seeing candidate output, frozen before tuning; whole recordings assigned to
   one split (no adjacent-frame leakage). Use `eval.local_review` for packs and blinding attestations.
4. A full-recording report from the worker for each clip (CPU reference and GPU run) so wrong-player and usable-share can be scored.

## Profiling one complete match (not done locally; blockers below)

The repository's own benchmark records per-stage timing, hardware, input hash, accuracy gate and cost estimate:

```
python bench/full_match_benchmark.py --video IMG_4809_proxy_10fps.mp4 --number 20 --kit orange --kit2 white \
  --out out/full_match.json --reference bench/references/img4809_proxy_10fps.json \
  --ground-truth bench/results/5.1/gt_img4809_intervals.json --gate bench/gates/balanced_5.2.json \
  [--baseline cpu/full_match.json] [--prices bench/gcp/prices_europe-west6.json] [--require-gpu --require-models]
```

Full procedures: `docs/video/gpu-benchmark-commands.md` (billed cloud resources need separate approval).
Local blockers: the development VM has 2 vCPUs, no GPU, no torch or pytest, and does not mount the footage (it lives under
`Downloads/Mobile Devices/`, outside the connected folders). The recorded run was 1853.86 s on one L4 (CPU 7528.29 s).
Recorded component shares of that single run: detect 19.0%, camera motion 18.8%, decode 16.8%, OCR 11.6%, colour 7.8%; model init
10.4 s (0.6%). Discovery (507.8 s) plus extraction (1051.3 s) is 84.1% of wall, confirmed arithmetically from the report but not
re-measured. Discovery leaves a large unattributed residual and GPU utilisation averaged 8.3%, so instrument before optimising.
