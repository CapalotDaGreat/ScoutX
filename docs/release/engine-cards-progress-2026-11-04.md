# Engine + player-card engineering progress (2026-11-04)

**Supersedes for local engineering:** prior tip `5293420` / code freeze at `3c9f983` for **product code**.  
**Product RC:** `79c00d6e8009ed68a6139cd39467afa78e8b0aa1`  
External gate evidence (App Check, counsel, device, owner SEC) remains **open** and is **not** satisfied by this commit.

**Branch:** `release/pitchproof-5-3-candidate`  
**GPU baseline:** `51d41c9…` still ancestor  
**D:** still **not** promoted (`APPEARANCE_ONLY_LIKELY` default true)  
**A/B:** still off  
**C:** still ON  
**E:** **ON** (`SCOUTX_OCR_CACHE_PROVENANCE` default `"1"`; opt out `=0`)

---

## Implemented (this tip)

### Tracking / identity
- Candidate **E** remains default ON (stale OCR cache provenance guard).
- **E4** left as strict **xfail** — one-frame confirmed claim on another player at w211 after a second crossing; no evidence-backed narrow guard found without broader solver changes. Characterisation tests still pass; desired tests remain xfailed.
- A/B/D **not** promoted.
- Owner corrections remain wired on **AnalysisReportScreen**.

### Coaching
- `assessCoachingSufficiency` + `buildStructuredCoaching` unchanged contract.
- Added **coaching scenario evaluations** (`tests/unit/coachingScenarios.test.ts`): strong / weak / mixed / sparse / missing identity / rejected identity / contradictory rejected events / coverage failure.
- Human review still required for qualitative coaching judgment quality in production; unit suite checks schema grounding and readiness gates only.

### Player cards / exports
- Share card: owner **field selection** (stats / endorsements / photo / tagline) + **export preview confirmation** before image share (`SharePortfolioSheet`).
- `PassportShareCardOptions` further restricts fields already allowed by Passport privacy; never invents zeros.
- Share card view: photo optional; Private/— for hidden stats; branded dark layout.
- `PlayerIdentityPanel` evidence captions distinguish trust-verified vs self-entered profile across discovery, Passport hero, profile hero, scout report.
- Discovery analysis sample count remains nullable.

---

## Validation (this tip)

| Suite | Result |
|---|---|
| `npm run test:unit` | **733 pass / 0 fail** |
| `npm run typecheck` | **exit 0** |
| Worker OCR provenance + E4 subset | **3 passed, 2 xfailed** (E4 desired) |
| App Check live recheck | providers **still not configured** |

---

## Gates (unchanged externals)

B-01 App Check, B-02/B-10 ops, B-03 counsel, B-04 owner SEC, B-05 device on **new** tip archive, B-11/B-14 tip build, B-12 ASC, B-13 REL-D-OFF — still require owner/external evidence. This engineering pass **invalidates** any claim that an older IPA validates the candidate.

Owner decision template: `docs/release/owner-decisions-template-5-3.md`.

---

## Approval requests (not executed)

| ID | Action |
|---|---|
| A1 | EAS iOS production build of the **frozen tip SHA** after this commit lands |
| A2 | App Check App Attest + DeviceCheck registration (console) |
| A3 | Counsel re-check: public-export field selection + privacy filter |
| A4 | Isolated Firestore restore drill (billable; never overwrite `(default)`) |

Rollback E: `SCOUTX_OCR_CACHE_PROVENANCE=0`. Rollback exports/cards: revert this tip’s share-card / identity-panel commits.
