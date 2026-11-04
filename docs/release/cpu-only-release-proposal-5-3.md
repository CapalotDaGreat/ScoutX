# CPU-only / no-CV-worker release scope proposal (5.3)

**Status:** Proposal only — **not applied** as a production decision.  
**Pinned GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**Candidate SHA at draft:** `103931cf54286eff67e2a040ba32a5aa7ab6e31d`

---

## 1. What production actually uses today

| Path | CUDA? | Evidence |
|---|---|---|
| Expo app + Cloud Functions still-frame / sampled AI | No CV worker GPU | AI via OpenRouter; CV stages report unavailable when worker null |
| Continuous football-cv tracker | **Not configured** | `APPROVED_CV_WORKER = null`; needs `CV_WORKER_URL` + `CV_WORKER_APPROVED=true` + generated approval |
| Bench / validation GPU gap | Historical CUDA divergence vs CPU | Separate from App Store binary; `productionApproval=false` |

**Conclusion:** For an App Store build that **keeps the CV worker unapproved**, the unresolved CUDA accuracy gap is a **deferred CV-worker / evaluation blocker (DEFER)**, not a blocker for shipping Passport + limited analysis with honest “tracking unavailable” copy.

CPU validation **does not** prove GPU correctness. Do not claim parity.

---

## 2. Proposed scoped release (requires owner decision)

**In scope**

- Football Passport, logs, movement (on-device), media, scouting scaffolding, subscriptions.
- Still-frame / limited server AI **only if** AI footage approval is separately granted; otherwise AI footage stays refused (current default).

**Out of scope / unavailable**

- Continuous player tracking, auto event detection, any CUDA worker path.
- `productionApproval` remains false for tracker eval artifacts.

**User-visible implications**

- UI already should label CV stages unavailable when worker not configured.
- No promise of automatic jersey tracking across a full match.

**Safeguards already in code**

- `functions/src/analysis/cvApproval.generated.ts` → `null`
- `cvConfig.ts` requires URL + `CV_WORKER_APPROVED=true`
- Release gate: “Computer-vision worker stays off until approved”

**Remaining CPU accuracy / safety limits (even without CUDA)**

- Candidate D not promoted → appearance-only LIKELY residual risk.
- Known identity failure xfails remain.
- C (consulted-only OCR) is ON on this branch — reduces cache evidence leakage; does not fix all identity errors.

---

## 3. Owner decision checkbox (do not tick without reading)

- [ ] Accept scoped **no-CV-worker** public/TestFlight release; CUDA gap **deferred** until worker evaluation.
- [ ] Reject — block any store release until GPU session vs `51d41c9…` closes the gap (even with worker off). *(Unusual if worker is off; record rationale.)*

---

## 4. Future GPU session — approval request template (do not allocate yet)

**APPROVAL REQUIRED** — billable. Cost estimate ≠ billing cap.

| Field | Fill before asking |
|---|---|
| Purpose | Compare identity accuracy CUDA vs CPU at baseline `51d41c9…` only (no silent newer candidates) |
| Region / zones | Primary: _____ · Fallback: _____ |
| Scale | **At most one** live VM |
| Source commits | Baseline `51d41c9…` (+ optional separate compare commit listed explicitly) |
| Machine / GPU / image / disk | _____ |
| Footage | Local path only; upload needs **separate** approval |
| Profiles | default decoder; flags A/B/C/D/E stated |
| Pricing source + timestamp | Official cloud price page URL + date |
| Expected cost / max duration | $_____ / _____ hours hard stop |
| Lifetime / cleanup | Auto-delete VM; export checksums; confirm destroy |
| Export verification | Who pulls results; no private footage in git |

Do not start VM or upload footage until the owner replies with explicit approval of the filled template.
