# Unmatched claim audit

Exact ledger reproduction: **313 correct / 0 wrong-player / 31 unmatched / 160 abstained of 504 T frames**.

## Classification tallies

- `likely_correct_geometry_fail`: 0
- `possible_wrong_player`: 0
- `missing_or_uncertain_annotation`: 1
- `ambiguous_overlap_occlusion`: 0
- `evaluation_alignment_defect`: 30
- `unresolved`: 0

These are evidence-conservative audit classes, not corrections to the scoring ledger. Uncertain cases are not counted correct.

## Cases

| time | interval | state | best label / IoU | second | N closer | class | reason |
|---:|:---:|:---|:---|:---|:---:|:---|:---|
| 244.4 | 225-255 | LIKELY | T / 0.088 | N / 0.000 | no | missing_or_uncertain_annotation | Local crops at 243.4/244.4/245.4s show #20 and an adjacent orange player overlapping; the claim only clips the T box (IoU 0.088) and is centred toward the adjacent player, which has no separate annotation. Identity is therefore not established. |
| 1154.1 | 1150-1180 | LIKELY | T / 0.445 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.932. |
| 1154.2 | 1150-1180 | LIKELY | T / 0.493 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.961. |
| 1154.5 | 1150-1180 | LIKELY | T / 0.406 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.954. |
| 1154.9 | 1150-1180 | LIKELY | T / 0.410 | N / 0.050 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.936. |
| 1155.2 | 1150-1180 | LIKELY | T / 0.432 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.937. |
| 1156.0 | 1150-1180 | LIKELY | T / 0.486 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.757. |
| 1162.6 | 1150-1180 | CONFIRMED | T / 0.444 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.982. |
| 1168.5 | 1150-1180 | CONFIRMED | N / 0.491 | T / 0.459 | yes | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.885. |
| 1173.8 | 1150-1180 | CONFIRMED | T / 0.494 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.936. |
| 1179.3 | 1150-1180 | LIKELY | T / 0.481 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.922. |
| 1179.4 | 1150-1180 | LIKELY | T / 0.481 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.938. |
| 1179.5 | 1150-1180 | LIKELY | T / 0.427 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.953. |
| 1179.6 | 1150-1180 | LIKELY | T / 0.457 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.960. |
| 1179.7 | 1150-1180 | LIKELY | T / 0.446 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.935. |
| 1179.8 | 1150-1180 | LIKELY | T / 0.478 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.983. |
| 1300.7 | 1295-1325 | CONFIRMED | T / 0.403 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.968. |
| 1300.8 | 1295-1325 | CONFIRMED | T / 0.481 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.935. |
| 1302.6 | 1295-1325 | CONFIRMED | T / 0.333 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.887. |
| 1302.7 | 1295-1325 | CONFIRMED | T / 0.487 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.954. |
| 1303.0 | 1295-1325 | CONFIRMED | T / 0.499 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.952. |
| 1303.1 | 1295-1325 | CONFIRMED | T / 0.423 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.974. |
| 1303.2 | 1295-1325 | CONFIRMED | T / 0.408 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.965. |
| 1303.3 | 1295-1325 | CONFIRMED | T / 0.424 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.977. |
| 1303.4 | 1295-1325 | CONFIRMED | T / 0.428 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.931. |
| 1303.5 | 1295-1325 | CONFIRMED | T / 0.442 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.966. |
| 1303.6 | 1295-1325 | CONFIRMED | T / 0.427 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.836. |
| 1303.7 | 1295-1325 | CONFIRMED | T / 0.435 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.922. |
| 1303.8 | 1295-1325 | CONFIRMED | T / 0.487 | N / 0.001 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.974. |
| 1303.9 | 1295-1325 | CONFIRMED | T / 0.450 | N / 0.015 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.885. |
| 1304.0 | 1295-1325 | CONFIRMED | T / 0.422 | N / 0.000 | no | evaluation_alignment_defect | The repository correction record shifts this interval's labels by +0.1s; the corrected claim pairing reaches T IoU 0.729. |

## Unresolved

- None under the stated heuristic; disputed cases still require independent review.

## Definition mismatches

- pp_bench.accuracy silently leaves sub-0.5 claimed frames out of its returned categories; the ledger names them unmatched.
- audit_claim_outcomes.classify_claim explicitly returns unmatchedClaim for the same sub-0.5 geometry.
- interval_scores.score selects the nearest timeline sample, whereas pp_bench.accuracy uses the first claim at/after t-tol. Here claims are sampled on the same 0.1 s grid, so this does not change the 31-frame result.
- The report's 31.3 claimedCorrectSec / 0 wrongIdentitySec does not expose unmatched or abstained counts; those require the explicit ledger partition.
