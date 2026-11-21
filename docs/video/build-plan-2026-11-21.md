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
| "Auto confirmed ~12.5 s; with 39 answers ~55 s confirmed / ~345 s likely" | 4.0/4.1 reports (27 Oct) | **Outdated.** Current IMG_4809 automatic, T+D+C(+I): 307 / 503 labelled target frames correct, 0 wrong-player, 195 abstain (pre-pilot decision, 18 Nov). Release: 266 correct, 11 wrong-player |
| "Double decode is ~84 % of recorded GPU wall time" | Not found in any report | **Unverified.** Measure in V1 before relying on it. On 8-bit SDR proxies on CPU, decode is 0.4 % of stage 1 (speed-cost doc §2), so the claim can only hold for HLG decode on GPU |
| Kornia OSNet FP16 default, SkillCorner 10 fps / 2.55 m MAE, Veo miss causes | External | Not checked here. These only motivate rules that the repo already follows |

## 2. How today's work fits

| Today | Blueprint section | Status after the review |
|---|---|---|
| INT8 detector measurement (`bench/detector_int8_experiment.py`) | §1 "INT8 forbidden until a gate exists" | The gate exists (balanced_5.2). INT8 stays an **offline measurement**. Its only acceptance path is now that gate against CPU FP32 on the same pixels (speed-cost doc §3, §6). A quantised export is labelled `onnx-int8` in every report and checkpoint. **Order:** after V1 GPU FP32/FP16 parity, as the blueprint says, unless the owner chooses the CPU production path (below) |
| CPU Cloud Run cost estimate | §5 Cost | Complements the L4 table. The CPU FP32 run is the accuracy reference, so it passes the gate by definition, at about half the L4 list price per match, with 3–4 h latency. The owner decides between "CPU now" and "L4 after V1" |
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
