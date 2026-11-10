# PitchProof UI/UX overhaul — implementation ledger

Branch `redesign/pitchproof-ux-overhaul`, cut from `release/pitchproof-5-3-candidate` @ `01f9459c2608bc939c96f5c7388b5e5ba98aac2d`.
The 5.3 candidate and the GPU baseline `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` are untouched.
Analysis thresholds, identity defaults, rules, functions and the CV worker are not changed by this branch.

**Status: IMPLEMENTED AND WEB-VERIFIED (tranche 3, 2026-11-10). Native, device and screen-reader validation NOT done; see section 9 before merging.**

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
the unit suite, and the browser flows below. The per-feature matrix is in section 8.

## 5. Verification so far

- `npm run test:unit`: 746/746 pass (baseline on this tip before changes: 740/740).
- `tsc`: clean except the pre-existing `scripts/review-preview/.generated/reports.json` missing-file error.
- `npm run lint`: 2 pre-existing quote errors in `footballCvExportService.ts` (untouched).
- E2E flows: see section 7.
- Rendered review: player tabs light + dark at 390 px, scout dashboard + Discover light.

## 6. Remaining work (cannot be done in this workspace, or deliberately left)

1. **Native and device validation**: iOS and Android builds, VoiceOver/TalkBack, Dynamic Type / font scale, safe areas, keyboard,
   haptics, native share sheet, `expo-print` PDF and `react-native-view-shot` image on a device. None of this was run. Web
   captures are not evidence for any of it.
2. **Renew release evidence**: every 5.3 screenshot, marketing capture and device result predates this design.
3. The in-app **Welcome screen** is redesigned in code but was not seen rendered: on web the `/welcome` path serves the marketing
   site, so the native first-run screen needs a device or simulator.
4. **Discover list at tablet width** still stretches (it is a `FlatList` with its own layout); other screens use a 760 px column.
5. Screens reviewed for coherence but without bespoke redesign: Settings, Privacy Center, Plan and usage, Trials, Request Center,
   Activity, Comparison, Career Replay, Media library, Reel studio, GPS, Coach mode, Admin review. They inherit the system.
6. Plan/usage, Privacy Center and a missing-report deep link were **not captured** (my capture paths were wrong and fell back to Home).
7. Translations of the seven new provenance strings (de, es, fr, it, nl, pt) are mine and **not reviewed by a native speaker**.
8. Gold tokens remain in the theme for milestone "new" states; the `prestige` card and button variants now render tonal/accent.

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

### 2026-11-10, tranche 3 (final web pass)

Unit: **755/755**. Typecheck clean. ESLint on changed files: 0 errors (the two pre-existing quote errors in
`footballCvExportService.ts` are gone because that file was rewritten).

Browser flows, web-mobile, local emulators, fresh seed, `--retries=0`:

- Full run (21 tests): **20 passed, 1 failed** — `scout.spec.ts:88`, "Page crashed" opening a second browser context.
- Player + scout rerun after a fresh seed: **11 passed, 0 failed**.
- **Cause of the crashes is now established**: the kernel log shows the container memory cgroup killing `chrome-headless`
  (`Memory cgroup out of memory: Killed process … (chrome-headless)`). It is a limit of this workspace, not an app defect.
  No test was changed, skipped or retried. A fully green single run still needs a machine with more memory.

## 8. Feature preservation matrix (52 feature folders, diff against `01f9459`)

"Presentation" means only files under `components/` or `screens/` changed (layout, classes, icons, copy keys).
"Untouched" means no file in the folder changed; those features changed only through shared tokens and primitives.
Nothing under `src/navigation`, `functions`, `firestore.rules`, `storage.rules`, services for auth, entitlements, deletion,
uploads, analysis or identity was modified.

| Feature folder | Change | Contract check |
|---|---|---|
| auth | Presentation: Welcome on pitch surface, role option, modal padding | player register and sign-in flows pass; OAuth buttons untouched |
| player-profile, today, passport, player-onboarding | Presentation: Home split Today/Passport, hero, identity strip, evidence rows | player flows; `home-segments`; private-mode card on first screen |
| public-portfolio | Presentation + **export**: CV template moved to pure `footballCvHtml.ts`; same privacy filter | `footballCvHtml.test.ts` (refusal when not public, hidden sections not leaked, escaping, dash for unrecorded), `portfolioExportPrivacy.test.ts` |
| share-cards | Presentation: card image on pitch surface; same data object, same include flags | `portfolioExportPrivacy.test.ts`; web capture `t3-share-card-web.png` |
| scout-discovery, scout-recruitment, player-comparison | Presentation: cards, detail hero, pills, pipeline card, modal padding | scout flows (brief, discover, why, save, request, trial) |
| career-timeline | **Service**: new system entries no longer store an emoji prefix; display strips stored ones | `displayTitle.test.ts`; milestone ids, categories and triggers unchanged |
| career-milestones, career-story, football-journey | Presentation: drawn icons, year-in-review tiles | unit suite |
| development, player-statistics, ai-insights | Presentation: rows wrap, labels | unit suite |
| match-analysis, match-review | Presentation: hero restyle, modal padding. **No pipeline, gate, threshold, identity default or evidence contract touched** | review preview from recorded fixtures; release suite pin unchanged |
| reel-studio, highlight-videos, gps, football-sources | Presentation: padding, icon colour, label case | unit suite |
| activity-feed, admin-review, career-replay, club-profiles, coach-mode, data-rights, evidence, football-memory, global-search, highlight-reel-studio, intelligence, legal, media-library, media-upload, notifications, performance-insights, player-growth, portfolio-analytics, premium, request-center, scout-intelligence, scouting-reports, settings, trial-invitations, trust-safety, trust-system, verification-system, weekly-report, youth-safety | Untouched | safety, guest and visual-state flows; unit suite |

Shared changes that reach every feature: colour and radius tokens, type scale and its merge fix (4a), `Button`, `Card`,
`Badge`, `Input` (`min-w-0`), `Text`, `Heading`, `CollapsibleSection`, `Screen` (760 px readable column), tab bars.

## 9. Post-implementation audit (2026-11-10, web only)

Found and fixed in this pass:

| Finding | Fix |
|---|---|
| Ten bottom sheets and dialogs had no body padding; text and inputs touched the screen edge (pre-existing) | Padding added to each body |
| Share card and CV still used the old dark/gold look; CV printed stray separators for empty fields and an unlinked URL | Both redesigned; CV link is clickable; empty fields omitted |
| Milestones and stored timeline titles used emoji | Drawn icons; stored prefixes stripped at display |
| Seven provenance notes were hard-coded English (three had no locale key at all) | Keys added in all seven locales |
| German at 360 px: "Verstanden" clipped, stat names split mid-word, sort control truncated | Rows wrap; sort gets the row width |
| Olive "prestige" panel behind Passport evidence in dark mode | Tonal panel |
| Tablet width stretched every control edge to edge | 760 px column in `Screen` |

Checked and found sound: no route, param or deep-link change; unknown values render as a dash, not zero (card, share card,
CV, stat strips); no invented rating, potential, market value or verified status anywhere in the card family; provenance line
on every identity surface; hidden sections named as private in exports; offline banner and loading skeletons render.

Not verified (stated plainly): everything in section 6, items 1, 3 and 6; screen-reader order and labels; contrast of every
text/background pair beyond the token pairs in `themeDesign.test.ts`; behaviour with real long names and missing portraits
beyond the initials fallback seen in fixtures; error and permission-denied states, which were not triggered.
