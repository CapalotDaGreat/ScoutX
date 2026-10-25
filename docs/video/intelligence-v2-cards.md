# Bounded Player Card Overhaul

## Changes

Only `src/features/scout-discovery/components/PlayerDiscoveryCard.tsx` adopts the
new reusable `src/components/player-card/PlayerCardImage.tsx` and pure
`src/components/player-card/playerCardPresentation.ts` helpers.

Each image attempt is a keyed child with its own error state. Changing the player
ID or trimmed URL remounts that child synchronously, rather than waiting for an
effect. A late error on an unmounted attempt cannot poison the current image.
Returning A -> B -> A also creates a fresh attempt. Cover and avatar attempts are
independent. Empty/failed covers show initials on the existing theme background;
empty/failed avatars show initials in a fixed circular frame. Images use cover
cropping. No assets, original shield artwork, or branding were replaced.

Navigation remains on the image/identity/evidence area with its original light
haptic and player argument. Save/compare are sibling controls, not children of the
navigation Pressable. Existing pending-save and comparison-capacity behavior is
passed through unchanged. Guest omission remains controlled by the caller.
Badges wrap in document flow; identity text has a constrained flexible column;
avatar dimensions do not shrink; evidence can wrap below form on narrow screens.
Missing names show `?`; missing club/position fields are not invented. Invalid
negative, fractional, nonfinite or unsafe evidence counts are omitted, not rounded.

No overall/potential grades, GPS metrics, AI capabilities, or new provenance claims
are introduced. Existing skill/weak-foot stars are explicitly labelled self-reported
using the existing translated provenance string.
Verification continues to use the supplied server-projected flag, not the presence
of a picture, highlights, or analysis samples.

## Integration Audit (Source Inspection, Not Runtime Proof)

- Discover: `src/features/scout-discovery/components/PlayerDiscoveryScreen.tsx`
  is the only direct consumer. It passes current player objects, pending save IDs,
  guest-mode omissions and comparison membership/capacity. List keys use player IDs.
- Navigation: `src/navigation/ScoutTabNavigator.tsx`,
  `src/navigation/ScoutRootNavigator.tsx`, `src/navigation/PlayerDiscoverTab.tsx`
  and `src/navigation/PlayerRootNavigator.tsx` route by player ID. No route changed.
- Discovery data: `src/features/scout-discovery/repositories/PlayerDiscoveryRepository.ts`,
  `src/features/scout-discovery/models/DiscoverablePlayerModel.ts`,
  `src/features/scout-discovery/services/discoverablePlayerSyncService.ts`,
  `functions/src/discoveryProjection.ts` and `firestore.rules` retain their existing
  contracts. Discoverability gates projection; clients cannot write discovery
  documents. Reads require sign-in. Card code does not fetch private profiles or
  upgrade unavailable capabilities. Projection revocation/freshness is not tested here.
- Pipeline/shortlists: `src/features/scout-recruitment/components/RecruitmentPipelineCard.tsx`
  uses a separate avatar error flag and entry callbacks; it has not adopted the helper
  and can retain stale error state. Not fixed within this scope.
- Dashboard: `src/features/scout-discovery/components/ScoutDashboardScreen.tsx`
  uses `src/features/scout-discovery/components/PlayerCarousel.tsx`, not this card.
  Carousel images lack these fallbacks and supplied overall ratings can still render.
- Comparison: `src/features/player-comparison/components/ComparisonPlayerSlot.tsx`
  owns raw avatar rendering and can show supplied overall ratings.
  `src/features/player-comparison/components/ComparisonQueueCard.tsx` is a queue
  command, not an identity card. Neither changed.
- Detail: `src/features/scout-discovery/components/PlayerDetailScreen.tsx` uses
  `src/features/scout-discovery/components/ScoutReportHero.tsx` with separate raw
  images. `src/features/scout-intelligence/components/SimilarPlayersCard.tsx`
  navigates with explicit player IDs; neither adopts the reusable image yet.
- Passport/public Passport: `src/features/public-portfolio/components/FootballPassportHero.tsx`
  uses `src/components/primitives/Avatar.tsx`, which has no error fallback.
  `src/features/public-portfolio/components/FootballPassportScoreCard.tsx` composes
  evidence/readiness with youth-safety policy. Public loading remains in
  `src/features/public-portfolio/hooks/usePublicPortfolio.ts`. No privacy changes.
  `src/features/player-profile/components/ProfileHero.tsx` similarly uses the
  primitive Avatar and a separate cover Image; neither adopts this error handling.
- Shared preview: `src/features/share-cards/components/FootballPassportShareCardView.tsx`
  renders text/statistics, not this card. Its data builder
  `src/features/share-cards/services/passportShareCardData.ts` still substitutes
  `Free agent` for missing club; broader sharing/privacy review remains outside scope.
- Match reports: `src/features/match-analysis/components/AnalysisReportScreen.tsx`
  owns report/evidence/reel interactions, not a consumer of this discovery card.
  No worker, upload, GPS, server, or report behavior is claimed as covered.
  `src/features/highlight-reel-studio/components/HighlightReelStudioModal.tsx`
  presents report-derived candidates/coverage, not this discovery card.

## Verification and Gaps

Focused Node tests: `tests/unit/playerCardPresentation.test.ts` exercises initials,
image attempt identity and strict evidence counts using production helper functions.
These are not mounted component lifecycle tests. The existing harness has no React
component renderer; no dependencies were added to create one.

Executed: `node --import ./tests/unit/support/register.mjs --test
tests/unit/playerCardPresentation.test.ts tests/unit/scoutDiscoveryHonesty.test.ts
tests/unit/starRating.test.ts` passed 16 tests. Scoped ESLint passed for the card,
new player-card directory, and new unit test. Node emitted its existing module-type
warning; no package metadata was changed.

`npx tsc --noEmit` failed on concurrent, out-of-scope GPS import localization:
`src/features/gps/components/GpsImportPanel.tsx:42` (dynamic import translation key)
and `src/i18n/resources.ts` (missing GPS import strings in non-English locales).
No card errors were reported in that run. This is not a clean repository typecheck.
`npx tsc --noEmit -p tests` also failed outside this scope at
`tests/unit/chunkedUpload.test.ts:194,197` on circular inferred types for `uploader`
and `sleep`. No test-type errors were reported for the new card tests.

No standalone `e2e/player-card.spec.ts` was added: a real discovery session requires
authentication and seeded backend data. `e2e/flows/scout.spec.ts` already exercises
seeded Discover -> detail -> save -> Pipeline flows under emulators, but was not
run for this change. No mock route or screenshot is presented as integration proof.

Parent integration update: root TypeScript and ESLint now pass after the shared
locale/upload integration fixes. The authenticated scout discovery, detail, save,
pipeline, evidence-request and trial browser flows passed in the integrated run.
This does not establish mounted image-error lifecycle or native visual coverage.

Still required: mounted A -> B -> A/error/late-error tests, real browser and native
small-screen/large-font checks, dark/light theme checks, rapid scrolling, image
cache/network recovery, assistive-technology focus and action isolation, and
authenticated privacy/revocation tests. Native visual validation was not performed.
