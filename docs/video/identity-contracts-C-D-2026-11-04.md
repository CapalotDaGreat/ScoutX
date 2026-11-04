# Identity evidence contracts for candidates C and D (2026-11-04)

**Status:** contracts and findings only. Candidates C and D stay **off by default**; A (exchange split) and B (resume split) are off throughout. The default decoder, thresholds and safeguards are unchanged, `productionApproval=false`, and the pinned GPU baseline `51d41c9…` is untouched.

**Source verified:** `13a5174` (C and D in `86ec1db`).

**Flag semantics, read from the code:**

| Flag | Value that enables the candidate | Where it acts |
|---|---|---|
| `SCOUTX_OCR_CONSULTED_ONLY` (C) | `!= "0"` | `analyze.py`, after the first `run_ocr` call only |
| `SCOUTX_APPEARANCE_ONLY_LIKELY` (D) | `== "0"` (the default `"1"` keeps today's rule) | `states.frame_states` only |

## C: OCR observations and the cache

### Terms (as implemented)

| Term | Meaning |
|---|---|
| **Selected** | A crop returned by `select_ocr_crops` for this pass: the dense first pass (`OCR_DENSE`, all target-kit close-ups ≥ 120 px, one per 0.4 s) or a refinement pass (focus tracklets, ≤ 40 crops each, ≥ 90 px). Selection depends only on tracklets and box sizes, never on the cache. |
| **Consulted** | A selected crop that `run_ocr` actually looked up, cached or freshly read. It is fewer than the selected crops only with early stop (non-dense mode), a work-count budget (`max_new`) or a wall-clock budget (`budget_sec`). |
| **Cached** | An entry in `<stage1 root>/ocr_cache.json`, keyed `<chunk dir>/<frame>_<det>.jpg`, with value `[text, conf, band]`. "No text" (`[null, 0, null]`) is cached too. |
| **Accepted observation** | A consulted entry with text that becomes evidence: `det_reads` (number-conflict splits) and `reads` (identity). Identity then counts full-length numbers (target or conflicting) and ignores lone digits for exclusion. |

### Evidence each pass may consume

| Pass | Default (today) | With C |
|---|---|---|
| First pass | **every cache entry**, including another run's refinement reads → **defect DEF-1** | its own consulted crops |
| Refinement passes | their own crops (already correct) | unchanged |
| Discovery sightings | attached by frame and box overlap | unchanged |

### Cold/warm equivalence

- **Without an OCR budget** (the full-match path, and production first resolves): a run with any cache state must select and consult the same crops and accept the same observations, so tracklet splits and identity states are identical.
- **Demonstrated with C:** full match cold vs warm (the baseline's own cache, or all runs combined) is bit-identical.

**Legitimate differences under budgets** (tested with deterministic doubles):

| Budget | Behaviour | Legitimate? |
|---|---|---|
| Work-count (`max_new`) | Deterministic for a given cache state. A warmer cache consults more **selected** crops, because cached crops do not count against the budget. | yes: extra coverage of selected crops |
| Wall-clock (`budget_sec`; corrections use 0 s) | Non-deterministic coverage. Cached selected crops are always consulted; uncached ones after exhaustion are skipped and deferred. | yes, but not reproducible |

- Leakage of entries **not selected** by the run is never legitimate. C prevents it.

### Cache-key provenance and invalidation

**Gap:** keys carry **no** source, detection, OCR-model or preprocessing provenance.

**Existing protection:**

- `Stage1Store` invalidates **chunk directories**: other source, bounds or settings (incl. engine version, `SCOUTX_OCR_ENHANCE`), or corrupt files → the chunk is moved aside and re-extracted.
- The OCR cache is a single file in the store root and is **not** invalidated with them.

**Defects found:**

| Id | Defect | Shown by | Candidate E |
|---|---|---|---|
| DEF-2 | a re-extracted chunk keeps the old reads under the same crop names (stale reads are served) | `test_defect_stale_reads_survive_a_reextracted_chunk` | prevents it: `test_E_stale_reads_are_dropped_and_reread` |
| DEF-2b | caches combined across jobs collide on `c_00000/...` names | `test_defect_colliding_crop_identifiers_across_jobs` | per-chunk tags drop mismatched entries |
| DEF-3 | a truncated `ocr_cache.json` raises on every later resolve (the job is stuck); a malformed entry raises in the reads loop | `test_defect_truncated_cache_file_raises` | starts cold, drops malformed entries |
| DEF-3a | non-atomic cache writes (the truncation cause) | — | **fixed unconditionally**: atomic temp-file + `os.replace`. This does not change any output. |

**Candidate E:** `SCOUTX_OCR_CACHE_PROVENANCE=1`, off by default. Commit: see the report.

- A sidecar file `ocr_cache.json.provenance.json` records, per chunk dir, a tag: detections SHA-256 plus OCR configuration (`SCOUTX_OCR_ENHANCE` and the `ocr.py` source).
- Entries of chunks whose tag is missing or differs are dropped before use.

**Not covered by E:**

- OCR **model weight** changes are not in the tag. Model files are pinned by hash only in bench tooling.
- Concurrent resolves of one job writing the same cache can lose updates. Not tested.

## D: what supports each identity state

**Evidence types (per frame, from the identity chain):**

| Type | Meaning |
|---|---|
| `number` | the tracklet carries a target-number read or a discovery sighting |
| `anchor` | an owner "yes" |
| `anchored` | joined to number/anchor evidence by clean tracker hand-offs or clear contact links within 30 s, with no unclear link in between |
| `interpolated` | a short gap filled between claimed frames |
| `appearance` | a chain member supported only by appearance |
| `continuity`, `contact_unclear` | already never LIKELY |

**States:**

| State | Default (today) | With D |
|---|---|---|
| CONFIRMED_VISIBLE | `number` or `anchor` | unchanged |
| LIKELY_VISIBLE | `anchored` (always); `interpolated` / `appearance` / `continuity` when confidence ≥ 0.75 and no competitor ≥ 0.35 | **`appearance` is never LIKELY**; the rest unchanged |
| AMBIGUOUS | everything else that is present, or a competitor in view | adds appearance-only frames |

**Supported link to number evidence:** only `anchored`, through clean hand-offs or clear contact links within 30 s. Chain adjacency alone is not a link.

**Does an appearance model trained from number evidence qualify a new tracklet?** **Not established, and D treats it as not.**

- On all labelled IMG_4809 frames, appearance-only LIKELY was 0 correct, 19 wrong-player and 12 unmatched.
- AUC for #20 vs other tracklets is 0.80, but at the LIKELY operating point 3 #20 and 2 other tracklets pass.
- With zero positives the template falls back to "the 5 most orange, longest tracklets" (`identity.py:299`). There is **no target evidence at all** → **defect DEF-8**, sidestepped by D.

**Double counting (DEF-7):**

- A chain member's confidence is `sigmoid(app·rel)`, which is +1 logit over its standalone score `sigmoid(app·rel − 1)`.
- The chain was chosen from the same appearance terms, so the bonus double-counts that evidence for `appearance` members.
- D sidesteps this for `appearance`. The bonus also applies to `interpolated` and `continuity` frames. `anchored` has its own 0.8 floor.
- Not changed: it would be a threshold-adjacent change.

### Which outputs may attribute the player in each state

Found by searching all consumers:

| Consumer | CONFIRMED | LIKELY | AMBIGUOUS |
|---|---|---|---|
| Worker `physical_metrics` (distance, speed, sprints) | yes | yes | no |
| Worker `ball_events` (contacts, carries, passes; summaries count confirmed separately) | yes | yes | no |
| Worker `build_moments` (clip windows / highlights) | yes | yes (spells capped at 24) | no |
| Worker `offball_observations` / `sequence_observations` | yes | **no** | no |
| Worker heatmap / calibrated positions (`apply_calibrations`) | yes | yes | no |
| Worker `coverage`, `identity.statesSec`, API state strip | counted per state | counted per state | counted per state (as unsure) |
| Worker `reviewQuestions` (owner review) | — | — | candidates remain askable: D changes states only, so the questions are identical. `currentlyTarget` is a chain flag and is not shown by the app. |
| API `target_only` | strips `tracklets`, `excluded`, `numberReads` (and with them chosen tracklets' scores and evidence) | | |
| Functions `trackingV3.ts` (events, moments, discovery moments) | accepted | accepted (LIKELY moments are `candidate` / ask-identity) | rejected |
| App (`review.ts`, `moments.ts`, `TrackingReportSection`) | "confirmed" | "likely"; LIKELY moments show "is this you?" | shown as unsure, never attributed |
| Owner confirmation | `feedback.yes` → `anchor` → CONFIRMED only from an explicit answer | | automatic AMBIGUOUS never becomes `anchor` |
| **Local CLI** `render.draw`, `contact_sheet` (`Track-Player.ps1`) | box + "TRACKING" | box + "TRACKING" | **box + "TRACKING"**: **state-blind** → **defect DEF-5** (pre-existing; not in the API) |
| `stats.compute_stats` / `involvements` | uses `tl.present` | | **state-blind**; not called by `analyze` (legacy, tests only) → **DEF-6** |

**Contract mismatches if D were promoted (DEF-4):**

- `states.py` documents LIKELY as "appearance + motion continuity".
- `report.py` labels it "Probably you (appearance + movement)".
- `test_tracking_v3` asserts the default rule. It now pins the default explicitly.

**Legacy results:**

- Stored reports (Firestore `TrackingDoc`) keep their old states until the job is resolved again. No schema change is needed; the state names are unchanged.
- Under D, the next resolve of a job changes appearance-only LIKELY to AMBIGUOUS (state strip, coverage, metrics, moments).
- No migration is needed for compatibility. Re-processing is required to remove old attributions. **None was executed.**
