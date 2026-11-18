# Tracking candidates: audit, promotion assessment and pilot readiness (2026-11-18)

Covers briefs 6d5e8412/e9584a08 (audit), 69febef8 (pre-promotion) and c5b51f00 (pre-pilot).
**Final status: NOT READY — CONCRETE BLOCKERS REMAIN** (section 9). Nothing was merged to main, deployed, enabled or
uploaded. Analysis stays disabled for users.

The authoritative details are in `analysis-experiments-2026-11-14.md` §23–24 and `footage-library/`.

## 1. Versions

| Role | Commit | Engine change vs release | Runtime |
|---|---|---|---|
| Release (product today) | `32ab43f1f5c6274c5d7672b25fa4ac37163bbb7c` | — | — |
| Candidate tree | `0bae8d7ab3d7cd16645684e10500c9934e53cf9f` | T, C and D (each behind a flag, all off by default); owner-tap fixes (adb3111, 3f305f2, 81614af); stage-1 thumbnail reuse (e092fc3, bit-identical); OCR-location report (0b09903) | Flags as named below |
| Candidate I tree | `f699669d400eb92e5da43bcf9aced35ce06cd690` | 0bae8d7 + I (`states.py`, +33 lines) | `SCOUTX_INTERP_NO_UPGRADE=1` |
| GPU baseline (immutable) | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | untouched | — |

Common runtime for every run in this packet (recorded in each `full_match.json` `environment.scoutxEnv`):
- Hardware and providers: CPU, 2 cores, onnxruntime CPUExecutionProvider, `SCOUTX_BATCH=1`, YOLOX-s ONNX
  (weights in `/home/claude/work/det`).
- Decoder `cv2`, ffmpeg 6.1.1, torch 2.14.1 (CUDA unavailable), docTR 1.1.0, EasyOCR 1.7.2.

Flags per candidate:
- T: `SCOUTX_TELEPORT_SPLIT=1`
- D: `SCOUTX_APPEARANCE_ONLY_LIKELY=0`
- C: `SCOUTX_OCR_VARIANT=combined`
- I: `SCOUTX_INTERP_NO_UPGRADE=1`

These are read at import (`tracklets.py:273`, `states.py:53`, `ocr.py:274`, `states.py` I), and the effective
values appear in every report.

## 2. Audit of the fixes from source

| Fix | Original failure | Mechanism | Possible losses / interactions | Evidence |
|---|---|---|---|---|
| **T** teleport split | IMG_4809 1,151 s: a CONFIRMED track jumped to another player after a camera pan / owner tap (17 CONFIRMED wrong frames with taps) | Cut a track where its camera-compensated box teleports | Can fragment a true track (more abstention). Affects tracklet building, so upstream association changes; nonlocal through identity resolution | Dev: wrong-player frames 11 → 0 in E6 (with D, C). Isolated T effect is not measured on the new matches |
| **D** no appearance-only LIKELY | IMG_4809: 0 correct appearance-only LIKELY, 19 wrong, 12 unmatched | `ev == appearance` → AMBIGUOUS (states only) | **Interaction found:** interpolated fills between now-AMBIGUOUS samples kept LIKELY (fixed by I). Loses any correct appearance-only LIKELY (none observed on labels) | Dev labelled frames; new matches unlabelled |
| **C** combined jersey reader | Reads missed on legible backs | Second reader variant, separate cache file | More reads means more chances of a wrong read. Seeds: 0 → 12 (IMG_4529) and 0 → 1 (IMG_5105) | No CONFIRMED claim with a legibly different number on either new match (claim audits) |
| **I** interpolated-claim cap (new) | IMG_4529 under T+D+C: all 4 legibly wrong LIKELY samples (#12 ×2, #17) and the probable #29 were 1–2-sample interpolated fills bordered by AMBIGUOUS | An interpolated run stays claimed only if both bounding samples are claims | Removes legitimate single-gap fills next to a non-claim | Section 4 |

Other listed failure classes:

| Failure class | Coverage in this audit |
|---|---|
| Same-kit exchange, pause-and-resume, one-frame confirmed transfer, correct number on the wrong track | Covered only by the existing worker regression suite (725 pass, 11 skipped, 6 expected failures; xfail = documented known failures). No new failing case was found in the claim audits. Not re-proven on the new matches, which lack labels |
| Conflicting / partial numbers | Conflicting-number abstention held. Every `conflict` sample stayed AMBIGUOUS. The #29 read at 1,865.0 s was correctly a conflict; only the interpolated sample before it leaked, which I fixes |
| Cache dependence | Cold-cache reruns gave **byte-identical** combined OCR caches: IMG_4809 E6 vs E6+I `b7f7ac50…`; IMG_4529 resumed-warm T+D+C vs cold T+D+C+I `7f7532e1…`. Boxes and evidence were identical, so resume and cold runs are equivalent for these runs |

## 3. Experiment inventory: validity

| Comparison | Status | Notes |
|---|---|---|
| Release vs T+D+C (all matches) | **Partly confounded** | The candidate tree also contains the tap fixes and the stage-1 refactor. In automatic runs taps are inert and e092fc3 is bit-identical, so the difference is very likely T/D/C, but a flags-off 0bae8d7 control on the new matches was **not run** |
| T+D+C vs T+D+C+I (IMG_4809, IMG_4529, IMG_5105) | **Valid, isolated** | Same tree except I; identical OCR caches, boxes and evidence |
| Stage-1 reuse (hard links) and discovery reuse | Valid, documented | No T/D/C/I change touches stage 1. e092fc3 is bit-identical by its own test |
| IMG_4529 T+D+C | Valid, *resumed* | Workspace restart; resumed from its **own** partial cache; equivalent to cold (identical caches) |
| Release + 4 taps / T+D+C + 4 taps (IMG_4809) | Owner-assisted, **not a predeclared protocol** | Taps were placed in labelled intervals, so they are not evidence of automatic or generalised performance |
| CPU vs GPU (GPU-3 session 2) | Valid, parity **not met** | GPU abstains more on candidates; CPU numbers do not forecast GPU |
| TrackEval numbers | Valid single-target only | Sparse labels |

## 4. Results per match (automatic, no anchors)

Labels:
- IMG_4809: interval labels (2,652 frames, 503 target frames; owner/earlier annotation; development, prediction-exposed).
- IMG_4529 and IMG_5105: **no target labels**. Their figures are processing results plus agent claim audits
  (prediction-exposed, one frame per claim segment, read by eye). They are not accuracy.

**IMG_4809** (development, day, sideline), denominators 503 interval target frames:

| Run | Correct | Proven wrong-player | Abstain | CONFIRMED wrong |
|---|---|---|---|---|
| Release | 266 | 11 | 236 | 0 |
| T+D+C | 307 | 0 | 195 | 0 |
| T+D+C+I | 307 | 0 | 195 | 0 |

Under T+D+C+I, all 2,647 scored frames are identical to T+D+C. I changed only 3 unlabelled frames (51.8 s, 1,299.6 s, 1,831.4 s).

**IMG_4529** (held-out → exposed; night, low sideline, spectators). Whole recording 28,217 samples at 10 Hz:

| Run | CONFIRMED | LIKELY | Legibly wrong LIKELY (audit) | Legible #20 in claims |
|---|---|---|---|---|
| Release | 0 s | 0 s | — | — |
| T+D+C | 65.0 s | 68.2 s | 0.4 s (#12, #17) + 0.1 s probable #29 | 5 CONFIRMED runs and 2 LIKELY segments; 10 CONFIRMED runs illegible |
| T+D+C+I | 65.0 s | 64.7 s | **0** (all 5 removed) | unchanged: none of the 35 removed samples was a legible #20 |

**IMG_5105** (held-out → inspected; day, low sideline behind a railing):

| Run | CONFIRMED | LIKELY | Audit |
|---|---|---|---|
| Release | 0 s | 6.4 s in 19 segments (0 seeds: appearance-only) | All numbers unreadable; at least 2 visibly different players, so some are wrong; **unverified** |
| T+D+C | 5.9 s (2,178.5–2,184.6 s) | 0.9 s, all interpolated fills bordered by AMBIGUOUS | CONFIRMED run shows "20" (probable, blurred); LIKELY unreadable |
| T+D+C+I | 5.9 s (unchanged) | **0 s**: all 9 interpolated LIKELY samples removed (rule fixed before this output was viewed) | Boxes, evidence and OCR cache identical to T+D+C |

**Not measurable here:**
- Recall, acquisition delay, switches and fragmentation on the new matches, because there are no target labels.
- Correlation: frames within a match are not independent. IMG_4809 is one match, so its 503 frames are one sample
  of footage conditions.

**Processing reliability** (2-CPU workspace):
- All runs completed with exit 0. The release runs took 11,002 s and 13,721 s end-to-end for 47-min and 46-min
  recordings (≈0.25× real time).
- Two workspace restarts were recovered by stage-1 chunk checkpoints and resumed resolve.
- Peak RSS 2.1–2.4 GiB.
- Candidate times are *resolve-only* over the reused stage 1, so they are not end-to-end speed-ups.

## 5. Coaching and downstream safety

What was checked from source and reports:
- The server keeps only CONFIRMED/LIKELY events and moments (`trackingV3.ts:340,423`).
- LIKELY moments are shown as *questions to the owner* (`moments.ts:62 askIdentity`).
- **Corrected 2026-11-18 (see ledger §25):** there is no single 120-s coaching gate. Separate contracts:
  - Match-level off-ball positioning: worker `offball.MIN_CONFIRMED_SEC = 60` s of CONFIRMED anywhere in the match,
    plus ≥ 30 s with an opponent measurable.
  - The "seen a lot, rarely on the ball" improvement: app `coach.ts` `MIN_CONFIRMED_FOR_COACHING_SEC = 120`.
  - Clip observations: ≥ 6 s continuous CONFIRMED on every frame.
- IMG_4529 T+D+C(+I): 12 spell moments (6 LIKELY, 6 CONFIRMED) and 0 events; the wrong-player flickers never became
  moments.
- With 65.0 s confirmed, off-ball is **measured** (61.2 s measured), so the app *would* show a match-level
  positioning observation plus up to 2 clip observations. The earlier sentence "match coaching gate not met" was
  wrong.
- 10 of the 15 confirmed runs that feed it have no legible number. They are unverified, not demonstrated correct.
  This is a human coaching-review item.

Gaps:
- App and backend tests last passed 826/826 at 9ba85c3 on 2026-11-17. There have been no app or backend changes
  since (verified with `git diff 9ba85c3..f699669 -- src functions/src tests` = empty). They were **not re-run** in
  this session because no node_modules install fits the remaining disk.
- No human coaching review exists.
- CLIP-EXP-1 remains experimental and unimported.

## 6. Holdout and exposure

| Match | Partition | Exposure |
|---|---|---|
| m-img4809 | development | All tuning |
| m-2024-03-27-night (IMG_4529) | held-out, frozen before predictions | Predictions inspected; **used to design I**, so no longer untouched |
| m-2024-08-31-day (IMG_5105) | held-out, frozen before predictions | Predictions inspected after I was committed; not used for design; previously inspected evaluation |

**No untouched footage is available locally.** Confirmation needs the 10 batch-01 recordings (or others) downloaded,
frozen into the split before any prediction, and labelled or owner-reviewed (§9).

## 7. Candidate verdicts

| Candidate | Verdict | Smallest missing validation |
|---|---|---|
| T | Supported for further validation | Untouched labelled match; isolated T run on new matches |
| D | **Needs revision → only together with I** | D alone lets interpolated LIKELY leak; evaluate D+I as one unit |
| C | Supported for further validation | Untouched labelled match; GPU parity of the reader |
| I | Supported for further validation | Untouched match; it is a pure safety cap with no labelled coverage loss on IMG_4809 |
| T+D+C+I combined | Supported for further validation | Interaction evidence exists only on 1 labelled dev match + 2 exposed unlabelled matches |
| Server every-frame sequence check (9ba85c3) | Ready for a promotion **proposal** (code merge only) | Re-run app/backend suites before merge; it has no user effect while analysis is disabled |

## 8. Promotion packet: server sequence check (only proposal-ready item)

Decisions that stay separate:
- (a) merging into main
- (b) deploying Functions
- (c) enabling analysis
- (d) product scope

**Approval is requested for (a) only, after the suites pass.**

| Item | Detail |
|---|---|
| Change | `functions/src/analysis/trackingV3.ts` `confirmedOnEveryFrame` + `parseOffballSequences(raw, strip, frames?)` (commit 9ba85c3). Off-ball sequences need every timeline sample CONFIRMED (gap ≤ max(0.55 s, 1.5× step)) instead of a 1-s majority |
| Evidence | Unit test with a mid-second LIKELY, a 0.6 s gap and the 2 Hz case. Removes sequences that only passed the majority |
| Trade-off | Fewer clip sequences, never more |
| Compatibility | Server-only. Same schema; `frames` is optional, and the fallback is the old behaviour |
| Privacy / licensing | None new |
| Rollback | Revert the single commit with `git revert 9ba85c3`; check the diff touches only trackingV3.ts, the test and functions/lib. Persisted reports are unaffected (parse-time logic) |
| Stop condition | Any failing app/backend contract |

## 9. Pilot readiness: NOT READY

Blockers, with the evidence each one is missing:
1. **No untouched, labelled evaluation.** Both new matches are exposed and unlabelled.
   Needed: ≥2 prospectively frozen matches with owner-confirmed identity and target labels (or owner-reviewed claim samples).
2. **Identity of the target on new matches is not owner-confirmed.** Packet:
   `.local/footage-lib/owner-review-2026-11-18/README.txt` (Q1–Q4).
3. **Automatic coverage on new footage is ~0 for the release** (0 s confirmed on both) and small for the candidates
   (65 s / 5.9 s). A user-facing automatic pilot would mostly show "insufficient evidence".
4. **CPU/GPU parity is not met** (GPU-3 s2). The production GPU path abstains more; no GPU run of I exists. The GPU
   search is stopped (2 vs 3 session discrepancy unresolved).
5. **Rollout and rollback controls were not exercised in this session** (no emulator/node toolchain on the remaining
   disk). A plan is in §10, but untested.
6. **No independent human review** of tracking labels or coaching.

Safe next stage: *internal shadow evaluation on the owner's own authorized footage*. Run locally, keep output
private to the owner, show nothing in the app, send no footage to external processors, and have the owner review
sampled claims. No participant pilot.

## 10. Rollout / rollback plan (prepared, untested)

**Stages:**
1. Local evaluation (now).
2. Internal shadow on owner footage.
3. Owner-assisted private pilot with review-before-display.
4. Limited opt-in.

Each stage needs explicit approval. Entry criteria for stage 3 are owner decisions:
- maximum tolerated CONFIRMED wrong-player seconds per match (proposed 0 on reviewed samples);
- minimum reviewed claim sample per match;
- maximum LIKELY wrong share among reviewed LIKELY claims.

**Controls:**
- Worker flags stay default-off.
- A candidate enables only through an explicit per-job version pin.
- Server-side analysis gates stay off.
- No public sharing.

**Kill switch:**
- Turn analysis back off (existing server gate). Running jobs finish, but their output is withheld; queued jobs are
  cancelled.
- A flag does **not** retract already persisted reports or exported copies. Affected reports must be marked
  withheld and recomputed with a verified version.
- Owner corrections are stored separately from reports and are preserved.

**Rollback by layer:**

| Layer | Procedure |
|---|---|
| Worker | Redeploy the previous image digest |
| Functions | Redeploy the previous release, keeping the Node runtime and index definitions |
| App | No change needed; analysis UI stays gated |

**Monitoring** (privacy-preserving: no frames or crops):
- Per-job version, stage failures and fallbacks.
- Confirmed/likely/abstain seconds.
- Owner rejection rate.
- Latency, RSS and cost per completed analysis.

Silent identity errors are not detectable by telemetry, so sampled human review stays mandatory.
