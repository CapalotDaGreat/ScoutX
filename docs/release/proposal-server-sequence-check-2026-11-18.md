# Promotion proposal: server every-frame sequence check (merge only)

**Status: ready for an explicit merge decision.** Not merged; not deployed. A merge does **not** promote any
tracking candidate, change any worker default or enable analysis. Analysis stays off, so this has no user-visible
effect until a separate enablement decision.

| Item | Detail |
|---|---|
| Code commit | `9ba85c3` on `exp/analysis-dev-2026-11-14` (tested as part of `f5878036ed52cfe4da9764be75579ae7813128a4`) |
| Files | `functions/src/analysis/trackingV3.ts` (`confirmedOnEveryFrame`; `parseOffballSequences(raw, strip, frames?)`; `parseTrackingReport` passes the timeline), `functions/lib` build output, `tests/unit/videoReasoning50.test.ts` |
| Behaviour | A clip sequence (≥ 6 s off-ball observation) is kept only if **every** timeline sample in it is CONFIRMED_VISIBLE, with gaps ≤ max(0.55 s, 1.5 × the sampling step) and edges within one step. Before: a 1-s majority strip, which admitted mid-second LIKELY samples (IMG_4809 1,170.8–1,178.8 s) |
| Effect | Only removes sequences, never adds. On the CLIP-EXP-1 data, E6 keeps 1 clip (8 s; 81/81 labelled frames are the target) |
| Compatibility | Same report schema. `frames` is optional; without a timeline the old strip rule applies |
| Privacy / licensing | None new |

**Tests.** Isolated checkout on the owner PC VM (Linux, node 22.23.5). Source is `git archive f5878036…`
(tar.gz SHA-256 `9319d7e2…0debf`). `npm ci --ignore-scripts`; ffmpeg-static linked to the system ffmpeg because
the install script was skipped.

| Check | Result |
|---|---|
| `npm run test:unit` | 826 / 826 pass, 0 skipped |
| `tsc --noEmit` (app) | exit 0 |
| `tsc --noEmit -p tests` | exit 0 |
| `functions: tsc --noEmit` and `tsc` | exit 0 |
| Rules/emulator suites (firebase-tools 14.27.0, firestore emulator 1.19.8, storage rules runtime 1.1.3), all 17 files in 3 batches | **263 / 263 pass** after the test-helper fix `72aa6dd` (2026-11-19); 259 / 263 before it |

The 4 earlier failures were a test-helper defect: a raw v0 upload carries no contentType to the rules. It is fixed in `72aa6dd` (ledger §26); the rules are unchanged. The merge candidate should include `72aa6dd`, and the suites should be re-run on the exact merge commit.

**Rollback.**
- `git revert 9ba85c3`; check first that the diff is limited to the files above.
- Functions were never deployed with it, so no deploy rollback applies.
- Parse-time logic only: persisted reports are unaffected, and a revert restores the strip rule on the next parse.

**Stop condition:** any failing app/backend contract on the merge commit.

**Approvals that remain separate:**
- (a) merge into main: requested;
- (b) deploy Functions: not requested;
- (c) enable analysis: not requested.
