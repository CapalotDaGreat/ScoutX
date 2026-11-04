# PitchProof 5.3 release contracts (local candidate)

**Branch:** `release/pitchproof-5-3-candidate`  
**Based on:** `905eed7`  
**GPU baseline (immutable):** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac`  
**Not a production deployment.**

## Behaviour defaults on this branch

| Behaviour | Default | Explicit opt-out / opt-in |
|---|---|---|
| C — OCR consulted-only evidence | **ON** | `SCOUTX_OCR_CONSULTED_ONLY=0` restores pre-C leakage |
| A — exchange split | OFF | `SCOUTX_EXCHANGE_SPLIT=1` |
| B — resume split | OFF | `SCOUTX_RESUME_SPLIT=1` |
| D — no appearance-only LIKELY | OFF (LIKELY still allowed from appearance) | `SCOUTX_APPEARANCE_ONLY_LIKELY=0` enables D |
| E — OCR cache provenance tags | OFF | `SCOUTX_OCR_CACHE_PROVENANCE=1` |

## Outcome classes (honest)

1. **Supported identity** — automatic claim with accepted OCR/number evidence under safeguards.
2. **Safe abstention** — no supported automatic identity; do not invent attribution.
3. **Unsupported input** — rejected before analysis.
4. **Recoverable failure** — retryable job/OCR/decode error.
5. **Failed processing** — terminal failure; never present as a successful track.

Abstention is **not** “successful player tracking.”

## Rollback

1. Set `SCOUTX_OCR_CONSULTED_ONLY=0` in the worker environment, **or**
2. Revert the C default commit on this branch (restore analyze.py default `"0"` and drop `test_default_is_consulted_only`).

Do not rewrite the pinned GPU baseline commit.
