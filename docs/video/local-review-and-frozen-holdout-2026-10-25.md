# Local review and frozen holdout - 2026-10-25

## Status and scope

Workstream 1 is delivered. No human-reviewed match labels were supplied. Per the requested stopping rule, evidence-yield tuning, new fusion experiments and full-recording affordability work are deferred, not completed or evaluated. Production policy, confirmation, kit, OCR confidence and size gates were not changed by this phase. No model training, model downloads, footage uploads or provider calls were performed.

Source SHA-256: `6450a5bbcbddd593447b30b531c4e8925640e944ff9a776533179b5a3cdaaaaf`. Source duration: 2034.89 seconds. Target: orange #20, white secondary kit. The previous two qualifying reads at 241.823 and 242.023 seconds remain development evidence, not an accuracy benchmark. Rejected bicubic interpolation was not rerun.

## Delivered files

- `workers/football-cv/eval/local_review.py`: offline pack preparation, source/PTS integrity validation, prospective holdout freezing and saved-trace scoring CLI.
- `workers/football-cv/eval/review_ui.html`: static full-frame annotation UI, manual source-pixel boxes, visibility, number legibility, hard-case tags, explicit per-frame review, label/draft/notes import and export.
- `workers/football-cv/eval/review_scoring.py`: reviewed-label scoring of saved comparison traces without inference or identity propagation.
- `workers/football-cv/tests/test_local_review.py`, `test_review_scoring.py`, `review_ui_browser.mjs`: synthetic integrity, metric and browser regressions. Synthetic labels are not real match ground truth.

No isolated crops of other players are persisted. Requested candidate boxes and anonymous tracker IDs can be displayed on local full frames. Candidate overlays default off and are proposals, not labels. Optional detector overlays require already-cached weights and offline loading. Default preparation needs no model.

## Review plan

Open `.local/orange20-review-dev-20261025-2/index.html`. Its 30 samples cover 241-247 seconds at 5 fps; all remain unreviewed. Enter a real reviewer identifier, manually draw the target box or select a non-visible/uncertain state, record legibility and hard cases, then explicitly review each sample. Save both reviewed labels and review notes. Save drafts and notes before closing: there is no automatic persistence or network service.

Allow approximately 20-30 reviewer minutes for development. Then review the first frozen holdout window (10-15 minutes), followed by the remaining three (30-45 minutes). These are planning estimates, not measured review times.

Frozen plan: `.local/review-holdout-freeze-20261025-2/holdout-plan.json`. Sampling is pinned at 2 fps, with six-second windows:

- 354.094-360.094 seconds.
- 705.192-711.192 seconds.
- 1241.997-1247.997 seconds.
- 1882.725-1888.725 seconds.

Selection uses source-hash-seeded temporal strata and a 60-second development exclusion buffer, before any new tuning. Content has not been reviewed. Wrong-player, similar-kit, conflicting-number, crossing, cut, occlusion and re-entry coverage is NOT verified. A human must audit negative-case coverage before an experiment is evaluated; do not silently replace unfavorable windows. This is a prospective within-recording split, not proof of historical non-exposure or unseen-match generalization.

Keep overlays off for independent holdout review. Exposure is latched in exported notes. This is a human attestation, not cryptographic proof of blinding. Frozen-plan hashes and UI provenance likewise do not prove independent review.

## Reproduction

Run from `workers/football-cv` in PowerShell. Each output directory must be NEW; source integrity is checked before/after each operation. Local artifacts and footage remain excluded from Git.

```powershell
$video = 'C:\Users\masap\Downloads\Mobile Devices\IMG_4809.MOV'
$root = 'C:\ZLI\M335\ScoutX'
$python = '.\.venv\Scripts\python.exe'
$plan = "$root\.local\review-holdout-freeze-20261025-2\holdout-plan.json"
& $python -m eval.local_review prepare --input $video --out "$root\.local\holdout-review-01" --start 354.094 --end 360.094 --fps 2 --jersey-number 20 --kit-primary-color orange --kit-secondary-color white --holdout-plan $plan --authorize-local-evaluation
```

Validate human-exported labels and notes (replace paths with the actual downloads):

```powershell
& $python -m eval.local_review validate --input $video --pack "$root\.local\holdout-review-01" --labels 'C:\path\reviewed-labels.json' --notes 'C:\path\review-notes.json' --holdout-plan $plan --require-blinded --out "$root\.local\holdout-validation-01" --authorize-local-evaluation
```

One-command scoring of the existing DEVELOPMENT comparison, once that pack has real reviewed labels:

```powershell
& $python -m eval.local_review score --input $video --pack "$root\.local\orange20-review-dev-20261025-2" --labels 'C:\path\dev-reviewed-labels.json' --notes 'C:\path\dev-review-notes.json' --diagnosis "$root\.local\tracking-comparison-orange20-20261025-1\diagnosis.json" --out "$root\.local\development-reviewed-metrics-01" --authorize-local-evaluation
```

This validates exact source timestamps, decoded frame hashes, saved images, target, reviewed status, geometry and notes before scoring. It cannot apply development predictions to a different holdout interval. Missing/incorrect samples, placeholder reviewers and unreviewed templates are rejected. No existing outputs are overwritten.

Coverage, false-claim rate, ID switches, fragmentation and sampled target recall use reviewed labels and saved claims. Zero-denominator metrics stay null; no visible target labels means identity-error counts remain null. All-uncertain reviews are marked insufficient. Historical detector recall remains null because the saved comparison lacks detector proposals; sampled target recall is trail coverage, not detector recall. The existing live diagnosis workflow can measure detector recall with reviewed labels and retained proposals in a future authorized run.

## Verification and limits

- Worker suite: 446 passed; one existing Starlette/httpx deprecation warning.
- Worker contract suite: 13 passed.
- Functions TypeScript build: passed.
- Static review UI: desktop/mobile passed, export/import and malformed-box rejection passed, no external requests, overlay exposure latching passed. Tests use synthetic labels only.
- Actual development pack: 30 frames prepared locally, zero reviewed labels. Source integrity checked. No holdout inference, full-recording inference or density scan was run.

No accuracy, detection recall, ID switches, fragmentation or full-match coverage has been established for orange #20. No gate was loosened and no experiment was approved. The historical 83-second runtime for six seconds of footage extrapolates to roughly 7.8 hours at 5 fps, not a newly profiled runtime guarantee. A resumable runner, evidence-yield optimizations and independent evidence fusion acceptance remain future work after the human-label gate. The full recording was NOT validated.
