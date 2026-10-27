# Video Intelligence 4.0 — delivery report (2026-10-27)

Branch `feature/player-tracking-v3` on top of `origin/main` `c7349d5`. 4.0 builds on the 3.2 engine
(`8e2aff1`) and does not replace any of it. Everything below separates **measured** values from
**estimates** and **targets**. Nothing here sets `CV_WORKER_APPROVED`, `CV_EVENTS_VALIDATED` or
`TRACKING_V3_ENABLED`; no release gate was changed.

## 1. Product research

Separate document: [`intelligence-4.0-research.md`](intelligence-4.0-research.md) — Veo Player
Moments / Analytics 2 / Coach Assist, Trace PlayerFocus, Hudl, Wyscout, Gemini video understanding
and TwelveLabs; interaction patterns worth adopting and where PitchProof can be distinctive.
Desk research from public documentation only; no hands-on testing of competitor products.

Patterns adopted (in our own form): a per-player playlist of moments as the core artifact;
adjustable clip windows; correction as a normal part of the loop; a coach chat grounded in
structured match data (never the raw video per message); category filters; early results.

## 2. Repository audit

| Item | Verified state |
|---|---|
| Branch / commits | `feature/player-tracking-v3`: `91f069d` (v1), `8ad9170` (3.0), `8e2aff1` (3.2), then two 4.0 commits |
| 3.2 claims | engine 3.2 identity states, YOLOX (Apache-2.0), cached stage-1, ~19 s correction, swipe review, link import, gates: all present and re-run (tests below). App unit tests before 4.0: 676; worker tests ≈480 — both confirmed by running them |
| Existing infrastructure reused | `writeSystemActivity` + push policy (dedupe, categories, lock-screen copy for minors), `getMediaPlaybackUrl`, `expo-video`, reel studio (`ReelRepository`, footage segments), development goals, tracking review deck |
| Missing before 4.0 | **No Functions code called `/v3/tracking:extract`** (only re-resolve was wired) - there was no server path from an uploaded video to a tracking report; no progress model (legacy stages only); no moments/clips; no coach/Ask grounded in tracking; no notifications for tracking |
| Major risks | identity coverage on amateur footage (confirmed ≈ 0.7 % of analysed time without answers); ball almost never trackable near the target in the evaluation recording; CPU runtime; no GPU; no emulator for rules tests; no physical devices |

## 3. Implemented experience

Screenshots: [`screenshots-4.0/`](screenshots-4.0/) (phone viewport 412×915, produced by
`scripts/review-preview/capture.mjs` from recorded worker output of IMG_4809; see captions there).

| Area | What exists now |
|---|---|
| Analysis setup | Upload or direct-media link as before; the progressive analysis now **starts automatically** after the upload/import is validated (server-gated, idempotent). Old jobs get a single "Analyse my player" card. No extra form. |
| Progress | Workspace with the 7 stages (received → ready), each derived from persisted facts; "n of m parts prepared"; a time estimate only after this job's speed was measured; "you can leave" copy; problem states (consent, source missing, service unavailable, interrupted, cancelled) say what happened, what to do and whether retrying helps. |
| Early results | Preliminary report after the first part(s) while extraction continues ("Early results up to mm:ss"); a preliminary report never overwrites a fuller one. |
| My Moments | Moment cards (kind, time, duration, outcome, evidence label), category filter, best moments first, separate "Is this you?" group; player with clip-start seek, loop inside the clip, slow motion, ±0.1 s frame steps, replay, start-earlier/end-later, target outline, private note, honest "playback unavailable". |
| Identity review | Optional; can be answered **while watching a moment** (answer becomes per-match feedback through the existing callable; undo supported) in addition to the 3.2 swipe deck. |
| AI Coach | Evidence-grounded insights (what happened / why / what to do / how to practise / where to see it), ≤2 strengths and ≤2 improvements, position- and age-aware drill library, first-person limitations ("I cannot verify …"). On the evaluation recording it makes **no performance claims** because no target ball action was measured. |
| Ask PitchProof | Deterministic retrieval over this match's validated evidence in 7 languages: intents, timestamped moment buttons, follow-ups, explicit refusals for km/speed/heat map/goals when not measurable. No external model is called. |
| Match Review | Hierarchy A–H (hero, story, best moments, went well, work on, next-match focus, details, ask); Simple / Detailed / Scout views; scout view hides coaching opinions. |
| Highlights | Presets offered only with evidence (defensive is never auto-built: duel/tackle are unvalidated candidates); evidence-first deterministic ranking, 25 s diversity gap, no overlapping footage; saved as **private draft** via the existing reel studio/export. |
| Development | "Am I improving?" with comparability guard (full reports, same engine major, ≥10 confirmed minutes per match); next-match focus linked to an existing development goal; "Add as development goal". |
| Notifications | started (in-app only), first moments ready, review needed, full report ready, interrupted — deterministic ids (never twice), analysis category preference, per-type cooldowns, generic lock-screen copy for minors, deep links `match/<id>/moments` and `match/<id>/review`; new **quiet hours** (22:00–07:00) setting enforced server-side. |
| Languages | All new copy in en, de, es, fr, it, nl, pt (parity test). |

## 4. Code changes

**Added**

| Path | Purpose |
|---|---|
| `functions/src/analysis/trackingProgress.ts` | pure rules: segment plan (120 s first part, then 300 s, ≤61 parts), preliminary cadence, version guard, measured throughput/remaining time, notification ids, review-needed rule, progress metrics |
| `functions/src/analysis/trackingOrchestrator.ts` | `startPlayerAnalysis` (owner callable, rate-limited 10/day, consent + source + gates), `extractTrackingSegmentTask` (Cloud Tasks, 3 attempts, worker extract with 60-min signed URL, measured processing time, triggers preliminary/full resolve) |
| `workers/football-cv/scoutx_tracker/moments.py` | context-aware clip windows (lead-in/outcome window, never across camera cuts or into non-play, 4–20 s, merging), confirmed and likely spells, target indicator, thumbnail from the target's own close-up |
| `src/features/match-review/**` | services `journey`, `moments`, `coach`, `ask`, `highlights`, `review`, `development`; components `AnalysisWorkspace`, `MomentCard`, `MomentPlayerModal`, `MatchReviewView`; hooks |
| `scripts/review-preview/**` | dev-only preview + Playwright capture (not shipped) |
| tests | `tests/unit/trackingOrchestrator.test.ts`, `matchReview.test.ts` (uses the real IMG_4809 worker output), `matchReviewKeys.test.ts`, `workers/football-cv/tests/test_moments_40.py`; fixtures `tests/fixtures/tracking40-img4809-{auto,answers}.json` (images removed) |
| docs | this report, research, screenshots |

**Modified**: `trackingCallables.ts` (resolve scopes, moment images, guard, notifications,
`settleOrchestratedResolve`), `trackingV3.ts` (moments, analysedRange, videoSize, answers on a
moment), `notificationPolicy.ts` (new activity types, deep links, quiet hours), `pushDelivery.ts`
(cooldowns), `index.ts` (exports), worker `analyze.py`/`invariants.py`/`app/tracking_v3.py`,
`AnalysisReportScreen.tsx` (review is the default tab when available; legacy tabs kept under it),
`useMatchAnalysis.ts` (auto-start after upload/link import), navigation (`match/<id>/moments|review`),
notification preferences (quiet hours; client, server, rules), 7 locale files (`matchAnalysis.review.*`,
`settings.quietHours`).

**Contracts**: worker report gains `moments[]`, `analysedRange`, `videoSize` (target-only; moment
thumbnails are base64 in the response and stored owner-only by Functions). Extract response gains
`processingSec`. New Firestore doc `matchAnalysisJobs/{id}/tracking/progress` (server-written,
owner-read — covered by the existing subcollection rule); `tracking/current` gains `scope`, `parts`.
`notificationPreferences` gains optional `quietHours`.

**Migrations**: none required. Reports from older workers parse with `moments: []`; jobs without a
progress doc are treated as full reports; preferences without `quietHours` behave as before.

**Feature flags**: unchanged. Orchestration, extraction and resolve all require
`TRACKING_V3_ENABLED=true` **and** `cvWorkerStatus()==='available'` (approval record); otherwise the
user sees "Analysis is not available right now" and nothing is queued.

## 5. Performance benchmark

Hardware: this cloud container, **2 vCPU, 7 GB RAM, no GPU**. Recording: IMG_4809 (34 min, 1920×1080).

| Measurement | Value | Kind |
|---|---|---|
| Stage 1, planned first part (0–120 s, 1,200 frames @10 fps), YOLOX-s ONNX, one process | **530 s** worker (541 s wall): decode 77, detect 415, scene/camera motion 26, colour 8, embedding 2, crop I/O 1 | measured |
| Stage-1 rate | 0.44 s/frame = **4.4 worker-seconds per video-second** | measured |
| Preliminary resolve over that part (fresh dense OCR) | **85 s** | measured |
| **Time to first result** (start → first report) | **628 s (10.5 min)**. That report had 0 moments (warm-up at the start of the recording) and 6 review questions; the orchestrator therefore re-resolves after parts 2 and 3 | measured |
| Full resolve, 12 cached parts, no answers | 40.6 s | measured |
| Re-resolve with 39 answers (cached) | 13.5 s (3.2: 19.2 s) | measured |
| Ask PitchProof answer / review assembly | 0.04 ms / 0.17 ms (no model call) | measured |
| YOLOX-s torch baseline (3.2 run) | 1,423–1,446 s per 180 s part, 2 processes × 1 thread | measured (3.2) |
| Full 34-min extraction on one 2-vCPU worker | ≈ 9,000 s (2.5 h) | **estimate** = measured rate × duration |
| 90-min match, one worker / six parallel workers | ≈ 6.6 h / ≈ 66 min + resolve | **estimate** |
| GPU (L4 or similar) | **not measured** — no GPU available to this session | blocked |

Targets (brief §6) vs evidence: full 90-min analysis in 10–20 min on GPU — **unmeasured**;
identity correction < 5 s — **not met** on CPU (13.5–19 s); report refresh < 10 s — **not met** on CPU;
AI answer 3–8 s — met (deterministic, < 1 ms). First moments before the full analysis — **met by
design** (preliminary reports) but the measured first report on this recording had no moments yet.

Cost per match (estimate, Cloud Run instance-based list prices: $0.000018/vCPU-s, $0.000002/GiB-s,
L4 $0.0001867/s; region tier and free tier not applied): CPU 2 vCPU/4 GiB ≈ 23,900 s × $0.000044
≈ **$1.05 per 90-min match**. GPU: L4 + 4 vCPU/16 GiB ≈ $1.05/hour, so ≈ $0.18–0.35 per match **only
if** the 10–20 min target is reached — not measured. Corrections reuse cached stage-1 work
(never re-decode); Ask costs nothing per question.

## 6. Accuracy report

Footage: IMG_4809, orange #20, 34 min (the only authorised fixture available). Identity engine
unchanged from 3.2, so the 3.2 identity results stand (confirmed claims 9 right / 0 wrong / 3
unverifiable; 0/138 other numbers confirmed; leave-one-out recall 0/10).

New in 4.0 — moments (resolve over the cached 3.2 stage-1 run):

| | No answers | 39 owner answers |
|---|---|---|
| Moments | 6 (1 confirmed, 5 needs review) | 29 (5 confirmed, 24 needs review) |
| Confirmed identity coverage | 14.9 s | 56.7 s |
| Target ball actions (contacts, passes, duels) | **0** | **0** |
| Clip time | 48 s | 237 s |

Visual audit of the moment frames (by the implementer, by eye; **not an independent annotation**):
without answers the one confirmed moment shows #20 readable (correct); the 5 needs-review moments
show no readable number (4 consistent with the #20's appearance, 1 unclear). With answers, 1 of 5
confirmed frames shows #20 readable, the other 4 show no number in the sampled frame; of 24
needs-review frames, 2 show a (partial) 20, 2 have a team-mate overlapping the outline, the rest are
unverifiable. This is exactly why they are labelled "Needs your review" and never feed coaching
or automatic reels.

Events: no target ball action was measured in this recording, so the coach makes **no performance
claim**, Ask declines passing questions, and ball-involvement reels are unavailable. Physical
metrics stay withheld (no calibration; 0 % calibration feasibility in 3.2). The orange #8 Veo
recording was **not evaluated** (no authorised access). Multi-match accuracy validation remains
outstanding.

## 7. Testing report

| Suite | Result |
|---|---|
| App unit tests (`npm run test:unit`) | **698 passed**, 0 failed, 0 skipped |
| Worker tests (`pytest tests`) | **488 passed** |
| `npm run typecheck` (app + tests), Functions `tsc` build | pass |
| `npm run lint`, Functions ESLint | pass |
| i18n parity, all 7 locales (keys + placeholders) and composed-key coverage | pass |
| Firestore/Storage rules tests (incl. new quiet-hours and progress cases) | **not run** — emulator download blocked in this environment |
| Playwright web E2E | not run (marketing/legal specs unrelated); preview renders captured with Playwright instead |
| Real-footage evaluation | IMG_4809 only (above) |
| GPU benchmark | blocked (no GPU) |
| Physical devices (iOS/Android), push delivery, background behaviour | **not run** — no devices |

End-to-end scenarios (brief §28): A short clip — not executed on device; B 34-min #20 — engine,
preliminary report, moments, corrections and disclosures exercised with real data, playback shown in
the preview, speed measured on CPU; C 90-min — orchestration logic unit-tested (planning, retries,
resume, notifications), not run on real infrastructure; D 140-min Veo #8 — **blocked** (no authorised
access); E poor footage — covered by this recording (no OCR on most frames, no calibration, no ball
actions) and by unit tests; F mobile interruptions — server side unit-tested (resume, cancel, stale
deliveries), device behaviour not tested; G scout viewing — tracking data is owner-only by rule; no
sharing path to scouts exists yet (not implemented).

UX evaluation: a **heuristic evaluation by the implementer**, not user research. Taps to start after
source selection: 0 (auto-start) / 1 for older jobs. Every coaching item and Ask answer links to a
moment or explains why it cannot. Identity review is optional and in context. Risks: hero numbers
("seen 7.5 min, confirmed 0.9 min") may read as poor performance rather than poor recording; long
"needs review" rows; preliminary screens repeat the "up to mm:ss" notice. Needs real participants.

Release gates: unchanged and not bypassed. No App Store readiness is claimed.

## 8. Production plan

- **Worker**: deploy `workers/football-cv` with `TRACKING_ARTIFACT_ROOT` on a job-scoped bucket
  mount (lifecycle = job retention). GPU: CUDA image with the torch backend, L4-class GPU, ≥4 vCPU /
  16 GiB, concurrency 1 per instance; benchmark with `bench/inference_benchmark.py` before approval.
- **Functions**: deploy `startPlayerAnalysis`, `extractTrackingSegmentTask` (queue: 3 attempts, 60 s
  backoff, max 6 concurrent dispatches, 30 min deadline) and the updated `resolveTrackingTask`.
- **Models / licences**: YOLOX (Apache-2.0, SHA-256 pinned), existing OCR stack; no AGPL model; no
  external video model is called.
- **Secrets / providers**: none new. Signed source URLs are 60 min, generated per segment.
- **Monitoring**: `progressMetrics()` per job (time to first report, time to full, worker s per video s,
  retries, failures, first report had moments); push suppression reasons are already logged.
- **Budget controls**: 10 starts/day/user rate limit, existing upload quotas, Cloud Tasks
  concurrency cap, idempotent start, cached segments never reprocessed.
- **Rollback**: set `TRACKING_V3_ENABLED=false` (everything stops at the gate; the app shows the
  unavailable state; legacy pipeline untouched) or redeploy the 3.2 functions; data is additive.
- **Approvals still required**: CV worker approval record + accuracy release thresholds, GPU
  validation, rules tests on an emulator, device tests, privacy review of moment thumbnails.

## 9. Remaining blockers

**Implemented and validated (tests / measurement in this environment)**: progress planning,
throughput and version guard; orchestrator retries, resume, cancellation, de-duplicated
notifications, deep links, quiet hours (server policy); moment clip windows and invariants; report
parsing and moment answers; coach/Ask/highlights/development rules; 7-language strings; CPU time to
first result; Ask latency.

**Implemented but not independently validated**: the whole flow on real Firebase/Cloud Tasks/worker
infrastructure; rules changes (emulator blocked); push delivery and background behaviour on
devices; moment playback on iOS/Android (web render only); the accuracy audit (implementer, by eye).

**Experimental**: likely-identity moments; ball events (none on the test recording); duel/tackle
candidates (never counted); physical metrics (withheld without calibration).

**Blocked by third-party access**: GPU benchmark and deployment; Veo orange #8 (no authorised
access); physical devices.

**Not implemented**: Passport opt-in sharing of evidence and the scout-side view of shared moments;
loading earlier matches into "Am I improving?" (only the current match is evaluated, so no trend is
shown yet); server-side localisation of notification text (English, as before); persisted clip
adjustments (session-only) and synced notes (device-only); layer-B video understanding (intentionally
off — no private footage leaves the system); product analytics events beyond the progress metrics.
