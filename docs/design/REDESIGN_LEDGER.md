# PitchProof UI/UX overhaul — implementation ledger

Branch `redesign/pitchproof-ux-overhaul`, cut from `release/pitchproof-5-3-candidate` @ `01f9459c2608bc939c96f5c7388b5e5ba98aac2d`.
The 5.3 candidate and the GPU baseline `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` are untouched.
Analysis thresholds, identity defaults, rules, functions and the CV worker are not changed by this branch.

**Status: IN PROGRESS — tranche 1 of the overhaul. Not complete. Do not merge into the release branch yet.**

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

## 4. Screen status

| Screen / surface | Status | Evidence |
|---|---|---|
| Design tokens, primitives, tab bars, segmented controls | Done (propagates app-wide) | web light + dark |
| Player Home (Today / Passport) | Done | `redesign-2026-11/after-player-home-light-dark-web.png` |
| Owner profile hero, Home identity strip | Done | same |
| Discovery card + Discover header (player and scout) | Done | `after-scout-web.png` |
| Passport evidence rows (squeezed text fixed) | Done | web |
| Next-step card, review hero, analysis report hero | Restyled only | web |
| Performance, Media, Settings, Log match, auth screens | Inherit tokens/primitives only; **not individually redesigned** | web captures reviewed for breakage only |
| Scout dashboard, pipeline, trials, player detail, comparison | Inherit tokens/primitives only; **not individually redesigned** | dashboard/discover reviewed; detail/pipeline/trials not reviewed |
| Public Passport hero | Identity on `PitchSurface` with position pitch; guest public-Passport flow tests pass; **not visually reviewed** | e2e only |
| Share card, CV/PDF export | Share the redesigned identity panel; **exports not reviewed** | none |
| Analysis report / match review layering | **Not started** (hero restyle only) | none |
| Welcome / onboarding / role selection | **Not started** | none |
| Empty, error, offline, restricted states per screen | **Not audited** | none |

## 5. Verification so far

- `npm run test:unit`: 746/746 pass (baseline on this tip before changes: 740/740).
- `tsc`: clean except the pre-existing `scripts/review-preview/.generated/reports.json` missing-file error.
- `npm run lint`: 2 pre-existing quote errors in `footballCvExportService.ts` (untouched).
- E2E flows: see section 7.
- Rendered review: player tabs light + dark at 390 px, scout dashboard + Discover light.

## 6. Remaining work (next actions, in order)

1. Visually review the public Passport; verify share card and CV/PDF export render (no clipping, portrait, links).
2. Find out why the Playwright runner crashes the page on a full reload in the cloud container (see section 7).
3. Scout player detail header and pipeline/saved card variant from the same card family.
4. Analysis report: summary → strengths → priorities → evidence → next objective layering, keeping every gate and safeguard.
5. Welcome/onboarding/role selection; Performance and Media tab layouts; Settings grouping.
6. State audit per screen (loading, empty, partial, offline, error, denied, entitlement, long text, missing image).
7. Small phone (360 px), large text, German long-label pass; then native/device validation, which this workspace cannot do.
8. Renew release evidence: every 5.3 screenshot, marketing capture and device result predates this design.

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
