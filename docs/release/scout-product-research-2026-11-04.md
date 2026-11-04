# Scout product research — 2026-11-04

**Scope:** official sites / public pages only. Distinguishes **observed** UI from **marketing claims**. No branding or layout copied.

## Sources (accessed 2026-11-04)

| Product | URL | Access |
|---|---|---|
| Hudl Wyscout | https://www.hudl.com/products/wyscout | Marketing + FAQ |
| Wyscout shortlist workflow | https://www.hudl.com/blog/discovery-to-deal-building-shortlist-wyscout | Blog (marketing) |
| Veo | https://www.veo.com/ | Marketing site (observed nav: Record, Editor, Analytics 2, Live) |
| Sofascore | https://www.sofascore.com/ | Live public UI (scores, fixtures) |
| Transfermarkt | https://www.transfermarkt.com/ | Public portal (transfers, market values, squad tables) |
| Comparison roundup | https://www.360football.ch/en/blogs/trainingsblog/wyscout-hudl-veo-matchiq-vergleich | Secondary |
| Tool roundup | https://www.scout52.com/best-football-scouting-app | Secondary |

## Observed / claimed patterns

### Hudl Wyscout (B2B library — **claims**)
- Search/query across large licensed video + event library; shortlists (“shadow teams”); reports; stat→video links.
- Youth pack and delayed rights-based delivery claimed in FAQ.
- **Not PitchProof’s product shape:** we do not operate a global match library.

### Veo (club filming — **observed marketing**)
- Camera + cloud clips/tagging/livestream; analytics as add-on.
- Primary job is **recording own matches**, not discovering external players.

### Sofascore (**observed**)
- Dense live scores / fixtures; player pages emphasize form and ratings.
- High information density; little provenance of *how* a rating was earned.

### Transfermarkt (**observed**)
- Career history, market values, transfer rumours dominate hierarchy.
- Strong for career provenance; weak for video evidence of *this* performance.

## PitchProof scout proposition (supported by existing data)

PitchProof is a **player-owned Passport + analysis** product. Scout tasks we can honestly support:

1. Understand role/context from profile + logged matches.
2. Review **evidence** (film, analysis samples, coverage) rather than unsupported ratings.
3. Find footage the player has shared.
4. Save/revisit (pipeline/watchlist where implemented).
5. Record structured notes / briefs when evidence exists.
6. Share an **authorized** assessment — never invent film or potential.

**Out of scope without new data:** Wyscout-scale discovery, potential scores, continuous tracking grades, GPS distance as match distance.

## Adopted vs rejected

| Pattern | Decision | Why |
|---|---|---|
| Evidence-first cards (matches, freshness, film) | **Adopt** | Matches our data; reduces fake precision |
| Freshness / coverage filters & chips | **Adopt** | Brief 2.0 already computes these |
| Shortlist + notes | Keep existing pipeline; no new B2B CRM | Already present; expand only with use |
| Stat→clip deep links | Keep when clip IDs exist | Do not invent clips |
| Potential / OVR filters as primary | **Reject** | Not a PitchProof signal |
| Market values / rumour feeds | **Reject** | Wrong product |
| AI “potential” or future judgment | **Reject** | Safety + honesty |
| Copying Wyscout/Sofascore layouts | **Reject** | Distinctive third-party UI |

## Implementation tied to this research (this effort)

- Discovery cards: freshness when analysis sample count unknown; coverage label.
- Dashboard copy: “recent evidence & film”, not “matching preferences / potential”.
- Brief gap codes humanized; filter chips for roles/coverage/evidence age/match count.
- Removed misleading `distanceKm` movement card (was not GPS match distance).
- Search suggestion “High potential” → “Recent evidence”.
- Comparison subtitle corrected to three players.

**Evidence:** mock/web Discover render `docs/release/evidence/scout-discover-freshness-2026-11-04.png` (not native-auth).
