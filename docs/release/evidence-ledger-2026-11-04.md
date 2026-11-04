# PitchProof release evidence ledger (2026-11-04)

**Workspace:** `C:/ZLI/M335/ScoutX-gpu-benchmark`  
**Branch (start):** `codex/gpu-benchmark-5-3` @ `905eed7a38d017c008df816917f04624b5637293`  
**Release branch:** `release/pitchproof-5-3-candidate` (forked from that SHA)  
**Pinned GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (still ancestor of HEAD)  
**productionApproval:** false  
**No deploy / ASC submit / billable cloud resources / private footage upload in this session.**

This ledger is updated as work proceeds. Items marked NOT RUN were not executed in this session.

---

## Candidate status (this release branch)

| Id | Flag | Default on this branch | Status |
|---|---|---|---|
| A | `SCOUTX_EXCHANGE_SPLIT` | off (`"0"`) | experimental, off |
| B | `SCOUTX_RESUME_SPLIT` | off | needs revision, off |
| C | `SCOUTX_OCR_CONSULTED_ONLY` | **ON** (`"1"`); opt-out `=0` | applied locally on release branch |
| D | `SCOUTX_APPEARANCE_ONLY_LIKELY` | appearance LIKELY still allowed (`"1"`); D = `"0"` | **not promoted**; independent review pending |
| E | `SCOUTX_OCR_CACHE_PROVENANCE` | off | needs revision, off |

Atomic OCR cache writes (part of E work) remain unconditional from earlier commits — that does not enable E.

---

## Release requirements

| Req | Status | Evidence |
|---|---|---|
| Establish baseline SHA / worktree | DONE | Agent root = gpu-benchmark worktree; FF to `905eed7`; release branch created |
| Preserve pinned GPU baseline | DONE | Object resolvable; `git merge-base --is-ancestor` exit 0 |
| Create persistent ledger | DONE | This file |
| Review C contract + patch | DONE | `docs/release/release-contracts-5-3.md` |
| Apply C as **local** release-branch default | DONE | `analyze.py` default `"1"` + `test_default_is_consulted_only`; not a production deploy |
| Keep A/B/D/E experimental (off / not promoted) | DONE | Source defaults unchanged for A/B/E; D still appearance-LIKELY allowed |
| Worker unit/integration suite | DONE | `pytest tests/ --ignore=tests/test_52.py`: **619 passed, 16 skipped, 6 xfailed**, 0 failed (supervision pinned `>=0.22,<0.27`) |
| C / OCR cache equivalence | DONE | `tests/test_ocr_cache_equivalence.py` included in suite; default-on assertion passes |
| Opt-in full-match / known-failure replays | PARTIAL | Full-match tests skipped without `SCOUTX_FULL_MATCH_REPLAY`; known-failure xfails present (6). Prior CPU evidence under `bench/results/5.3/` not re-run (no private footage) |
| App typecheck | DONE | `npm run typecheck` PASS |
| App lint | DONE | `npm run lint` PASS |
| App unit | DONE | `npm run test:unit` → **718 / 718** pass |
| Functions build | DONE | `npm run build --prefix functions` PASS |
| Security rules + callables | DONE | `npm run test:rules` → **261 / 261** pass (Firestore/Storage emulators) |
| Legal content check | DONE | `npm run legal:check` PASS |
| Release gate (`--skip-tests`) | BLOCKED (external/legal/unvalidated) | After excluding unit fixtures from Test Store scan: **0 CODE BLOCKER**; remaining: EXTERNAL×4, LEGAL×3, NOT VALIDATED×3. Public release still blocked. |
| Expo / ASC config inspection | DONE | Local audit: App Attest production entitlement, privacy manifest tracking off, AASA Team ID, fail-closed AI/CV gates |
| Physical device / sandbox IAP | NOT VALIDATED | Environment limitation |
| CUDA / GPU accuracy gap | NOT VALIDATED | CPU results ≠ CUDA validation |
| Independent review of D / labels | NOT DONE | External human review |
| Production deploy / ASC submit | BLOCKED | Explicitly unauthorized |

---

## Supported product contract (honest)

1. **Analysis modes:** still-frame / short-clip paths exist; continuous CV tracking worker remains gated (`APPROVED_CV_WORKER=null`; needs `CV_WORKER_URL` + `CV_WORKER_APPROVED=true`).
2. **AI footage:** refuse until `AI_FOOTAGE_PROCESSING_APPROVED=true` (empty env → false).
3. **Identity:** automatic claims require number/OCR evidence meeting safeguards; appearance-only LIKELY remains possible until D is reviewed/promoted.
4. **Cache (C):** warm OCR caches save time only; they do not inject foreign evidence. Opt-out: `SCOUTX_OCR_CONSULTED_ONLY=0`.
5. **Abstention ≠ successful tracking.** UI/reports must not present unsupported attribution as confirmed tracking.
6. **GPU:** CUDA accuracy gap unresolved; do not claim GPU parity with CPU.
7. **productionApproval:** false.

---

## Fail-closed gates (verified this session)

| Gate | Evidence |
|---|---|
| `APPROVED_CV_WORKER` | `null` in `functions/src/analysis/cvApproval.generated.ts` |
| AI footage | `isFootageProcessingApproved({})` → `false` |
| productionApproval | false in ledger / bench writers |
| A/B/E | defaults `"0"` |
| D | not promoted (`APPEARANCE_ONLY_LIKELY` default still true) |

---

## Change log (this session)

| When | Change | Commit |
|---|---|---|
| start | Fast-forwarded worktree to `905eed7`; created `release/pitchproof-5-3-candidate` | n/a |
| | Applied C default (`"1"`) + opt-out + `test_default_is_consulted_only`; release-gate fixture exclude; ledger/contracts/dossier | `6ebdd5c` |
| | Worker env: installed deps; pinned `supervision==0.26.1` (<0.27 for ByteTrack) | local venv only |
| | Worker suite 619/0 fail; app 718; functions build; rules 261 | evidence under this commit |
| | Audit follow-up: align checklist model allowlist (`gemini-2.5-flash`) + entitlement-matrix product-ID wording | `0ebfbd8` |
