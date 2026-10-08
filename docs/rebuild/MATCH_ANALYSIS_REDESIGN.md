# Match Analysis Redesign Audit

## CURRENT ARCHITECTURE

The current PitchProof implementation already contains a basic player-match-analysis flow:

- The mobile app exposes a match-analysis modal via [src/features/match-analysis/components/MatchAnalysisModal.tsx](../../src/features/match-analysis/components/MatchAnalysisModal.tsx).
- The hook in [src/features/match-analysis/hooks/useMatchAnalysis.ts](../../src/features/match-analysis/hooks/useMatchAnalysis.ts) samples video frames, uploads frames and the full video, starts a job, and subscribes to Firestore status changes.
- Firestore persistence is handled by [src/features/match-analysis/repositories/MatchAnalysisRepository.ts](../../src/features/match-analysis/repositories/MatchAnalysisRepository.ts), which creates and updates `matchAnalysisJobs` documents.
- The server-side Cloud Function in [functions/src/matchAnalysis.ts](../../functions/src/matchAnalysis.ts) downloads a small set of sampled frames, sends them to OpenRouter, and normalizes the AI result into a report.
- Reporting is rendered in the existing modal and backed by the typed report model in [src/features/match-analysis/types.ts](../../src/features/match-analysis/types.ts).

## PROBLEMS

The current implementation is useful as a proof-of-concept, but it does not meet the football-analysis specification.

1. It is still a single sparse-frame heuristic, not a full evidence-first match-analysis pipeline.
2. It does not explicitly distinguish observation, inference, and unknown states.
3. It does not maintain player availability, halftime detection, or substitution-aware coverage windows.
4. It does not model tactical phases, field zones, or role-aware analysis by position.
5. It does not create a provider abstraction around computer vision, tracking, event detection, or language reasoning.
6. The server prompt can still reward confidence inflation when the footage is incomplete.
7. The report data model does not track evidence references, player visibility coverage, or a conservative analysis confidence band.

## PROPOSED ARCHITECTURE

The correct design is a staged pipeline that treats the video as evidence, not as an excuse to guess:

1. Video ingestion and preprocessing
   - Detect duration, resolution, orientation, audio, scene changes, and quality.
   - Create a low-resolution analysis stream and adaptive frame sampling plan.
2. Match segmentation
   - Identify warmup, kickoff, active play, halftime, stoppages, second-half action, and full-time segments.
3. Player identification
   - Combine jersey number, team color, position, body continuity, and team context to identify the target player.
4. Player tracking and availability timeline
   - Maintain visible / off-camera / substituted / unknown states instead of assuming the player is absent whenever they leave frame.
5. Event detection and validation
   - Only emit events when confidence exceeds threshold and the action is visible.
6. Tactical and role-aware reasoning
   - Evaluate decisions against the player's role and the match phase instead of using a generic action count.
7. Coaching synthesis
   - Convert validated events into evidence-backed training feedback and video highlights.
8. Final validation layer
   - Reject or downgrade any event that is not adequately supported by visual evidence.

## DATA FLOW

Video upload
↓
Preprocessing & adaptive sampling
↓
Match segmentation
↓
Target player identification
↓
Tracking + availability timeline
↓
Event extraction + tactical context
↓
Evidence validation
↓
Structured report generation
↓
UI timeline + coaching recommendations + highlight reel

## MODEL FLOW

The design should not be "LLM does everything from raw footage".

- Computer vision and object detection should own tracking and jersey detection.
- Event detection should operate off validated tracking sequences.
- Language reasoning should summarize only validated observations.
- A final validation layer should downgrade any low-confidence or missing evidence before it reaches the report.

## SECURITY MODEL

- Videos remain user-owned and private unless the user explicitly shares them.
- Storage should remain under user-scoped paths and strict Firebase Storage rules.
- Cloud Functions must not expose provider credentials to the client.
- Match analysis should support deletion of raw videos, analysis outputs, and generated highlights.

## IMPLEMENTATION PLAN

### Phase 1 — audit and data contracts
- Confirm current upload and analysis flow.
- Add conservative reporting fields for coverage, evidence, and confidence bands.

### Phase 2 — session-aware pipeline
- Add explicit `playerAvailability`, `matchSegments`, and `evidence` model types.
- Move report generation behind a validation layer.

### Phase 3 — backend foundation
- Introduce provider abstractions for vision, tracking, and language summarization.
- Keep OpenRouter usage as a pluggable backend rather than a hard-coded final architecture.

### Phase 4 — match segmentation and tracking
- Add halftime, stoppage, substitution, and off-camera state modeling.
- Ensure the report explicitly reflects unknown time rather than inventing a total.

### Phase 5 — UI and coaching
- Present a coverage panel, evidence timeline, and conservative match summary.
- Keep the UI honest: unknown periods should say "insufficient evidence" instead of showing a fake stat line.

### Phase 6 — testing and quality gates
- Validate hidden-clip edge cases: poor footage, dual jersey numbers, substitution windows, halftime, and off-camera behavior.
- Treat the final quality gate as evidence accuracy, not generic impressiveness.

## SUMMARY

The app is already on the right track with upload, sampling, and asynchronous analysis, but the current implementation is still a mock-style match-summary prototype. The required step-change is to move to a conservative, evidence-first football intelligence pipeline that never invents player actions and always marks uncertainty transparently.
