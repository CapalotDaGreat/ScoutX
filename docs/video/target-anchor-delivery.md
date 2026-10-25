# Target Anchor Foundations Delivery

Date: 2026-10-23. Scope: experimental foundations, not continuous player tracking.

## Implemented

The report now has a reusable sampled-frame rectangle editor behind
`EXPO_PUBLIC_EXPERIMENTAL_TARGET_ANCHORS=true`. It supports letterbox-aware two-corner
selection, manual percentage inputs, geometry validation, reset, image-load failure,
save errors and busy/lifecycle protection. Seven locales have matching translated keys.
The full-report entry action was moved to the top of the preview modal for reachability.

`saveAnalysisTargetAnchor` requires the independent server gate
`EXPERIMENTAL_TARGET_ANCHORS=true`, an authenticated owner, current unrevoked video
consent, a completed cloud job and a known server-extracted frame. Timestamps and source
paths are derived from the job, not client assertions. Bounds are normalized to that
image; no person detector, face recognition or automatic mask is implied by the editor.

Firestore transactions compare pipeline generation and anchor revision. The stable
match-scoped target ID survives removal; at most eight anchors are retained. Operation
IDs/digests make immediate transport retries idempotent and reject ID reuse with different
payloads. Concurrent stale edits abort rather than overwriting. No additional collection,
media upload, embedding, provider call, quota debit or inference task is created.

Changing anchors advances generation, clears pending coaching/lease, resets identity
confirmation and invalidates target-dependent report claims, root events, visibility and
confidence. The same invalidation helper now serves legacy rejection and not-me feedback.
Identity confirmation reads current consent inside its transaction and checks supplied
generation/revision; experimental targets reject older clients that omit these guards.
Rejected identity cannot be reconfirmed in the same review. A new anchor review or analysis
is required. Corrections and their client display/deduplication are scoped to target revision,
so an earlier not-me record cannot silently mask feedback on a changed anchor.
The rejection guard also uses a server-owned generation/revision marker, not only the
legacy client-editable display state. Repeated not-me feedback reasserts invalidation
without creating duplicate feedback records. A new anchor review clears that marker.
Consent withdrawal removes the experimental anchor state, including completed jobs.
Existing job/account deletion handles the nested record. Anchors do not extend media
retention, and no frame/crop copy is saved by this feature.

The production build policy rejects the experimental client flag. Both flags remain off
in real environments; only local test child processes enabled them. No production
deployment, TestFlight build, provider upload or model approval occurred.

## Worker Foundation And Limits

See `target-identity-foundations.md` for the strict experimental Pydantic models, offline
CLI and exact association rules. The resolver validates source/model/generation scope,
anchors, tracklets and overlapping segment evidence. Conflicting or competing matches
remain uncertain. It confirms only individually anchored observations; its confirmed
duration is always zero. It does not propagate identity through time or perform Re-ID.

The app record binds a server-owned storage path and frame ID. The offline worker requires
cryptographic source/frame/model digests and exact source PTS/frame indexes. A validated
adapter between them is **not implemented**. The production v2 worker ignores this new
experimental state. A saved anchor does not automatically rerun analysis or recover an
incorrect report; a new analysis/review is required. User-supplied boxes are evidence
inputs, not independently measured ground truth.

The authorized 4:02 fixture remains a negative baseline for torso OCR: the earlier
five-second run did not confirm number 20. No new footage processing was needed to test
the pure foundation. Browser fixture imagery and kernel fixtures are explicitly synthetic,
not player-accuracy evidence. No real footage or samples were uploaded.

## Exact Files

New app code:
- `src/features/match-analysis/services/targetAnchorGeometry.ts`
- `src/features/match-analysis/components/TargetAnchorEditor.tsx`
- `src/features/match-analysis/components/TargetAnchorPanel.tsx`
- `src/features/match-analysis/hooks/useTargetAnchors.ts`

Modified app integration:
- `src/features/match-analysis/types.ts`: server-owned experimental anchor type.
- `src/features/match-analysis/components/AnalysisReportScreen.tsx`: gated panel integration.
- `src/features/match-analysis/components/MatchAnalysisModal.tsx`: prominent report action.
- `src/features/match-analysis/hooks/useJobFrames.ts`: scope URL caches to owner/job/frames
  and prefer current explicit URLs over previously resolved URLs.
- `src/config/releaseBuildPolicy.ts`: reject experimental flag in production.
- `src/components/feedback/Modal.tsx`: bound fullscreen height and shrinking content so
  inner scroll actions stay reachable, without forced browser clicks.
- `src/features/match-analysis/services/matchAnalysisCallable.ts`: typed guarded identity requests.
- `src/features/match-analysis/hooks/useMatchAnalysis.ts`: current generation/revision on decisions.
- `src/features/match-analysis/services/correctionModel.ts`: parse correction revision scope.
- `src/features/match-analysis/hooks/useAnalysisCorrections.ts`: send scope and exclude old-review feedback.
- `src/i18n/locales/{en,de,fr,es,it,nl,pt}/matchAnalysis.json`: editor/review translations.

Server code:
- New `functions/src/analysis/targetAnchors.ts`: strict request geometry and bounded edits.
- New `functions/src/analysis/targetAnchorCallable.ts`: gated transactional save/remove.
- Modified `functions/src/index.ts`: callable export.
- Modified `functions/src/analysis/identityCallable.ts`: shared complete invalidation.
- Modified `functions/src/analysis/corrections.ts`: reuse invalidation for not-me feedback.
- Modified `functions/src/analysis/videoConsent.ts`: remove anchor state on withdrawal.
- Matching `functions/lib` JavaScript/source-map outputs are generated by the local build.
  Specifically `functions/lib/index.{js,js.map}` and
  `functions/lib/analysis/{targetAnchors,targetAnchorCallable,identityCallable,corrections,videoConsent}.{js,js.map}`.

Worker code:
- `workers/football-cv/app/experimental_identity.py`
- `workers/football-cv/eval/experimental_identity.py`
- `workers/football-cv/tests/test_experimental_identity.py`
- `workers/football-cv/tests/test_experimental_identity_cli.py`

Tests and configuration:
- `tests/unit/targetAnchorGeometry.test.ts`
- `tests/unit/targetAnchors.test.ts`
- `tests/rules/targetAnchors.test.mjs`
- `e2e/flows/targetAnchors.spec.ts`
- `.env.example`: documented off-by-default client/server gates.
- `eslint.config.js`: ignore nested Python virtual environments, not repository code.
- `package.json`: include anchor transaction tests in the normal rules suite.
- `scripts/run-e2e-emulators.mjs`: allowlisted desktop/mobile project selection and an
  explicit no-retries option, preserving existing defaults.

Documentation:
- New `docs/video/target-identity-foundations.md` and this file.
- Updated `docs/video/flagship-architecture.md` and `intelligence-v2-delivery.md` cross-references.

## Verification

- Full app unit suite: **586 passed**, zero failed/skipped (`.local/target-anchors-unit-final.log`).
- Full Firestore/Storage suite: **244 passed**, zero failed/skipped (`.local/target-anchors-rules-final.log`).
  Includes concurrent edit, retry/idempotency, stale confirmation, revoked consent,
  repeated not-me after new revision and rejected-identity reconfirmation regressions.
- After the final server-owned rejection-marker strengthening, the complete analysis-pipeline
  and anchor regression subset passed again: **36 passed**, zero failed/skipped
  (`.local/target-anchors-regressions-final.log`). This includes changing the legacy display
  state to pending and verifying that it cannot bypass the server rejection marker.
- Full worker suite: **135 passed**, one existing Starlette dependency deprecation warning
  (`.local/target-anchors-python-final.log`). Includes 21 synthetic CLI subprocess cases.
- TypeScript, Functions build, repository ESLint and scoped new-code/script lint pass.
- Final local iOS Metro/Hermes export passed (`.local/target-anchors-ios-export-verified`),
  bundle `index-ea63f3efa34edfb35b80f0206f9b1fd3.hbc`, 14,046,385 bytes.
  It is not Xcode compilation, native device launch, signing or TestFlight validation.
- Browser regression run: **26 existing journeys passed**, one intentional marketing-capture
  skip. Its new target case exposed a web pointer-event issue, subsequently fixed.
- Corrected target workflow: **2 passed**, desktop and mobile, zero retries/skips
  (`.local/target-anchors-e2e-target-final.log`). Includes actual two-corner clicks,
  reset/manual coordinates, server save, reload with saved bounds, removal, and zero
  captured page errors. The entire 28-case browser run was not repeated after that
  isolated editor fix; the corrected workflow was rerun on both viewports.
- Desktop/mobile panel screenshots were reviewed under `.local/target-anchor-web-*.png`.
  They contain synthetic test imagery and development overlays, not public marketing assets.
  Historical pre-foundation checks in `intelligence-v2-delivery.md` are not new checks.

Independent scoped review found stale-confirmation, withdrawn-consent and correction-revision
races; they were fixed and covered by emulator regressions. A follow-up rejected-identity
reconfirmation case was also fixed and covered. This is not a comprehensive security audit.

The browser tests exposed and resolved fullscreen overflow and an incompatible web image
load-event assumption. The editor now gets source dimensions through `Image.getSize` with
URI/mount guards, rather than assuming native and web load events carry identical metadata.
Pointer selection uses normalized press-in coordinates instead of treating web MouseEvents
as native press events. Image callbacks are stable to avoid reloading during field edits.
Emulator cold-start waits are bounded; no forced click or automatic retry was used to pass
the final target workflows. Real native-device interaction remains unvalidated.
All test emulator processes completed and their temporary secret file was removed.

## Next Stage

Create independent private annotations, implement a source/PTS/hash-verified evidence
adapter, and evaluate manually anchored identity on held-out difficult slices. Only then
add and calibrate appearance-based temporal association and recovery. Match clocks,
pitch calibration, video heatmaps, optical physical metrics and production GPU deployment
remain separate milestones. Real footage evaluation and owner/security/privacy approval
are required before lifting any production gate.

Firebase CLI database inspection failed because its local credentials have expired.
Local tests use a Standard-edition demo emulator, not a production database. Reauthenticate
the CLI before later deployment/console verification; no remote database was provisioned
or silently substituted during this work.
