# PitchProof UI/UX overhaul — implementation ledger

Branch `redesign/pitchproof-ux-overhaul`, cut from `release/pitchproof-5-3-candidate` @ `01f9459c2608bc939c96f5c7388b5e5ba98aac2d`.
The 5.3 candidate and the GPU baseline `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` are untouched.
Analysis thresholds, identity defaults, rules, functions and the CV worker are not changed by this branch.

**Status: IN PROGRESS — tranche 2 of the overhaul. Not complete. Do not merge into the release branch yet.**

Evidence class for everything below: **Expo web + local Firebase emulators (demo project), seeded accounts**.
No native, device, VoiceOver, Dynamic Type or TestFlight evidence exists for this branch.

## 1. Research (accessed 2026-11-10; earlier research in `docs/release/scout-product-research-2026-11-04.md`)

| Source | Observed / claimed | Decision |
|---|---|---|
| Football Manager 26 UI article — https://www.footballmanager.com/features/total-football-total-control-fm26s-reimagined-user-interface | Publisher's description: tiles show a snapshot, a tap opens a card with detail; home merged with inbox because the old home was underused | **Adapt**: Home > Today is the "what now" surface; detail sits one tap away. No game ratings. |
| Veo Player Profile — https://www.veo.com/product/player-profile | Product page: header (number, name, team), key info, position map on a pitch graphic, clips grouped by match, one share link. "Scout-ready" is a marketing claim | **Adopt** position-on-pitch graphic for a stated position. **Reject** link-only privacy model; PitchProof keeps field-level controls. |
| Sofascore Attribute Overview — https://www.sofascore.com/news/?p=71132 | Radial attribute graph from ratings; method not explained | **Reject** radar/ratings without evidence provenance. |
| Hudl athlete profile guide — https://www.hudl.com/support/athletes-guide-to-hudl/guides/player-profile | Sections: basic, athletic, academic, recruiting opt-in | **Adopt** opt-in visibility as an explicit profile section (already present; kept under Passport). |

## 2. Design system ("Touchline")

- **Colour**: chalk background `#F3F5F1`, white surfaces, darker emerald action `#07704F` (raised from `#087F5B` because accent on accent-muted measured 4.30:1). New identity surface `pitch` (`#0F3D2E` / dark `#12392B`) with chalk lines and one floodlight `highlight` (`#D7F36B`). The pitch surface is reserved for identity (owner hero, Home identity strip, primary tab action).
- **Type**: Inter for reading; **Barlow Condensed 600/700** (SIL OFL, `@expo-google-fonts/barlow-condensed`) for screen titles, player names and scoreboard numerals. Small text raised: body-sm 13→14, caption 12→12.5, overline 11→12 and no longer uppercase. Decorative uppercase removed from 13 labels.
- **Geometry**: radii 6/10/14/18/22 (was max 8). Pill buttons, pill badges, pill segmented controls.
- **Components**: `PitchSurface`, `PositionPitch` (+ pure `pitchSpotForPosition`), redesigned `PlayerIdentityPanel` (tone `surface|pitch`, optional position pitch, icon + text provenance), tab bar with filled active pill and round primary action, tonal `Card` variant, scoreboard stat strip.
- **Rule kept**: state is never colour-only; unknown renders as an em dash, never zero; no overall/potential ratings.
- `Button variant="prestige"` now renders as the single primary action colour (the olive button competed with green).
- Test contract updated: `tests/unit/themeDesign.test.ts` radius bound 8→22 (deliberate design change) and **new** contrast checks for pitch/highlight/accent-muted pairs. New `tests/unit/positionPitch.test.ts`.

## 3. Information architecture changes

| Area | Before | Now |
|---|---|---|
| Player Home | One long scroll: hero, next step, stats, passport score, onboarding, activity, trials, insights, sharing, sources, trust, biography | Two segments. **Today**: identity strip, next step, continue, stats strip, recent matches, activity, trials. **Passport**: owner hero, passport score/evidence, onboarding checklist, insights, public Passport (preview/share/coach/CV), sources, trust, profile details. Onboarding "finish Passport" actions switch to the Passport segment. |
| Discover header | Title + two paragraphs of caveats | Title, one-line scope, one info callout (same evidence note, still always visible) |
| Discovery card | Header strip, truncated "Insufficie…" value | Identity panel + three evidence indicators (matches, analysis samples, film); freshness on its own line; unknown = em dash |

Routes, deep links and navigator param lists are unchanged.

## 4. Screen status (after tranche 2, 2026-11-10)

"Reviewed" means I looked at a web capture from the local emulator stack (light 390 px; dark and 360 px where stated).
None of this is native or device evidence.

| Screen / surface | Status | Evidence |
|---|---|---|
| Design tokens, primitives, tab bars, segmented controls | Done | web light, dark, 360 px |
| Type scale actually applied (see 4a) | Done | unit test `classMerge.test.ts` |
| Filled buttons use one action colour (`primary` = `accent`) | Done | web |
| Collapsible sections (used on about 30 screens) match cards; 56 px header, chevron chip | Done | web |
| Player Home (Today / Passport), owner hero, identity strip | Done | `t2-dark…`, `t2-360px…` |
| Discovery card, Discover header (player and scout) | Done | same |
| Scout player detail header on `PitchSurface` with position pitch; evidence pills | Done | `t2-dark…`, `t2-360px…` |
| Pipeline card (position pill, 44 px move control) | Restyled; **not seen with a saved player** in the list view | pipeline empty state reviewed |
| Public Passport (guest route and owner preview) | Reviewed | `t2-share-public-passport…` |
| Share sheet (QR, field selection, export preview, confirm box) | Reviewed on web; **share-card image and CV/PDF output not opened** | same |
| Performance: Development, Stats, Career | Reviewed; year-in-review labels no longer split mid-word | `t2-performance-web.png` |
| Log match, analysis consent modal, Media | Reviewed | same sheets |
| Match review (verify → is this you → best moments → what to work on → next focus → reel → trend → ask) | Reviewed from recorded fixtures via `scripts/review-preview`; layering already matched the brief, **no logic, gate or threshold touched** | `t2-match-review-fixture-web.png` |
| Scout dashboard, trials, comparison, activity, settings; player settings, trials, requests, search | Reviewed for coherence and breakage; **no bespoke redesign** | captures not committed |
| Guest home, login, register, link-unavailable | Reviewed; **welcome / role selection not redesigned** | captures not committed |
| Achievement and milestone rows still use emoji glyphs | **Open** | — |
| Empty, error, offline, restricted states per screen | **Not audited** beyond the empty states seen above | — |
| Large text, German long labels, tablet, screen reader | **Not checked** in tranche 2 | — |

### 4a. Defect found and fixed: named type sizes were being dropped

`cn()` (tailwind-merge) did not know the named sizes in `tailwind.config.js` (`text-caption`, `text-body-sm`, `text-stat-lg`…).
It treated them as colours and removed them whenever a colour class followed, so any `<Text>` with a `color` prop rendered at the
inherited size. This predates the redesign (it is on the 5.3 branch too). `src/utils/cn.ts` now registers the scale; a unit test
reads the sizes from the Tailwind config so a new size cannot be forgotten. Effect: captions and small body text are now the
intended 12.5 to 14 px instead of 15 px, app-wide. Every 5.3 screenshot differs for this reason alone.

### 4b. Feature preservation (routes and contracts)

No route name, param list, deep-link path, Firestore/Functions call, entitlement check, privacy rule, analysis threshold or
identity default was changed in either tranche. Changed files are presentation components, tokens, `cn.ts`, locale strings
for three new labels, and tests. Checked by: `git diff 01f9459 -- src/navigation functions firestore.rules storage.rules` is empty,
the unit suite, and the browser flows below. A per-feature matrix with one row per
feature folder (64 folders under `src/features`) is **still to be written**.

## 5. Verification so far

- `npm run test:unit`: 746/746 pass (baseline on this tip before changes: 740/740).
- `tsc`: clean except the pre-existing `scripts/review-preview/.generated/reports.json` missing-file error.
- `npm run lint`: 2 pre-existing quote errors in `footballCvExportService.ts` (untouched).
- E2E flows: see section 7.
- Rendered review: player tabs light + dark at 390 px, scout dashboard + Discover light.

## 6. Remaining work (next actions, in order)

1. Open the generated share-card image and the Football CV PDF and check clipping, portrait and links. Do not publish a real profile.
2. Welcome / onboarding / role selection redesign; replace emoji glyphs in achievements with icons.
3. State audit per screen (loading, partial, offline, error, denied, entitlement, long text, missing image, repeated tap).
4. Large text, German long labels, tablet widths; pipeline list and board with saved players.
5. Per-feature preservation matrix (64 feature folders).
6. Post-implementation audit, then native/device validation, which this workspace cannot do.
7. Renew release evidence: every 5.3 screenshot, marketing capture and device result predates this design.
8. Page crashes in the Playwright runner (section 7) remain unexplained.

## 7. E2E result log

2026-11-10, web-mobile project, local emulators (demo-scoutx), fresh seed, `--retries=0`,
specs guest + player + safety + scout + visualStates: **19 passed, 2 failed** in the full run.

- Two regressions from the Home split were found by the first run and fixed in the app, not in the tests:
  the player's name is a heading again on Home > Today, and the under-13 private-mode card is on Today.
- `scout.spec.ts:51` selector now filters to visible text. Its `.first()` resolved to hidden Scout Dashboard copy
  ("Logged matches plus highlight film…", added 2026-11-04). Whether it also failed on the 5.3 tip was not checked.
- `scout.spec.ts:88` (trial accept): "Page crashed" on a full reload in the full run; **passed** when rerun alone.
- `visualStates.spec.ts:52` (tablet scout workspace): "Page crashed" on `goto /scout/discover` in the runner, twice.
  A standalone Playwright probe at 1024 px signed in, opened Discover, measured 0 px overflow, 0 page errors and
  reloaded the same URL successfully. Treated as an environment limit of this container (about 1.5 GB free), **not proven**.
- The scout spec depends on the player spec having logged a recent match (30-day filter); run them in order.
- Not run: footballSources, gpsImport, targetAnchors, marketingCapture flows; web-desktop project; rules tests.

### 2026-11-10, tranche 2 (after the type-scale fix, button and section restyle)

Unit: **749/749**. Typecheck and ESLint on changed files: clean.

Browser flows, web-mobile, local emulators, fresh seed, `--retries=0`:

- Full run (guest, player, safety, scout, visualStates): **20 passed, 1 failed** — `scout.spec.ts:88`, "Page crashed" on `goto /player/trials`.
- Player + scout rerun after a fresh seed: **10 passed, 1 failed** — `player.spec.ts:132`, "Page crashed" on `goto`; `scout.spec.ts:88` passed.
- Every one of the 21 tests passed in at least one of the two runs; no run was fully green. The crash moves between tests and
  always happens on a full page load of the unminified dev bundle. The preview stack itself was later killed by the container
  (exit 137, out of memory). Cause **not proven**; no test was changed, skipped or retried to hide it.
- `visualStates.spec.ts:52` (tablet), which crashed in tranche 1, passed.
- Horizontal overflow measured 0 px on every captured screen at 390 and 360 px. One real overflow found by probing element
  boxes (text inputs inside rows had no `min-w-0`) and fixed in `Input.tsx`.
