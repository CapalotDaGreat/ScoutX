# PitchProof milestone assessment (2026-11-03)

**Status:** assessment only. Nothing launched, merged or deployed. `productionApproval=false`. The default decoder and every threshold and safeguard are unchanged.

## References

**Code and report commits** (branch `codex/gpu-benchmark-5-3`):

| Commit | What it is |
|---|---|
| `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` | **Pinned GPU baseline**, unchanged. Source archive SHA-256 `308c07a4…795a62f` (re-verified 2026-11-02). |
| `22a58b9` | Frozen experimental HLG reference `hlg-bc709-g2.2-v1` (diagnostic only) |
| `461c4402bee3ba2f43314ae7bd0b022572d3b196` | HDR-reference validation: kept experimental |
| `6e64abf49ab8aa1de19b5f5538059d351ebcbdc1` | 244.4 s wrong-player verification and numeric regression replay (no inference change) |
| `93258f739a1d8a3334c76f43ae4cc08b66b06bac` | Exchange-split candidate, `SCOUTX_EXCHANGE_SPLIT`, **default off**, frozen |
| `e6e062ae8c125d94aa92a4da6172ffdff0912135` | Generalisation protocol, recorded before the clip runs |
| `6559725` | GPU FP32 proposal, read-only verification, unlabelled clip runner |
| this commit | Validation results and this assessment |

**Reports:**

- [wrong-player-exchange-2026-11-02.md](wrong-player-exchange-2026-11-02.md)
- [hdr-reference-and-validation-2026-11-02.md](hdr-reference-and-validation-2026-11-02.md) (with an addendum)
- [gpu-fp32-proposal-2026-11-02.md](gpu-fp32-proposal-2026-11-02.md)
- [intelligence-5.3-gpu-benchmark-report.md](intelligence-5.3-gpu-benchmark-report.md)

**Artifacts:**

- `bench/results/5.3/wrong-player-20261102/`:
  - `visual_review.json`
  - `replays/`
  - `generalisation_protocol.json`
  - `validation/`: scores, delay, clip results, manifest with timeline and clip hashes, suite logs
- `bench/results/5.3/fp32-proposal-20261102/`:
  - `pricing.json`
  - `cleanup_check.json`

**Test environment:**

- Linux container, Python 3.13.17, CPU only. Proxy video `b1077af3…`. Settings `cpu-onnx` (`validation/env.txt`).
- Worker suite: 614 passed with `SCOUTX_EXCHANGE_SPLIT=0` and 614 passed with `=1`.
- No Windows, GPU or production environment was used for these results.

## 1. Demonstrated

**The 244.4 s wrong-player confirmation was a real association defect, verified visually and numerically.**

- #20 and an orange team-mate (A) cross with partial overlap. The tracker swaps their tracks.
- Neither the contact rule (50 % cover) nor the steal rule (the victim must pause) cuts the swap.
- The one correct "20" read then confirms A.
- The numeric replay reproduces the failure exactly with the unchanged stage-2 logic: 300/300 states.

**The candidate removes that failure without losing correct identities.**

- HDR reference, 225 s:
  - wrong-player 26 (18 confirmed) → 13 (5 confirmed);
  - correct 9 → 27 of 68;
  - unmatched and "?" claims do not rise.
- In none of the 9 intervals under either decoder does it lose a correct target frame or change acquisition delay.

**Default decoder:** baseline and candidate give identical claims on all 9 labelled intervals.

- Original labels: 301/502 correct, 0 wrong-player, 4 unmatched, 3 "?" claims.

**Baseline reproducibility:** with the flag off, the candidate commit reproduces `461c440` exactly (18/18 interval replays).

**Cloud state** (read-only check, 2026-11-02):

- 0 instances, 0 disks, 0 snapshots and 0 custom images in `scoutx-230b0`.
- The bucket holds only `results/` objects.
- No cloud resource was created in this work.

## 2. Provisional

**The candidate is "supported for further validation" only.**

- The evidence is one development event (225 s).
- Seven held-out intervals come from the **same match**, camera and annotator, and showed no claim change.
- Four **unlabelled** SDR clips from two other matches had no "20" reads at all. They show only that the candidate adds no claims there.

**Default-decoder safety rests on one match and one annotator.** "0 wrong-player claims" holds only **under the original labels**:

- at 225 s frames 195–197 the default claims (likely) the other player;
- the piece-based labels follow the same exchange, so these count as correct.
- Real wrong-player rate: ≥ 3 likely frames, not 0.
- The candidate does not change this, because the default's pattern is a pause and re-acquisition, not a mutual exchange.

**Abstention dominates the default.** 200 of 502 target-labelled frames are abstained, and two intervals (1295 s, 1890 s) have **no correct claim at all**. Zero wrong-player claims there means no claims, not proven safety.

**The HLG reference is technically verified but stays experimental.**

- Baseline: 286/502 correct, 26 wrong (18 confirmed).
- With the candidate: 304/502 correct, 13 wrong (5 confirmed). The 5 confirmed are an annotation issue (visibly #20); the 8 likely are a separate unrepaired mechanism.

## 3. Failed or unknown

**The original GPU accuracy gap is unresolved.**

- The controlled FP32 comparison on `51d41c9` has never run. Every L4 allocation attempt on 2026-11-01 failed for capacity.
- CPU decoder findings (Linux vs Windows divergence starts at decoding) do not explain it.
- There is no evidence of whether FP16, batching, backend, device or nondeterminism causes it.

**E3** (reference, 238.6–239.9 s): 8 likely wrong-player claims from an appearance-only choice. Not repaired, and the cause is only partly traced.

**Labels:**

- The label file has an annotation issue at 225 s: frames 195–197, 208 and 211 are labelled N but show #20.
- Labels were not changed. All scores keep the original labels.

**Not tested at all:**

- independent labelled footage;
- other HDR footage;
- a full-match run;
- runtime at full-match scale. Window timings here, 10–15 min per 30 s on a 2-CPU container under contention, are **not** a performance estimate.
- The independent clips used the IMG_4809 target settings (#20 orange vs white), but IMG_4529's opponents wear red.

## 4. Required before any production promotion

1. A controlled GPU FP32 comparison on `51d41c9`, with CPU controls in the same image, that explains or bounds the accuracy gap. **This needs your explicit approval** (proposal: `gpu-fp32-proposal-2026-11-02.md`).
2. Re-labelling or adjudication of the 225 s annotation issue by a second annotator. Keep the original labels, and score both versions.
3. At least one independent labelled match, ideally with the target readable, scored with explicit counts of wrong, unmatched and "?" claims.
4. A full-match local run of the default decoder, baseline vs candidate, with every changed claim reviewed.
5. A decision on the default's pause/re-acquisition wrong-player pattern at 225 s frames 195–197: either a separate validated candidate, or a documented accepted risk.
6. Production flags, the default decoder and `productionApproval` change only through a separate, explicit approval.

## Smallest next action

There are two candidates. Choose either; neither needs the other.

1. **If you approve it: the controlled GPU FP32 session** exactly as proposed.
   - One L4 VM, europe-west4-b (fallbacks: -c, then -a), commit `51d41c9` only.
   - Cost: $0.93–1.39 expected, $2.78 maximum, 180 min server-enforced lifetime.
   - It is the only route to the open accuracy gap.
2. **Locally, without approval: a full-match exchange-trigger audit on the default decoder.**
   - List every frame where `exchange_rows` fires in IMG_4809 and review those claims.
   - It needs stage-1 detections for the full match. Only tracking is rerun; OCR is needed only around frames where the rule fires.
   - It decides whether a full baseline/candidate run is worth its CPU hours.
