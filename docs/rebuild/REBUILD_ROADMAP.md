# Rebuild Roadmap — ScoutX 2.0 Phase 0

## Delivery principle

Work in small, validated phases. Preserve existing product capability unless a documented classification says it is merged, replaced, or obsolete. Keep the current feature-first architecture and improve its boundaries incrementally.

## Phase sequence

| Phase | Outcome | Exit gate |
|---|---|---|
| 0. Audit | Architecture, features, UI, dependencies, security, performance, and migration risks documented. | Audit set exists and active worktree changes are preserved. |
| 1. SDK 57 | Existing app builds and runs on the SDK 57 baseline. **Complete.** | Expo Doctor 21/21, typecheck, lint, Functions build, and 8/8 web smoke tests pass. Native development-client validation remains device/build-specific. |
| 2. Architecture cleanup | Shared server-state, discovery pagination, and connectivity foundations added. **In progress.** | No duplicate abstraction added without ownership decision; smoke tests cover critical routing. |
| 3. Design system 2.0 | Tokens, primitives, states, typography, motion, and accessibility conventions unified. | Light/dark and locale stress checks pass. |
| 4. Navigation | Player/scout IA is validated and route contracts are stable. | Deep links, role routing, back behavior, and guest access pass. |
| 5. Auth/onboarding | Progressive, resumable onboarding and clearer role/privacy setup. | New and returning users can recover from interruption. |
| 6-14. Player product | Today, Passport, match logging, Growth, AI Coach, media, GPS, timeline, replay, achievements, and goals. | Each feature has loading, empty, offline, error, accessibility, and i18n coverage. |
| 15-19. Scout product | Dashboard, discovery, cards, pipeline, comparison, trials, reports, and trust. | Scout privacy and cross-role trial flow pass. |
| 20-21. Activity/offline | Useful notifications plus cached data, drafts, queued writes, and conflict handling. | No silent data loss; notification preferences are respected. |
| 22-24. Quality | Performance, accessibility/localization, and security hardening. | Measured budgets, rules tests, and release findings resolved. |
| 25. Testing | Jest/RNTL and Maestro critical journeys added; Playwright retained for web. | Player, scout, and cross-role journeys pass. |
| 26. Release | EAS, permissions, deep links, environments, stores, monitoring, and docs reviewed. | Development, preview, and production profiles are actionable. |
| 27. Polish | Product review across player, scout, coach, first-time user, and engineering perspectives. | No known broken core workflow or unowned release blocker. |

## Immediate next phase: architecture cleanup

1. Establish server-state ownership and query conventions without rewriting repositories.
2. Add shared error, offline, and retry primitives where existing workflows need them.
3. Inventory provider updates and avoid duplicate listeners before introducing caching.
4. Add targeted tests around auth routing and the most critical existing data flows.

## Phase 2 progress

Completed first slice:

- Added a shared `QueryClient` with conservative cache, retry, and focus defaults.
- Mounted `QueryClientProvider` at the app root without changing existing Context ownership.
- Migrated player discovery pagination and cache state to `useInfiniteQuery` while preserving its screen-facing hook API.
- Added Expo Network status handling to the shared `Screen` offline banner.
- Verified typecheck, lint, Expo Doctor, and all 8 web smoke tests after the provider change.

Next bounded slice:

- Migrate one read-heavy domain, starting with discovery or activity, after recording its current query/listener behavior.
- Define query keys and invalidation rules before moving additional hooks.
- Add shared user-facing error mapping and offline state primitives alongside the first migrated domain.

## Remaining implementation boundary

The following work is intentionally not marked complete because it requires additional implementation and, for native behavior, device/build evidence:

- Design system and navigation redesign: existing tokens and routes are audited, but Today, Passport, Growth, and scout dashboard redesigns are not implemented.
- Onboarding and player/scout product phases: existing functionality remains intact; progressive onboarding, goals, training log, scout notes, alerts, and share kit remain product work.
- Offline synchronization: the app now exposes connectivity state and has local fallbacks in selected repositories, but queued writes, conflict resolution, and durable draft sync are not implemented globally.
- Security: rules are documented for review, but emulator-based allow/deny tests and tightened activity, notification, GPS, and scout-note boundaries remain required.
- Testing: Playwright web smoke coverage exists; Jest/RNTL and Maestro critical journeys remain to be added.
- Native release: development-client builds, iOS/Android runtime flows, push notifications, media, GPS, App Check, and store configuration remain device/build validation work.

## Explicit non-goals for Phase 1

- No broad UI redesign.
- No route rename or navigation rewrite.
- No Firestore schema rewrite.
- No new feature bundle.
- No deletion of existing product domains.

## Risk register

- Native dependency incompatibility under New Architecture.
- Firebase/App Check dual-client initialization.
- Media and location regressions that Expo Go cannot reveal.
- Existing active discovery changes in the worktree.
- Overly broad Firestore rules exposed by new UI surfaces.
- Migration work expanding into unrelated architecture refactors.
