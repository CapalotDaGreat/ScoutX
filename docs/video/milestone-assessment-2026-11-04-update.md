# PitchProof milestone update (2026-11-04): candidates C and D

**Status:** validation only. Nothing deployed, uploaded or launched. `productionApproval=false`. All candidate flags stay off. The pinned GPU baseline `51d41c9…` is unchanged.

**Details:** [wrong-player-exchange-2026-11-02.md §11](wrong-player-exchange-2026-11-02.md) and [identity-contracts-C-D-2026-11-04.md](identity-contracts-C-D-2026-11-04.md). This updates [milestone-assessment-2026-11-03.md](milestone-assessment-2026-11-03.md).

**Commits:**

| Commit | What it is |
|---|---|
| `ed2b242` | E, atomic cache writes, edge-case and attribution tests, review packet v2, contracts |
| `2c62966` | Evidence and §11 |
| `3d22993` | E test pins and suite accounting |
| this commit | Verdicts and proposal |

## Findings

**C (cache never adds evidence):**

- Warm reruns are bit-identical to cold ones.
- Without C, a warm cache costs 34 correct frames on the default intervals and 30 claim frames on the full match.
- **Ready for a concrete default proposal:** `cd-validation-20261104/proposal_C_default.patch`. It awaits your decision.

**D (no LIKELY from appearance alone):**

- Removes 55 full-match frames: 39 author-judged wrong, 16 unverified.
- On the HLG reference, removes 8 wrong and 12 unmatched frames.
- Loses no labelled correct frame.
- Does **not** fix cache sensitivity.
- **Needs independent review** before any proposal.

**C+D:** no interaction, no bundled proposal.

**E:** needs revision.

## Still open

- **Independent review:** packet v2 is pending a reviewer.
- **Unreviewed label corrections:** the 3 P frames (anchored) remain wrong under them.
- **E3 and E4 on the reference.**
- **The GPU accuracy gap** is unresolved. These CPU results do not address it.
- **A further cloud session** needs separate approval.
