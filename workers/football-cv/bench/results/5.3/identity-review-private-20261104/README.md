# PRIVATE: reviewer must NOT open this folder before submitting stage-1 answers

This folder holds the reconciliation material for the v2 review packet (`../identity-review-packet-20261103/items_v2.json`).

| File | Contents |
|---|---|
| `mapping_v2.json` | Why each neutral item `Rnn` is in the packet: its category, original labels, the proposed corrections, and which run each box came from. Its SHA-256 is recorded in `items_v2.json` (`privateMappingSha256`), so later edits are detectable. |
| `stage2_corrections.csv` | **Stage 2**, handed over by the coordinator only after the reviewer's stage-1 `answers.csv` is committed. It lists the proposed label corrections C1–C8 for a verdict of supported, unsupported or uncertain. |

**Limitation:** this folder sits in the same repository as the packet, so the coordinator must enforce the ordering. The SHA in `items_v2.json` only proves that the mapping was not changed afterwards.
