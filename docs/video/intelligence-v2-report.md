# Bounded Intelligence V2 Report

## Audit

The existing report contract contains sampledCoverage, sections with availability/reason,
pipelineStages, versions, frame-linked evidence, media lifecycle and identity confirmation.
Existing VideoIntelligenceSections retains corrections and retention notices. Existing
quality/coaching/GPS cards remain in place. No type or repository changes are needed.
The previous generic moments list had no required evidence references and was not a
reliable evidence timeline. Broad legacy position inputs cannot establish a specific role.

## Implemented

- Evidence-first overview, recorded segment review counts and sampling denominator.
- Stored model/generated timestamp and optional version provenance, without invented versions.
- Evidence timeline uses retained known frame references and their recording timestamps,
  not model-supplied timestamps or an inferred match clock. Missing/partial citations stay
  non-seekable. Retained source availability still gates video playback.
- Seek rejects invalid, negative and out-of-recording timestamps across report entry points.
- Fifteen explicit football role lenses: GK, CB, LB, RB, LWB, RWB, CDM, CM, CAM, LM,
  RM, LW, RW, CF, ST. Unknown/broad roles are not silently mapped to a specific role.
- Parent integration now supports selecting all 15 specific roles in the targeting types,
  MatchAnalysisModal and server TARGET_POSITIONS, flowing through to the coaching framework.
- Parent integration subscribes the report screen to live job updates. Rejecting identity,
  including not_me/dispute-not_me feedback, transactionally invalidates dependent report
  claims and requires a new review. Withdrawing or undoing feedback does not restore them.
- Correction footnotes in all seven matchAnalysis locales (en/de/fr/es/it/nl/pt) describe
  invalidation, no automatic confirmation of statistics and no AI training from feedback
  or footage. Each locale includes sync.saveFailed for the parent-owned sync component.
- Prompts require evidence-linked coaching, practice criteria, uncertainty and explicit
  evidence for role-change intervals. The framework produces no scores or ratings.
- Review normalization excludes invalid timestamps, replay, non-play and unclear camera
  frames from performance observations. Possible events remain needs_review.

## Boundaries And Blockers

Only owned report components, segmentReview, positionFramework and focused tests are changed.
This follow-up edits only the seven matchAnalysis locale files and this document;
the sync component and parent-owned integration code are not modified here.
Legacy reports remain readable; absent evidence links never become fabricated links.
Existing technique-rating compatibility is retained; this framework adds no rating system.
Sample counts are not match-time visibility percentages or continuous tracking coverage.
Model visibility is not independently verified identity. Runtime normalization validates
structure and references, not whether model prose is factually correct.

Specific role selection is implemented. Persisted role-change intervals are not implemented
and still require an agreed contract; selecting a role does not establish its match interval.
Backend segmentation, CV contracts and uploads remain parent-owned. No deployment,
provider requests, private footage access or commits were performed. Genuine consented
real-footage evaluation was unavailable; unit fixtures do not establish tracking accuracy,
football-coaching quality or production readiness. Device/visual report QA remains required.

## Verification

- Locale follow-up: i18nParity.test.ts passed all 23 namespace checks, including
  matchAnalysis key and placeholder parity across all seven languages.
- Focused positionFramework tests: 4 passed.
- Existing videoIntelligence suite: 33 passed.
- Functions strict TypeScript (`tsc --noEmit -p functions`): passed.
- App TypeScript: blocked by unrelated GPS import translation typing and missing GPS
  locale import keys in the shared worktree; no owned-file diagnostics reported.
