# Engine flags and candidate names: authoritative mapping (2026-11-19)

Never infer a configuration from a letter. Reports from 2026-11-19 onward name the full flag. The letters below
are kept only so that older documents can be read. **The same letter meant different things at different times.**

| Descriptive ID (use this) | Environment flag and value | Default (code, `f699669`) | Historical letters |
|---|---|---|---|
| `ocr-consulted-only` | `SCOUTX_OCR_CONSULTED_ONLY=1` | **"1" (on)**; in every run since 6ebdd5c, including all runs in ledger sections 11–25 | **"C" in early-November release docs** (`blocker-register-2026-11-04`, `evidence-ledger-2026-11-04`, …) |
| `teleport-split` | `SCOUTX_TELEPORT_SPLIT=1` | "0" (off) | "T" (ledger §11–25) |
| `no-appearance-only-likely` | `SCOUTX_APPEARANCE_ONLY_LIKELY=0` | "1" (appearance-only LIKELY allowed) | "D" (all documents) |
| `combined-number-reader` | `SCOUTX_OCR_VARIANT=combined` | "binarised" | **"C" in ledger §11–25 and the 2026-11-18 packets** |
| `interp-no-upgrade` | `SCOUTX_INTERP_NO_UPGRADE=1` | "0" (off) | "I" (candidate I, commit f699669) |

"T+D+C(+I)" in 2026-11-17/18 documents means `teleport-split` + `no-appearance-only-likely` +
`combined-number-reader` (+ `interp-no-upgrade`), with `ocr-consulted-only` at its default on. It never means
consulted-only OCR switched on, because that was already on.

Fixed runtime in every compared run (`environment.scoutxEnv` in each `full_match.json`):
`SCOUTX_BACKEND=onnx SCOUTX_BATCH=1 SCOUTX_DECODER=cv2 SCOUTX_DETECTOR=yolox_s SCOUTX_DISCOVERY_DET=416
SCOUTX_KEYFRAME_EVERY=1 SCOUTX_MODE=balanced SCOUTX_OCR_ENHANCE=0 SCOUTX_ORT_PROVIDERS=CPUExecutionProvider`.
