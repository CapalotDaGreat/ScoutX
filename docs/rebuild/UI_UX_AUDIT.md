# UI/UX Audit — PitchProof 2.0 Phase 0

> Evidence-based baseline from the live repository. No UI code changed during Phase 0.

## Current strengths

- A shared component layer exists under `src/components`.
- Theme tokens and light/dark navigation themes already exist.
- The product has separate player, scout, guest, and auth shells.
- Existing domains cover the major football identity, media, discovery, recruitment, and career workflows.
- The visual language already has a warm paper, charcoal, emerald, and restrained gold direction.

## Current experience risks

| Area | Finding | V2 direction |
|---|---|---|
| Player home | Current Home is a profile hub rather than a daily decision surface. | Split Today from Passport and prioritize next actions. |
| Navigation | Player Growth is implemented through a route named `Performance`; scout activity is not a primary tab. | Validate route naming and tab hierarchy before changing routes. |
| Onboarding | Existing onboarding is checklist-oriented and distributed through the profile experience. | Replace with progressive, resumable onboarding. |
| Profile | Public portfolio, profile hub, and share surfaces overlap conceptually. | Establish Passport as the canonical player identity surface. |
| Match entry | Match logging is modal-driven and supports more data than a fast capture flow should require. | Provide Quick Match and Detailed Match paths with draft recovery. |
| Discovery | Search/filter surfaces are feature-rich but client-side filtering remains difficult to scan. | Improve ranking, saved searches, empty states, and card hierarchy without claiming full-text search. |
| Feedback | Loading, offline, permission, and retry states are not yet a documented system across every domain. | Define state patterns in the design-system phase. |
| Trust | Verification, endorsements, self-reported facts, and AI output need stronger visual distinction. | Use explicit provenance labels. |
| Localization | Seven locale trees exist, but redesign work can easily introduce hardcoded strings or overflow. | Treat i18n keys and long translations as acceptance criteria. |
| Accessibility | No evidence of a complete screen-by-screen accessibility audit. | Add labels, dynamic type checks, contrast checks, focus behavior, and reduced-motion behavior. |

## Design system observations

- `src/theme/tokens/colors.ts` contains a coherent semantic palette for light and dark modes.
- NativeWind is present, but the architecture audit records CSS-variable failures in modal and bottom-sheet trees. This is a platform concern for the design-system phase.
- Existing SVG charts should be retained until their maintenance and accessibility costs are measured.
- The redesign should use stable dimensions for cards, controls, charts, and navigation so data changes do not cause layout shift.

## UX decisions deferred until after SDK migration

1. Confirm native module behavior and modal rendering on SDK 57.
2. Inventory screens and component states before changing navigation contracts.
3. Establish design tokens and state primitives before rebuilding individual features.
4. Test light and dark themes on native and web before broad screen work.

## Phase 0 conclusion

The product needs a substantial information-architecture and interaction redesign, but the existing visual and feature foundations are reusable. The correct sequence is SDK compatibility first, then state/design-system foundations, then navigation and feature redesign.
