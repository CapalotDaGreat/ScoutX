# Analysis data schema and player-report structure (proposal, 2026-11-17)

Status: **proposal for review**. Nothing here changes the app, the server or production defaults. It is inspired by
kloppy (BSD-3-Clause) and mplsoccer (MIT); neither library is added (`github-rights-inventory-2026-11-17.md`).

## 1. Why
The engine output today mixes three layers in one report: the selected player's **observed boxes**, the
**identity decision** for each moment, and **derived football metrics**. Coaching code (`coach.ts`) and the
server (`trackingV3.ts`) each re-derive "is this second usable?". Clip-level coaching needed a server fix
(section 18 of the experiment ledger) because the 1-second strip and the 2 Hz timeline disagreed. A single explicit
schema removes that class of bug.

## 2. Layers (kloppy-style separation)
| Layer | Unit | Fields | Source of truth |
|---|---|---|---|
| `recording` | one upload | id, durationSec, fps, decoder, sourceHash, periods[] (start, end, attackingDirection or `unknown`) | worker |
| `observation` | one sample (2 Hz upload today) | t, box (image px), pitchXY or null, pitchConfidence, visibility (`visible` / `occluded` / `off_frame`) | tracker |
| `identity` | one sample | state (CONFIRMED / LIKELY / AMBIGUOUS / UNKNOWN), evidence[] (kind: jersey_read / colour_number / owner_tap / continuity, with time and provenance), conflicts[] | identity engine |
| `segment` | maximal run of one state | start, end, state, minState, evidenceCount, ownerAssisted (bool) | derived on the server from `identity` only |
| `metric` | one value | name, value, unit, coverageSec (CONFIRMED seconds used), method version, `measurable` flag | analysis |
| `event` (later) | one action | type, t, provenance; **empty until a validated event model exists** | not produced |

Rules:
- Coordinates are named: `image_px` versus `pitch_m` (105 × 68, origin at the bottom-left of the attacking direction). Never mixed in one field.
- Every derived metric carries `coverageSec`, so a report can say "based on 4 min 10 s of confirmed play".
- Owner-assisted seconds remain marked (`ownerAssisted`) through to the report and are counted separately.
- Conflicting evidence is kept, never overwritten (adjacent duplicate reads count once; see the temporal consolidation rule in the ledger).

## 3. Player report structure (mplsoccer principles, honest by construction)
1. **Coverage first**: confirmed / likely / not identified minutes as a single bar, owner-assisted share shown.
2. **Positioning map only from CONFIRMED samples with pitch coordinates**, drawn as points or a coarse 3 × 3
   zone grid with counts. No smoothed heatmap below about 10 confirmed minutes (a KDE invents density).
3. **No radar charts**: there is no peer distribution to normalise against, so percentiles would be fabricated.
4. **Clip observations** (CLIP-EXP-1): at least 6 s CONFIRMED on every frame, template text with measured values only.
5. Each statement links to its evidence (time range) so the player can watch it.
6. "Not measurable" is a first-class result with a reason (e.g. *identity not confirmed throughout*).

## 4. Migration sketch (not started)
1. Add `segments[]` to the worker report alongside the current fields (additive, versioned).
2. Make `trackingV3.ts` read segments when present; keep the strip parser as a fallback.
3. Move `coach.ts` gates to consume `coverageSec` instead of recounting.
Each step needs its own review; none is promoted by this document.
