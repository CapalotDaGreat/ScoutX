# PitchProof Next Era Asset Manifest

## Authoritative inventory

`marketing/app-store/manifests/assets.json` is the machine-readable inventory. Each export records placement, device class, language, pixel dimensions, source-screen/capture nullability, composition commit, SHA-256, generation method and review status. `marketing/contact-sheet.png` and `marketing/preview.html` provide visual review. Rebuild commands and runtime fallback are documented in `marketing/README.md`.

## Sources and rights

- `marketing/source-assets/generated-football-master.png`: original football illustration generated with `image_gen` during this redesign, originally `exec-d7b1707f-1b79-42e5-a3da-9d6a2c5b1440.png`, 1672 x 941. Prompt specified an anonymous adult aged 25+, plain forest-green kit without brands, a ball and clear pitch markings, a modest community stadium at blue hour, the player in the right third and open space on the left. No real player likeness, minors, endorsements or achievements were requested. Not documentary photography or a product capture. Owner distribution review remains required.
- `assets/icon.png`: existing authoritative PitchProof shield, 1024 x 1024. Copied unchanged to `marketing/brand/pitchproof-icon.png`. Existing repository brand asset, not replaced or redrawn.
- Typography: existing Inter TTF assets from `@expo-google-fonts/inter`, upstream SIL Open Font License. Fonts are not copied into the export package. No proprietary reference-brand fonts or imagery are imported.

## Real exports

- `marketing/app-store/headers/pitchproof-header.png`: 3840 x 1646, independent wide composition.
- `marketing/app-store/search-results/pitchproof-search.png`: 3840 x 2560, independent stacked composition, not a header crop.
- `marketing/website/passport.webp`: 1920 x 1080, Football Passport campaign.
- `marketing/website/development.webp`: 1920 x 1080, match records and development campaign.
- `marketing/website/media-analysis.webp`: 1920 x 1080, media/evidence campaign; no automated tracking claim.
- `marketing/website/scout-discovery.webp`: 1920 x 1080, opted-in discovery campaign.
- `marketing/website/players-scouts.webp`: 1920 x 1080, player/scout dual-role campaign.
- `marketing/website/campaign-cta.webp`: 1920 x 1080, closing campaign artwork.
- `marketing/social/open-graph.png`: 1200 x 630.
- `marketing/social/campaign-square.png`: 1080 x 1080.

All listed exports are illustrative campaign derivatives of the single preserved generated source, with real official shield and accurate PitchProof copy. None contain invented product screens, performance data or scouting outcomes. They are exported, pending owner review; not accepted App Store assets. Text-bearing campaign compositions are not substitutes for text-free responsive website backgrounds. The 1672 x 941 illustration is resampled for larger exports, not regenerated at native 3840-pixel detail. Owner review at full resolution remains necessary.

## Executed Checks

`node scripts/marketing-compose.mjs --source <supplied absolute PNG>` produced all 10 exports using bundled Sharp 0.35.5/libvips 8.18.7. `node scripts/marketing-validate.mjs` passed all 10 exports. `node scripts/marketing-test.mjs` passed strict input guard cases. `node scripts/marketing-preview.mjs` produced the contact sheet and HTML review. The contact sheet was visually inspected for shield rendering, text clipping, readable hierarchy and distinct header/search framing. No native/device or App Store account acceptance test was run.

## Pending or Separate Deliverables

Website derivatives are reproducible with `scripts/marketing-web-assets.mjs`: `public/welcome/img/next-era/football-hero.webp` (1672x941), `football-hero-mobile.webp` (780x1040, independently right-focused crop), and `open-graph.png` (1200x630). All inherit the generated-master provenance above.

Seven genuine Expo-web screenshots live beside them: `today.png`, `passport.png`, `performance.png`, `media.png`, `discovery.png`, `pipeline.png`, `trials.png`, each 390x844, English/dark, local adult demonstration data. `capture-manifest.json` records routes, capture time, source-tree hash and emulator environment. They were captured from the updated application, inspected for loading/developer overlays and recaptured where needed. They are website previews, **not native App Store finals**. No fictional populated trial/media states are substituted for real empty accounts.

Native iPhone screenshots and app-preview videos are pending: unavailable native iOS capture on Windows. No HTML, web or generated UI is mislabeled as native final artwork. iPhone Duo captures/layout testing are pending; iPad is not applicable while `ios.supportsTablet` remains false. Native capture metadata is deliberately null in campaign records. The parent's website screenshot pipeline writes separately to `public/welcome/img/next-era`; those are web review evidence only and not inputs required by campaign composition.

Concrete native templates now exist in `marketing/app-store/native-plan.json`: 10 English/German stories, primary 1179 x 2556 / 1206 x 2622 and optional Duo outer 1398 x 2034 / inner 2007 x 2853. `scripts/marketing-native-compose.mjs --validate-plan` checks templates and rejection guards without creating placeholder finals. The default invocation exits nonzero with pending native status. Supplying `--manifest marketing/app-store/native/captures.json` composes only genuine supplied raw captures with complete `ios-native` provenance, actual device/build/locale/method/commit, exact native dimensions and matching source hashes. Full-screen captures are contained below localized headings without cropping or stretching. Every input is preflighted before image export. Existing shared `safePath` rejects symlink/junction escape paths; raw web capture paths are forbidden. Metadata attestations cannot independently establish authenticity, consent or environment isolation.

Native composed exports, when genuine inputs become available, have a separate `marketing/app-store/native/composed-manifest.json` with retained capture provenance, source/export hashes and plan hash. No such finals or capture claims are created merely by validating the plan. Native template and guard verification is not native-device visual QA. Exact commands and the required input record shape are in `marketing/README.md` and the plan's schema guide.

## Validation Scope

The validator checks each required export against expected dimensions and format, prohibits alpha channels, confirms nonblank pixel variation, checks source/export hashes and refuses unsafe output paths. The preview produces a contact sheet and locally viewable review page. Technical validation does not verify Apple account configuration, creative eligibility, editorial acceptance or native authenticity.

Official Apple references read 2026-10-23:

- [Creative asset specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications): header 3840 x 1646 PNG/JPEG and search 3:2 up to 3840 x 2560; alpha channels prohibited.
- [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications): accepted device-specific screenshot dimensions; use native captures before claiming completion.
