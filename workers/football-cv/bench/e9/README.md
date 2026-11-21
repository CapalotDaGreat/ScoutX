# E9: jersey-number recogniser fine-tune on synthetic data (prepared 2026-11-21, not run)

This addresses the measured bottleneck: small, pale digits (~25 px) on the orange kit that a human reads but neither
PARSeq nor EasyOCR does (ledger §14, research notes §5). Everything is ready, so a GPU session only trains and
evaluates.

| File | Role | Checked here (CPU) |
|---|---|---|
| `synth.py` | Synthetic players → the engine's own binarised 64-px patches (`ocr._maps`/`_digit_box`), kept only where the located box lies on the true digits | 2,000 crops → 728 patches in 6.5 s; patches inspected by eye |
| `finetune.py` | docTR PARSeq fine-tune (AdamW, one-cycle), 5 % held-out synthetic split, writes `parseq_e9.pt` + `run.json` with SHA-256 | Random-init smoke: loss 5.15 → 2.34 in 20 steps; weights load through the engine hook |
| `eval_crops.py` | Real labelled crops through `NumberReader`, pinned vs fine-tuned, with the predeclared keep rule | Keep rule unit-tested; not run (pretrained OCR weights are not reachable from this workspace) |
| `scoutx_tracker/ocr.py` `apply_parseq_override` | `SCOUTX_PARSEQ_WEIGHTS` + required `SCOUTX_PARSEQ_WEIGHTS_SHA256`; default off; reported as `parseqWeights` in the OCR device report | Unit-tested (refuses a missing or wrong hash) |

Fonts: only fonts whose licence allows this use (the run used SIL OFL fonts: Anton, Archivo Black, Montserrat,
Fira Sans, Roboto). The manifest records each font file's SHA-256. No real footage is used for training.

## GPU session steps (L4, about 30 min of GPU time including setup)

```bash
pip install -r requirements-tracker.txt    # pinned image preferred
python -m bench.e9.synth --fonts FONTS... --out data/e9_synth --n 200000 --seed 1          # ~75k patches, CPU
python -m bench.e9.finetune --data data/e9_synth --out data/e9_run1 --epochs 3 --batch 256 --lr 1e-4
python -m bench.e9.eval_crops --crops crops_img4809.jsonl --root CROPS --number 20 \
    --weights data/e9_run1/parseq_e9.pt --sha256 "$(jq -r .weightsSha256 data/e9_run1/run.json)" --out e9_eval.json
```

Needs the IMG_4809 labelled crop set (245 target, 1,221 same-kit team-mates, with piece ids) as `crops_img4809.jsonl`.
It is not in git.

## Keep rule (fixed before any result)

Keep only if all three hold:
- Target crops read as "20" rise by ≥ 5 crops and ≥ 2 pieces.
- **Zero** team-mate crops are read as "20".
- Other-number reads on target crops do not rise.

If kept, the next step is a full identity replay with the override, as in any engine change. A pass is not a
promotion.

## Risks

- The synthetic-to-real gap can leave the recall unchanged.
- Fine-tuning on digits makes PARSeq more willing to output digits. The engine still requires PARSeq and EasyOCR to
  agree, and the team-mate check catches a rise in wrong reads.
- One labelled match only. A second labelled recording (LABEL-1) is still needed before any promotion proposal.
