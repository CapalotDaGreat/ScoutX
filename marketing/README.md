# PitchProof campaign assets

All campaign exports are generated illustration, not authentic player photography or native UI captures. The official shield is copied unchanged from `assets/icon.png`. No private account data, synthetic performance statistics or unsupported scouting/AI claims are composited.

## Reproduce

```powershell
node scripts/marketing-compose.mjs
node scripts/marketing-validate.mjs
node scripts/marketing-preview.mjs
node scripts/marketing-test.mjs
```

The preserved source is included under `source-assets/`. For intentional replacement, use `--source ABSOLUTE.png`. Composition does not depend on website screenshots or native captures. Existing Inter fonts are read from `node_modules/@expo-google-fonts/inter`. No dependency installation, upgrade, network request, backend access or upload occurs.

Sharp resolution: repository package first, then `MARKETING_NODE_MODULES`, otherwise the existing Codex primary runtime under the current user's `.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules`. To reproduce outside Codex, point `MARKETING_NODE_MODULES` to an existing compatible installation containing Sharp. The manifest records Sharp/libvips versions. Pixel-identical output across different renderer/font versions is not promised. Outputs and source hashes are validated.

Integrated package scripts:

- `marketing:assets`: `node scripts/marketing-compose.mjs && node scripts/marketing-web-assets.mjs && node scripts/marketing-validate.mjs && node scripts/marketing-preview.mjs`
- `marketing:compose`: `node scripts/marketing-compose.mjs`
- `marketing:validate`: `node scripts/marketing-validate.mjs`
- `marketing:preview`: `node scripts/marketing-preview.mjs`
- `marketing:test`: `node scripts/marketing-test.mjs`

Open `marketing/preview.html` directly; no server is needed. `contact-sheet.png` is a compact visual inventory. `source-assets/compositions.json` records the reproducible dimensions, layouts and English copy; the script remains authoritative. Feature banners share one supplied campaign image intentionally, rather than implying separate generated photographic sources. Keep responsive website text in HTML, not in these feature-banner images when used as backgrounds.

## Native handoff

Native screenshots and videos are pending on this Windows machine. Web captures in `public/welcome/img/next-era` belong to the website capture pipeline and must not be moved into native-final folders or labeled iOS screenshots.

Before producing native finals, establish an isolated development build with explicitly labeled demonstration data, no real minors or private media, and disabled production writes. Capture real screen interactions at an Apple-accepted device resolution. Record route, role, theme, locale, device, OS, build identifier, commit and capture method alongside every original. Verify no debug overlays and no unavailable feature claims. Keep raw captures unchanged and retain them beside any framed exports. A screenshot alone cannot prove environment isolation or data consent; those need independent review.

Primary iPhone targets: 1179 x 2556 or 1206 x 2622. Duo outer 1398 x 2034 and inner 2007 x 2853 require real layout testing; no optimized Duo claim is made. iPad remains not applicable while tablet support is disabled. App previews require genuine native recordings and a separately verified Apple-compliant encode; none are produced here.

Suggested capture story: Football Passport; match history/logging; development/reflection; journey timeline; media library; truthful available analysis state; evidence sources; opted-in discovery; shortlist/pipeline; privacy controls. Adjust each title to actual available screen behavior. German and other locale finals remain pending.

## Native Composition Templates

`app-store/native-plan.json` defines concrete English/German headlines, 10 stories, primary 1179 x 2556 and 1206 x 2622 templates, and optional Duo 1398 x 2034 outer / 2007 x 2853 inner templates. Optional formats are not a claim of tested Duo support. No placeholder final PNGs are generated.

```powershell
node scripts/marketing-native-compose.mjs --validate-plan
node scripts/marketing-native-compose.mjs
node scripts/marketing-native-compose.mjs --manifest marketing/app-store/native/captures.json
```

The first command validates the plan and rejection guards without creating images. The default command reports pending native inputs and exits 2. Composition requires a separately supplied JSON manifest shaped like `captureManifestSchema` in the plan, with its illustrative `REPLACE_...` values replaced by actual provenance. The example is a schema guide, not a valid capture claim.

Every record must identify `platform: ios-native`, device, OS version, build, locale, family, screen/route, capture timestamp, Git commit, capture method and SHA-256 of its raw PNG. Supported methods are `xcrun-simctl-io-screenshot`, `xcode-device-screenshot`, and `physical-ios-device-screenshot`. Required safety attestations are `demoDataOnly`, `productionWritesDisabled`, and `reviewedNoOverlays`, all true. Do not attest these without checking the actual capture environment. Raw files must occupy the exact path `marketing/app-store/native/raw/LOCALE/FAMILY/SCREEN.png`; public web capture paths, traversal, symlink/junction paths, wrong dimensions, missing provenance and mismatched hashes are refused. Copying a web capture into this path does not make it native: provenance remains a human responsibility, not something pixel dimensions can prove.

The full manifest is preflighted before export. The template uses an opaque charcoal canvas, a localized heading and the actual capture contained below it, preserving aspect ratio and the entire original screen. It never draws substitute UI. Outputs go to `marketing/app-store/native/final/LOCALE/FAMILY/SCREEN.png`; source metadata and hashes, export hashes and the plan hash are retained in `marketing/app-store/native/composed-manifest.json`. Raw screenshots are unchanged. These exports still require human native/content review, not automatic App Store approval. German copy is a prepared template, not proof of localized native capture.

Additional recommended package commands (parent-owned package.json):

- `marketing:native:plan`: `node scripts/marketing-native-compose.mjs --validate-plan`
- `marketing:native:compose`: `node scripts/marketing-native-compose.mjs` (pass `-- --manifest marketing/app-store/native/captures.json` through npm)

## Specification boundary

Apple creative and screenshot references were read on 2026-10-23. Header 3840 x 1646 and search 3840 x 2560 PNG exports have no alpha channels. Technical file checks do not establish editorial approval, distribution rights, account placement eligibility or App Store acceptance. All campaign files are exported and awaiting owner review, not submitted or accepted.

- https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications
- https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
