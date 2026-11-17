# Marketing website redesign (2026-11-17)

Branch `marketing/website-redesign-2026-11`, cut from `main` @ `32ab43f1f5c6274c5d7672b25fa4ac37163bbb7c` (which
contains the app redesign `redesign/pitchproof-ux-overhaul` @ `9dc9797`). Scope: the seven static marketing routes in
`public/` (`welcome`, `features`, `players`, `scouts`, `about`, `faq`, `contact`) and their shared `welcome/site.css`.
No app code, analysis threshold, identity safeguard, rule, function or backend authorization was changed.
**Not deployed.**

## 1. What the site may claim (checked against `docs/release/feature-inventory.md` and the analysis ledgers)

| Area | Status used on the site |
|---|---|
| Football Passport, match logging, reflection, development goals, public Passport, sharing controls | Available in the app (the app itself is not released) |
| Scout discovery, comparison, pipeline, evidence requests, trials, guardian co-approval | Available in the app |
| Reporting, blocking, export, account deletion | Available; never paywalled |
| Premium | Planned; nothing can be bought |
| Match video analysis, identity review ("Is this you?"), match review | **In development, not available**; shown only in a labelled section |
| Continuous tracking, events, pitch maps | Unavailable; tracking still being validated and switched off |
| App Store | Not yet available (every page says so) |

Removed claims: "still-frame analysis provides AI observations" (players, features, FAQ) and "Analysis trends require
at least three analyses" (features, FAQ). AI footage analysis is disabled for users, so the site no longer describes
it as a working feature.

## 2. Research (accessed 2026-11-17)

| Site | Observation | Decision |
|---|---|---|
| https://www.veo.com/ | Hero "Record, analyse, and livestream every match", Buy now + Book a call, three-step "capture, analyse, share", logo wall and testimonials | **Adopt** a three-step "how it works". **Reject** logo walls and testimonials (we have none and will not invent them). |
| https://www.tonsser.com/ | Short player-voiced hero, text-link CTAs, a waitlist for the unreleased sport, no store badges | **Adopt** an honest pre-release CTA (no fake download). |
| https://www.hudl.com/ | Organised by product pillar, dashboard-style tracking imagery, scale claims | **Reject** decorative tracking dashboards and scale claims. |
| https://www.strava.com/ | Abstract H1, concrete subhead; light base, app screens in device frames | **Adopt** a concrete H1 and real screens in simple frames. |
| https://www.playermaker.com/ | Improvement percentages with no baseline or method, stacked promotions | **Reject** unsupported metrics and urgency; **adopt** one audience entry ("I am a player / I am a scout") near the hero. |

Product inspiration only; none of these pages is evidence of tracking accuracy. Earlier app research:
`docs/design/REDESIGN_LEDGER.md` section 1.

## 3. Light or dark

I built both on the real home page with real captures, at 1440 and 390 px
(`website-2026-11/light-vs-dark-comparison.webp`):

- **Light chalk pages, with the pitch-green surface only for the hero and the closing call to action (chosen).**
- An all-dark page, tried with both light and dark app captures.

**Why light is the stronger hypothesis.**
- The redesigned app is light by default ("Touchline": chalk `#F3F5F1`, pitch `#0F3D2E` reserved for identity), so the
  site now looks like the product it shows.
- Light captures stay crisp on chalk and on the pitch hero. Dark captures dissolved into the dark pitch hero, with
  little separation.
- Long passages (scout explanations, safety, FAQ) read more easily on light.
- The football identity comes from one pitch-green surface with chalk lines, not from darkness everywhere.

This is a design judgement, not a conversion result; no user or A/B evidence exists. No theme switch.

## 4. Page structure (welcome)

1. Hero on the pitch surface. Status chip "In development · not yet on the App Store". H1 "Your football, on the
   record." One-line value. Two audience actions: "I am a player" (primary) and "I am a scout". The "no guarantee of
   trials" note. Two real phones: owner Passport and scout report.
2. Two sides, one record: player and scout cards with three concrete points each.
3. How it works for players: log the match → work on one thing → share on your terms, each with its screen.
4. For scouts: discovery with context, four honest rules, discover list and scouting report screens.
5. Match video review, labelled **In development · not available in the app yet**: confirmation first, confirmed and
   uncertain kept apart, no distance or speed without calibration; tracking switched off.
6. Safety and control (three cards and policy links).
7. Four short FAQ answers and a link to the full FAQ.
8. Closing call to action on the pitch surface; the full footer with all legal links (unchanged destinations).

Sub-pages keep their structure and copy, except the corrections in section 1. They use the new stylesheet, the new
screens and the honest caption "App screen · fictional demonstration data".

## 5. Screens and provenance (`marketing/website/app-captures-2026-11.json`)

- **App screens.**
  - Source: `scripts/website-capture.mjs` against `expo export -p web --dev` of app commit `32ab43f`
    (app source unchanged on this branch).
  - Environment: local Firebase emulators for project `demo-scoutx`, started without credentials or network.
  - Device: Chromium (Playwright 1.61.1), 390 × 844 at 2×, light theme, en-GB.
  - Fixtures: `e2e/fixtures/marketing-demo.json`, seeded by `scripts/marketing-seed.mjs` (refuses non-local hosts
    and non-demo projects). Four fictional adults on fictional "Demo" clubs; match lines are self-reported
    demonstration data. No minors, contact details, footage or production writes.
- **Match review screens.**
  - Source: `scripts/review-preview/capture.mjs`, which renders the app's match-review components with committed
    recorded worker output (`tests/fixtures/tracking40-img4809-*.json`). Footage images were already removed from
    these fixtures.
  - Device: 412 × 915 at 2×.
  - Shown only in the "in development" section.
- **Not native.** These are web captures. They are not iOS screenshots and must not be used as App Store evidence.
- **Assets.** 11 screens, each as 720 px and 360 px WebP (about 550 KiB in total), with `srcset` and lazy loading
  below the fold. Hero images use `fetchpriority=high`.
- **Social image.** `img/app/open-graph.png` is composed from the Passport capture; no generated art.
- **Removed.** The outdated 2026-10-23 captures, the AI-generated hero art (`img/next-era/`) and six unreferenced
  2025 JPEGs.
- **Not captured:**
  - Media: the screen shows "Analyze match video" actions that are disabled for users, so the players page section
    has no image.
  - Scout trials: no capture made.
  - Native-device views and the share card or CV output.

## 6. Implementation

- `public/welcome/site.css`, rewritten:
  - tokens from the app;
  - self-hosted Inter 400/600 and Barlow Condensed 700 (Latin subsets, 54 KB in total, SIL OFL; licences in
    `welcome/fonts/`);
  - a sticky header, pill navigation and a `details` menu that works without JS;
  - 44 px touch targets and visible focus rings (green on chalk, floodlight on pitch);
  - reduced-motion support, and no scroll animations.
- `public/welcome/index.html`, rewritten. Six sub-pages: new figures, social image and copy corrections.
- Screens stay readable on phones: one column, about 300 px wide, showing the top part of each screen, instead of
  shrinking whole screens.
- No new data collection, forms, analytics, external fonts or third-party requests. Every CTA goes to an existing
  page; there is no download button.

## 7. Verification (2026-11-17)

| Check | Result |
|---|---|
| `e2e/marketing-site.spec.ts` + `e2e/legal-pages.spec.ts`, web-desktop and web-mobile (Pixel 7), no retries | 13 passed + 13 passed |
| axe-core 4.14.1 (WCAG 2.0/2.1/2.2 A/AA + best practice), 7 pages × 1280 and 390 px, FAQ answers open | 0 violations on all 14; 1 "incomplete" on the home page (contrast over the pitch gradient, checked by hand below) |
| Contrast (computed) | body muted 6.9:1; links/action 5.6:1; hero lead 8.0:1; primary button 9.8:1; warning 7.3:1; footer small 8.1:1 |
| Horizontal overflow | 0 px on all 7 pages at 1440 and 390 px; the home page also at 320, 360, 768, 844 × 390 and 1920 |
| Hero actions inside the first screen | yes at 320 × 568, 360 × 640, 390 × 844, 844 × 390, 768 × 1024, 1280 × 720, 1920 × 1080 |
| Keyboard | skip link → brand → 7 nav links → both hero actions → …; focus ring visible on every stop |
| Network | no 4xx/5xx or failed requests on any page (desktop and mobile) |
| `eslint` (new scripts, spec), `tsc --noEmit` | clean |

**Test contract changes (deliberate).**
- The hero test now checks the new H1, the status chip, both audience links, that the actions sit inside the first
  screen and that the real screens decode. It no longer checks the photo hero.
- The preview test now checks the new caption, `img/app` sources, `srcset`, alt text and the labelled
  in-development section.
- The compact-viewport test now requires both actions without scrolling, instead of the whole hero above the fold.
  The phones now sit below the actions on narrow screens.
- No accessibility, link, metadata, sitemap, robots or no-JS check was removed.

**Evidence images:** `docs/design/website-2026-11/`. Not done: real iPhone/Android Safari checks, VoiceOver and
TalkBack, Lighthouse in a real network setting. Text scaling was checked only through narrow viewports.

## 8. Deployment (needs explicit approval; not done)

1. Review and merge `marketing/website-redesign-2026-11` into `main`.
2. From that exact commit:
   `firebase deploy --only hosting --project scoutx-230b0`.
   This deploys only `public/` (the redirect `/ → /welcome/` is unchanged).
   Optionally run `firebase hosting:channel:deploy website-2026-11 --project scoutx-230b0` first to review a preview
   URL.
3. Afterwards, check `/welcome/` and the six routes, then the social preview (re-scrape the OG image), then
   `sitemap.xml` and `robots.txt`.
4. Rollback: redeploy the previous `main` commit with the same command, or use the Hosting release history in the
   console.

## 9. Reproduce the screens

```
npx expo export -p web --dev --output-dir <dist>      # with the EXPO_PUBLIC_* emulator values from scripts/run-e2e-emulators.mjs
firebase emulators:start --only auth,firestore,storage,functions --project demo-scoutx --inspect-functions
node scripts/seed-emulators.mjs && node scripts/marketing-seed.mjs
node scripts/website-capture.mjs <outDir> --theme light --base http://127.0.0.1:<port-serving-dist>
node scripts/review-preview/capture.mjs <outDir>      # match review states
```

Run the emulators with no `HTTPS_PROXY` and no application-default credentials, so that nothing can reach
production.
