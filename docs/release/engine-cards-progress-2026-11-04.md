# Engine + player-card engineering progress (2026-11-04)

**Supersedes for local engineering:** prior tip `6d1266c` / handoff freeze at `3cddd36` for **product code**.  
External gate evidence (App Check, counsel, device, owner SEC) from earlier handoffs remains **open** and is **not** satisfied by this commit.

**Branch:** `release/pitchproof-5-3-candidate`  
**GPU baseline:** `51d41c9…` still ancestor  
**D:** still **not** promoted (`APPEARANCE_ONLY_LIKELY` default true)  
**A/B:** still off  
**C:** still ON  
**E:** **promoted to default ON** (`SCOUTX_OCR_CACHE_PROVENANCE` default `"1"`; opt out `=0`)

---

## Implemented

### Tracking / identity
- Candidate **E** (OCR cache provenance) default ON — prevents stale/colliding OCR cache evidence from becoming identity after chunk re-extract; tests pin legacy off for defect characterisation; `test_default_is_provenance_on` added.
- A/B/D **not** promoted (insufficient independent / multi-match evidence for A/B; D still needs B-06).
- Owner corrections wired on **AnalysisReportScreen** via `useAnalysisCorrections` → `IdentityConfirmationCard` (parity with modal).

### Coaching
- `assessCoachingSufficiency` — blocks personalized coaching until identity confirmed and moments/events exist; gives concrete next steps instead of empty praise.
- Coaching tab shows insufficient state; notes only when ready.

### Player cards / exports
- `filterPortfolioForPublicExport` — stranger/export DTO respects privacy toggles; refuses non-public Passports.
- Share card + Football CV PDF consume filtered DTO; hidden stats/endorsements show Private/—; CV export throws if not public.
- Tab navigator only offers CV export when `portfolioPreview.isPublic`.
- Discovery `analysisSampleCount` is **null** when unknown (no invented zero) in client model + server projection.

---

## Validation (this tip)

| Suite | Result |
|---|---|
| `npm run test:unit` | **724 pass / 0 fail** |
| Worker OCR C/E/D subset | **22 passed** |
| App Check live recheck | providers **still not configured** |

---

## Gates (unchanged externals)

B-01 App Check, B-02/B-10 ops, B-03 counsel, B-04 owner SEC, B-05 device on **new** tip archive, B-11/B-14 tip build, B-12 ASC, B-13 REL-D-OFF — still require owner/external evidence. This engineering pass **invalidates** any claim that an older IPA validates the candidate.

---

## Approval requests (not executed)

| ID | Action |
|---|---|
| A1 | EAS iOS production build of the **new** frozen SHA after this commit lands |
| A2 | App Check App Attest + DeviceCheck registration (console) |
| A3 | Counsel re-check if public-export privacy wording needs update (behavior tightened locally) |

Rollback E: `SCOUTX_OCR_CACHE_PROVENANCE=0`. Rollback exports: revert PortfolioModel / share-card commits.
