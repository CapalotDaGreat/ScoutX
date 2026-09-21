# Performance Audit — ScoutX 2.0 Phase 0

> Baseline from repository structure and existing architecture notes. Measurements are deferred until the app runs on the SDK 57 baseline.

## Likely cost centers

| Surface | Current signal | Measurement to add |
|---|---|---|
| Discovery | Paginated Firestore results are filtered and ranked on the client. | Read count, result discard rate, filter latency, render time, and pagination behavior. |
| Firebase listeners | Multiple feature hooks/providers subscribe independently. | Listener count per shell, duplicate query signatures, unsubscribe timing. |
| Provider tree | Auth, theme, player workspace, scout workspace, recruitment, and scout flow contexts span shells. | Render counts and context update fan-out. |
| Media | Video uploads, thumbnails, image lists, and match footage are substantial assets. | Upload duration, thumbnail cost, memory, cache hit rate, list frame rate. |
| Charts | Custom SVG charts and heatmaps render data-heavy visualizations. | Commit time, frame drops, accessibility fallback behavior. |
| GPS | Location sessions can produce frequent updates and expensive persistence. | Sample frequency, write volume, battery impact, session size. |
| Navigation | Root resets and nested shells coordinate auth/deep-link state. | Startup time, auth bootstrap time, route transition latency. |
| Web | Metro web export and browser E2E coexist with native-only dependencies/stubs. | Bundle size, first render, hydration-like startup behavior, feature fallbacks. |

## Existing positive patterns

- FlashList is already selected for high-volume lists.
- Firestore pagination/indexes exist for discovery, activities, trials, and GPS.
- Mock data is intended to be gated away from production.
- Feature folders provide boundaries for targeted profiling.

## Performance risks to avoid

- Adding global listeners where a focused query or one-shot read is sufficient.
- Replacing server-side pagination with larger client fetches to support richer filters.
- Rendering video thumbnails or charts for off-screen rows.
- Persisting every GPS sample directly to Firestore.
- Introducing React Query without defining cache keys, invalidation, and listener ownership.
- Using memoization broadly without profiler evidence.

## Measurement plan

1. Establish an SDK 57 development build and capture startup/navigation timings.
2. Profile discovery with small, medium, and large demo datasets.
3. Count Firestore reads and active listeners for player and scout shells.
4. Exercise media and GPS flows on representative devices.
5. Capture React render profiles before and after architecture changes.
6. Add performance budgets to the release checklist rather than optimizing by intuition.

## Phase 0 conclusion

The largest likely wins are query/listener ownership, discovery query design, media virtualization, and GPS write strategy. No broad performance refactor should begin before baseline measurements are available.
