# PitchProof Next Era Delivery

Date: 2026-10-23. Local implementation and controlled-test handoff, not public-release approval. No deployment, App Store submission, remote build, push, production backend mutation or subscription change was performed during this redesign. Existing unrelated release/legal work was retained.

## Design And Architecture

The existing Expo 57, React Native 0.86.3, React 19.2.3, React Navigation 7, NativeWind 4, strict TypeScript, Firebase and RevenueCat architecture remains in place. No dependency versions, collection contracts, registered identifiers or state-management architecture were migrated. The shield remains authoritative; `com.scoutx.app`, slug `scoutx`, and disabled iPad support are preserved.

Shared changes cover light/dark semantic colors, compact radii, zero letter spacing, neutral panel framing, form focus/contrast, 44px small actions, stable bottom navigation, segmented controls, reduced-motion handling, and unframed auth forms. The source audit is in NEXT_ERA_AUDIT.md; tokens and usage are in PITCHPROOF_BRAND_SYSTEM.md.

## Substantially Updated Surfaces

- Player: Home/Today priorities, identity header, quick statistics, match-history placement, statistics summaries, development dashboard, media library, analysis preview/report, explicit Back action instead of misleading report Retry.
- Passport: public identity header, provenance, unframed profile facts, wrapping report/block controls, removal of redundant nested scrolling, localized unavailable/load fallbacks, identity field sections and profile editor.
- Forms: match log/reflection, development goal/training, analysis entry, constrained privacy-center content. Fields, callbacks, consent decisions, source associations and private reflections remain unchanged.
- Scout: dashboard, discovery/search/filters/cards, player details/report hero, comparison, recruitment list/board/cards, reports and trial inboxes, request center and fulfillment, player trial responses.
- Supporting: welcome, login, registration, role selection, password recovery/action screens, settings/appearance/language/password/provider-link sections, Career Replay, Football Memory, all GPS components, youth and legal gates.
- Exports: Passport and Career Replay share cards now use explicit fixed dark semantic colors so light-mode theme resolution cannot make export text unreadable. Names/narrative have bounded layout; no invented statistics were added.
- Web uploads: a platform-specific local-video thumbnail service extracts a genuine bounded JPEG frame, cleans up its decoder and rejects remote sources. Local media CSP permits decoding selected files; picker durations are normalized correctly for web seconds versus native milliseconds. The native thumbnail implementation remains unchanged. The upload acceptance test now saves metadata and verifies ready/private records and a nonzero duration instead of passing when a picker merely closes.

This is not a claim that every custom modal has received an independent native-device redesign review. Unlisted screens inherit shared primitives; the audit records custom-shell and modal risks requiring continued device QA.

## Website Inventory

Seven static routes: `/welcome/`, `/features/`, `/players/`, `/scouts/`, `/about/`, `/faq/`, `/contact/`. The campaign includes a subject-led full-bleed football hero, player/scout entry paths, Passport narrative, actual app previews, recorded-development/media context, scout workflow, safety/privacy controls and final role-specific actions. Supporting routes cover feature detail, audience journeys, company/product context, FAQ and actual support/report contacts.

Navigation works without JavaScript; progressive enhancement handles compact menus, Escape/focus return and linked FAQ disclosure. Initial HTML contains canonical/Open Graph/Twitter metadata. Sitemap and robots exclusions were added. App Store availability stays unreleased/coming soon. English marketing is implemented; a complete German website translation is not claimed.

Local preview: `http://127.0.0.1:8174/welcome/`. Start with `node scripts/preview-site.mjs`; bind is localhost-only. Campaign contact sheet is `marketing/contact-sheet.png`; open `marketing/preview.html` directly.

## Legal And Trust

`scripts/build-legal.mjs` presentation was restyled and all 21 generated pages rebuilt. Graphite/emerald/lime, restrained geometry, readable fixed-breakpoint type, focus/reduced-motion/print behavior replace decorative warm gradients. Guardian/report pages received CSS-only changes. Canonical policy texts, current IDs, versions, effective dates, consent requirements and legal logic were not changed by this design pass. Earlier draft policies remain visibly under legal review; styling is not legal approval.

## Asset Inventory And Authenticity

See ASSET_MANIFEST.md and machine manifests for individual files/hashes. Ten campaign exports include independent 3840x1646 header and 3840x2560 search PNGs, six feature/CTA WebP banners, 1200x630 OG and 1080x1080 social art. The original generated master is preserved. It depicts an anonymous adult in plain kit, not a real customer/player endorsement. Larger outputs upscale the original 1672x941 image; they are not native-detail 3840-pixel photographs.

Website hero is 1672x941 WebP (179,670 bytes); a separate 780x1040 right-focused mobile crop is approximately 83KB. Responsive picture sources select the mobile asset. Product previews are genuine updated Expo-web renders at 390x844 using isolated `demo-scoutx` emulator adult fixtures. Routes: Home, public Passport, statistics, media library, discovery, pipeline and trials. Empty media/pipeline/trials are deliberately honest, not fabricated populated accounts. Caption: “Expo web preview · demonstration data”.

`public/welcome/img/next-era/capture-manifest.json` records capture time, source-tree SHA-256, build/environment, fixture, locale/theme, dimensions and routes. No private notes, real minors or actual player footage are used. Native iOS final screenshots/videos are pending on Windows. Concrete en/de framing plans and a provenance-gated composer exist, rejecting web inputs, missing metadata and wrong native dimensions. Duo layouts require genuine native validation; iPad assets are not applicable. No placeholder native finals were created.

## Verification

- TypeScript and ESLint: final handoff runs passed; logs are `.local/next-era-typecheck-handoff.log` and `.local/next-era-lint-handoff.log`.
- Unit tests: 531 passed, including locale parity and three new theme contrast/radius checks. Key light/dark text/action pairs exceed 4.5:1; this does not certify every composited surface.
- Full release gate: 232 Firestore/Storage emulator tests passed; 24 gate checks passed, zero code blockers. Public release remains blocked by 4 external-configuration, 3 legal-review and 3 not-validated items. No gate was weakened.
- Static website/legal/video E2E: 30 passed, zero skips; route/link/anchor integrity, metadata, image decoding, keyboard, no-JS, reduced motion, mobile/desktop overflow, hero framing, genuine local thumbnail decoding, remote-source rejection and platform duration normalization. Log: `.local/next-era-static-final.log`.
- Authenticated emulator journeys: all 26 passed with retries disabled in the final run (10.4 minutes). Coverage includes registration, match/goal/Passport updates, saved ready/private video upload, legal reading, youth approval/deletion, reporting, privacy/export, plan allowances, scout discovery/pipeline/evidence/trials, genuine web capture and narrow/tablet states. Log: `.local/next-era-e2e-final-pass.log`.
- Capture: corrected waits exclude prior skeleton/loading captures; actual PNG pixels were inspected. Seven fresh captures passed, recorded at `2026-10-23T11:52:06.184Z`, with source SHA-256 `285179c1105b609a33e513d0b5708bd446ea9315ffa8a6b309a3cf057b1c6d5b` in the capture manifest.
- Campaign compose/validate/preview and path guards passed. Native plan: four dimension families and 16 rejection guards passed. Native composition refuses missing genuine captures instead of producing fake finals.
- Local iOS JavaScript/Hermes export passed (13,850,643-byte final bundle). This is not Xcode compilation, native launch, signing verification, or a newly submitted TestFlight build.
- Git whitespace check passed after CRLF-only normalization of 15 changed source files.

Historical failed capture attempts are not hidden: password selector ambiguity, incorrect performance ready text, and stale media empty-state copy were fixed. Screenshots showing developer overlays, skeletons or a loading spinner were rejected and recaptured. A first unit run had one failure; a full rerun passed 528 existing tests, then the expanded 531-test suite passed. These observations are not evidence of zero possible runtime defects.

## Commands

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run release:gate
npm run legal:build
npm run legal:check
$env:PLAYWRIGHT_BROWSERS_PATH='C:\Users\masap\AppData\Local\ms-playwright'
$env:PLAYWRIGHT_SKIP_WEBSERVER='1'
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8174'
npx playwright test e2e/marketing-site.spec.ts e2e/legal-pages.spec.ts e2e/video-thumbnail.spec.ts --project=web-desktop --project=web-mobile
npm run marketing:assets
npm run marketing:capture
npm run marketing:test
npm run marketing:native:plan
npx expo export --platform ios --output-dir .local/next-era-ios-export
```

`release:gate` includes `npm run test:rules` and returns nonzero for the intentionally open public-release blockers. Emulator journeys use `npm run test:e2e:emulators`, with `MARKETING_CAPTURE=1` and `EXPO_PUBLIC_CAPTURE_MODE=1` only for local capture runs. The latter is rejected by the production-build policy. Asset rendering uses existing bundled Sharp; outside Codex set `MARKETING_NODE_MODULES` to a compatible existing installation. Nothing installs/upgrades silently.

## Accessibility And Performance Limits

Reviewed actual web pixels for dark Home/Passport/statistics/media/discovery/pipeline/trials, website desktop/mobile and legal mobile. Source changes improve wrapping, bounded names, switch semantics, neutral focus and reduced motion. Narrow German/light/offline and tablet-web acceptance checks passed; the 320px German navigation was also visually inspected after the two-line label correction. Native VoiceOver, Dynamic Type, keyboard avoidance, iPhone device widths, permissions, location accuracy/battery, media playback and purchase/provider flows remain physical-device work. No native performance or Lighthouse benchmark is claimed. Recorded image/bundle sizes are artifact measurements, not load-time or frame-rate benchmarks.

## Remaining External Actions

1. Review the redesigned development build on actual small/large iPhones in light/dark, large text, VoiceOver and all supported locales. Test keyboards, permission denial/recovery, media lifecycle, pause/resume and foreground GPS battery use.
2. Capture genuine native iOS screenshots/recordings with isolated adult demonstration fixtures and documented build/device provenance. Run the native composer and review exact App Store crops. Do not upload website previews as iOS screenshots or claim Duo/iPad optimization without testing.
3. Complete the existing release-gate console/device items: provider/App Attest configuration, backup verification, real-device/provider/purchase evaluation and approved capability claims. Existing documentation remains authoritative; no remote setup was changed here.
4. Obtain owner/counsel approval for draft policies, launch countries, email provider, processor/transfer and retention decisions. Confirm support delivery and youth consent operations before public launch.
5. Obtain explicit authorization before deploying the website, creating a new EAS production build, submitting creative, or uploading to App Store Connect. Prior TestFlight artifacts do not contain this redesign automatically.

Next stage: controlled native-device acceptance and truthful native creative capture, followed by a separately authorized release preparation pass. Public release is not approved by this delivery.

## Final Run Addendum

Final local results: TypeScript and ESLint passed; 531 unit tests passed with no failures/skips; all 26 authenticated emulator journeys passed with no retries; all 30 desktop/mobile website, legal and video tests passed. Legal generated content is current. Campaign validation passed for 10 exports; path guards and all 16 native-input rejection guards passed. Git whitespace validation passed. Local iOS Hermes export succeeded; no Xcode/native-device verification is implied.

The final upload selector was scoped to the active dialog after a hidden background title caused the previous assertion to fail. The saved-record checks were retained, not weakened. The earlier real web thumbnail/CSP/duration defects were fixed and exercised by the final passing tests. Seven refreshed web screenshots retain explicit demonstration labels and provenance. Local preview returned HTTP 200 at handoff.

The full release gate remains 24 passing checks, zero code blockers, and 10 open external/legal/validation items, with 232 passing rules tests. This is a completed local implementation handoff, not unconditional public-release approval. Genuine native screenshots/videos, physical-device acceptance, counsel/owner approvals and authorized release operations remain outstanding.
