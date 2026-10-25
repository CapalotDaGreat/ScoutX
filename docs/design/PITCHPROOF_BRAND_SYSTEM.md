# PitchProof Brand System

## Direction

Evidence over hype. Campaign photography establishes the football context; product screens prioritize identity, recorded evidence and the next available action. Recruitment is a professional workspace, not a talent leaderboard. Unknown values stay unknown. User reports, external sources and automated interpretation retain distinct provenance labels.

## Architecture

The existing Expo 57 / React Native / NativeWind architecture remains authoritative. Semantic colors live in `src/theme/tokens/colors.ts`, radii in `src/theme/tokens/radii.ts`, web utility geometry/typography in `tailwind.config.js`. ThemeProvider and its CSS-variable bridge continue to provide light/dark preferences. No framework, state-management or backend migration is part of this work.

## Color

Light: background `#F6F8F7`, surface `#FFFFFF`, text `#141C1A`, secondary `#47584E`, action emerald `#087F5B`, evidence blue `#256A80`, restrained olive `#576B12`.

Dark: background `#0D1311`, surface `#151D19`, elevated `#1C2822`, text `#F3F7F4`, secondary `#BCCABF`, action emerald `#57D6A0`, evidence blue `#88C9DD`, restrained lime `#C7E56A`.

Legacy `gold` token names remain for source compatibility, but are not a mandate to decorate every border. Red is destructive/error, amber warns, blue identifies information/evidence. Meaning must also be written or represented by an accessible icon/state, never color alone.

## Typography And Geometry

Native uses the existing bundled Inter family, not downloaded proprietary brand fonts. Website uses system sans-serif fallbacks without remote font tracking. Headings: 26/34, 21/28, 18/26; body 15/24; small body 13/20; captions 12/16. Reserve 40/48 display type for genuine hero contexts. Letter spacing is zero, numeric summaries use tabular numerals where supported. Website display sizes change at explicit breakpoints, not viewport-scaled fonts.

Panel radius: 8px maximum; fields/buttons 6px, small details 4px. Circular avatars, status dots and icon affordances may remain round. Primary actions are at least 44px high. Navigation dimensions remain stable while unread counts, labels and selected state change. Long names/translated labels wrap or shrink within flex constraints rather than covering adjacent controls.

## Components

Screen supplies safe areas, loading, empty, retry and offline states. Card is a framed item/tool, not a default page-section container. AuthCard is intentionally an unframed constrained form. Button preserves loading/disabled semantics and haptics; Input preserves theme color when caller styles are supplied. AppTabBar uses emerald selection with the existing routes and accessibility states. TabSegmentControl uses neutral framing and explicit selected state.

Use existing Lucide icons. Keep accessible names on icon-only controls and visible text for unfamiliar actions. Preserve form labels, error announcements, destructive confirmations, consent checkboxes, source labels and capability gates. Do not invent a new generic abstraction when an established primitive already expresses the interaction.

## Photography And Identity

The existing shield is authoritative; registered icons and external bundle identifiers are unchanged. Generated campaign photography represents an anonymous adult in plain kit, not a real customer endorsement. Asset manifests must identify it as generated illustration. App imagery must be actual rendered captures. Website Expo-web demonstration screenshots are not native iOS screenshots and cannot be promoted to App Store final assets.

## Motion And Accessibility

Press feedback uses opacity without changing layout. Existing reduced-motion hooks remain authoritative for animated screens and overlays. Avoid ambient SVG washes, decorative orbs and continuous motion. Never obscure consent or security information behind animation. Website content and navigation must function without JavaScript, with keyboard focus, skip navigation, reduced-motion handling and no autoplay audio.

Visual QA includes narrow phones, desktop, light/dark, long German labels, empty/populated accounts and privacy-restricted states. Real VoiceOver, Dynamic Type, keyboard avoidance, physical GPS and native permission dialogs require device validation; automated web checks are not substitutes.

## Reference Principles

Study, do not copy: [Nike Football](https://www.nike.com/football) for subject-first sports photography; [Apple](https://www.apple.com) for product hierarchy; [Linear](https://linear.app) for operational density; [Rockstar VI](https://www.rockstargames.com/VI) for campaign pacing. OneFootball was requested as inspiration but direct retrieval returned HTTP 403, so no inspection claim is made. No third-party brand artwork or fonts were imported.

## Budgets

Website hero derivative target under 250KB; first-viewport images have explicit dimensions and priority, below-fold product images load lazily. App screens should avoid decorative full-screen GPU layers and unnecessary repeated cards. These are budgets, not measured Lighthouse or native-frame-rate results. Record actual measurements and remaining gaps in NEXT_ERA_DELIVERY.md.
