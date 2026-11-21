# Engine build plan V1–V3: checked against the repo (2026-11-21)

Source: the owner's overhauled prompt and blueprint (21 Nov). This file records what was checked against code and
measured reports, what was corrected, and how today's work fits it. The blueprint's six sections stay the plan of
record. The one rule that judges every change: **an improvement must raise claimed-correct seconds per compute
dollar on the same decoded pixels and pass `bench/gates/balanced_5.2.json`.**

## 1. Claims checked against the repo

| Blueprint claim | Check | Result |
|---|---|---|
| Accuracy gate `bench/gates/balanced_5.2.json`: recall drop ≤ 0.02, IDF1 drop ≤ 0.01 | File contents | ✔ Also: wrong identity 0 s, confirmed-correct drop ≤ 0.5 s, state agreement ≥ 0.97 |
| `MAX_SPEED_BH = 5`, `QUESTION_STRATEGY = "resolve"`, `GALLERY_SELF_TRAINING = False` | `identity.py` lines 28, 36, 41 | ✔ |
| `split_on_number_conflicts`, `purify` | `tracklets.py` | ✔ |
| `MAX_REPROJECTION_M = 1.0`, `MAX_PROPAGATION_SEC = 20`, 200 m² hull, `auto_calibration_feasibility` | `calibration.py` | ✔ |
| `CaptureReader` bounded decode | `frame_reader.py`, `extract.py` | ✔ |
| Stride 2 is accuracy-invalid | 5.2 pre-benchmark: `SCOUTX_KEYFRAME_EVERY=2` refused (exit 5) | ✔ |
| CPU 7,528 s vs L4 FP16 b8 1,854 s; L4 failed the relative gate | 5.3 GPU benchmark report | ✔ |
| sn-gamestate is GPL-3.0 | GitHub repository page | ✔ (checked 2026-11-21) |
| "Auto confirmed ~12.5 s; with 39 answers ~55 s confirmed / ~345 s likely" | 4.0/4.1 reports (27 Oct) | **Wrong bar for V2.** 12.5 s is the 27 Oct `CONFIRMED_VISIBLE` timeline seconds of engine 3.2 without answers |
| V2 bar (corrected 2026-11-21, owner review) | `wrong-player-exchange-2026-11-02.md` §8 full-match table | **Default decoder, full match, corrected labels: 263 / 502 correct, 14 wrong-player (0 confirmed), 234 abstained.** Plus 42 reviewed LIKELY wrong-player frames: 28 on a legible #6, 11 on a legible #17, 3 at the pause-and-resume transfer. "0 confirmed" counts reviewed frames; it does not prove there are none. Interval runs (298 / 502) do not predict the full match. *An earlier version of this file said "307 / 503, 0 wrong". That row is a default-off candidate (T+D+C, pre-pilot decision §4) and is not the bar.* |
| "Double decode is ~84 % of recorded GPU wall time" | 5.3 GPU benchmark report: discovery 507.753 s + extraction 1,051.349 s of 1,853.86 s | **84.1 % is discovery + extraction, not decode.** Inside that run the components were detect 19.0 %, camera motion 18.8 %, decode 16.8 %, OCR 11.6 %, colour 7.8 %. V1 times decode, detect and camera motion on the shipped footage and device before merging the two video opens (416 px discovery, 1,280 px extraction) |
| Kornia OSNet FP16 default, SkillCorner 10 fps / 2.55 m MAE, Veo miss causes | External | Not checked here. These only motivate rules that the repo already follows |

## 2. How today's work fits

| Today | Blueprint section | Status after the review |
|---|---|---|
| INT8 detector measurement (`bench/detector_int8_experiment.py`) | §1 "INT8 forbidden until a gate exists" | The gate exists (balanced_5.2). INT8 stays an **offline measurement**. Its only acceptance path is now that gate against CPU FP32 on the same pixels (speed-cost doc §3, §6). A quantised export is labelled `onnx-int8` in every report and checkpoint. **Order:** after V1 GPU FP32/FP16 parity, as the blueprint says, unless the owner chooses the CPU production path (below) |
| CPU Cloud Run cost estimate | §5 Cost | **Owner decision 2026-11-21: production device is CPU.** It is the only configuration that has passed (the L4 FP16 b8 candidate failed: claimed recall 0.494 vs 0.621, IDF1 0.661 vs 0.766). L4 stays a V1 parity experiment until a same-image FP32-then-FP16 pair passes balanced_5.2 on the same decoded pixels. CPU-as-device is not a release: see `docs/release/cpu-production-plan-2026-11-21.md` |
| E9 synthetic PARSeq fine-tune kit | §3 Identity, V2 | Fits "jersey OCR is the only automatic hard ID". Its keep rule (0 team-mate "20" reads) is stricter than a recall gate. A kept model still needs the balanced_5.2 replay. Default off, hash-pinned |
| Filming tips in the app | V2 "plan for questions" / public bar | Attacks low contrast and covered numbers at the source. No engine change |
| Ideas doc E2 (pose torso box) | §3 Pose: "a torso-visibility flag" | Same intent. Weights need the licence review the blueprint requires |
| Ideas doc E4 (expansion-IoU association) | §3 "Online IDs are an input to tracklets"; rule 3 (new splits must be local) | Only after its effect is shown local on the claim diff |

## 3. V1–V3 (blueprint, unchanged except the corrected baseline)

**V1: speed without accuracy loss**
- Files: `frame_reader.py`, `colour.py`, `extract.py`, `bench/fp32_comparison.py`.
- Run the profiles cpu-onnx, cpu-torch, gpu-fp32-b1, gpu-fp32-b8, gpu-fp16-b8 and a repeat, changing one variable at
  a time and recording decoded-frame hashes.
- Share one decode between discovery and extraction.
- Pass: balanced_5.2 relative gate, and under ~30 min on L4 for the 2,035 s proxy. Measure the decode share first
  (see §1).

**V2: more confirmed time, no new false claims**
- Files: `ocr.py`, `legibility.py`, `tracklets.py`, `identity.py`.
- Work: legibility-gated dense OCR, exchange/contact splits proven local, resolve-strategy questions, and E9 if its
  keep rule holds.
- Pass: confirmed-correct seconds up from the **current** baseline (above), wrong-identity 0, leave-one-out
  reported separately.

**V3: metres only where markings exist**
- Files: `calibration.py`, `metrics.py`, `periods.py`.
- Work: pose-smoothed calibration from lines and points for camera classes B/C, shot and replay labels, distance
  only over valid samples, an explicit abstain for touchline phones.
- Pass: reprojection ≤ 1 m on a labelled calibration set; speed checked against a wearable or a second camera on a
  recording other than IMG_4809.

Blocked inputs (unchanged): GPU-1 session, a second labelled match (LABEL-1), the licence review for any pose or
association weights, and LEGAL-1 for anything resembling re-ID.
