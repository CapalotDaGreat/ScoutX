# Analysis speed and cost: INT8 detector and CPU production path (2026-11-21)

Offline measurements only. No engine default, flag, gate, deployment or cloud resource changed. Analysis stays
disabled for users.

## 1. Test baseline in this workspace

Branch `exp/analysis-dev-2026-11-14` at `9389a2d`, cloud workspace (2 vCPU, 7 GiB, no GPU). The Python packages are
newer than the 2026-11-18 runtime (torch 2.15.0, onnxruntime 1.32.0, OpenCV 5.1.0); the pinned image was not
rebuilt.

| Suite | Result |
|---|---|
| Worker `pytest -q` (`workers/football-cv`) | 731 passed, 11 skipped, 6 xfailed (documented known failures), 57 s |
| App `npm run typecheck` (app + tests) | pass |
| App `npm run lint` | pass |
| App + backend `npm run test:unit` | 861 / 861 pass, 183 suites |
| `npm run build --prefix functions` | pass |

## 2. Where stage-1 time goes on a product proxy

On the 10 fps 1080p SDR proxies the decoder is not the bottleneck any more. The 55 ms/frame figure in ledger §5 was
for HLG 10-bit originals.

| Check | IMG_4529 600–660 s (night) | IMG_5105 600–660 s (day) |
|---|---|---|
| cv2 vs ffmpeg decode, 600 frames | 600/600 frames bit-identical | 600/600 bit-identical |
| Decode time, cv2 / ffmpeg | 2.7 s / 3.5 s | 4.9 s / 5.9 s |

Stage 1 on the night window (600 frames, release defaults): **detection 282.6 s of 293.3 s timed (96 %)**.
Decode 1.2 s, camera state 4.9 s, colour 3.0 s, embedding 0.9 s, crop I/O 0.7 s
(`bench/results/int8-20261121/stage1_window.json`). Switching the decoder gains nothing on proxies, so nothing was
changed there.

## 3. INT8 detector (`bench/detector_int8_experiment.py`)

Recipe: ONNX Runtime static quantisation, QDQ, per-channel INT8 weights, UInt8 activations. Calibration uses 20
frames each from IMG_4529 1200–1260 s and IMG_5105 1800–1860 s. Evaluation uses 60 frames each from the disjoint
600–660 s windows. The 9 prediction convs and the decode tail stay FP32 (`--variant body`).

| Variant | Result |
|---|---|
| Everything quantised | 3× faster but **0 boxes** (coordinates and scores share one uint8 scale): rejected |
| Conv nodes only (`convs`) | Correct boxes, only 15–20 % faster: rejected |
| **Body (`body`)** | **2.3–2.6× faster detector; 2.5× faster stage 1 on the night window** |

Body variant against FP32 on the evaluation frames (`detector_agreement.json`, INT8 SHA-256 `6f694d42…`):

| | Night IMG_4529 | Day IMG_5105 |
|---|---|---|
| Detector ms/frame (median) FP32 → INT8 | 405.5 → 174.1 | 417.6 → 159.9 |
| Persons ≥ 0.12: FP32 boxes kept | 98.7 % (1,182 / 1,198) | 97.5 % (1,360 / 1,395) |
| Persons ≥ 0.12, ≥ 80 px tall | 96.9 % (221 / 228) | 99.6 % (281 / 282) |
| OCR-crop candidates (≥ 0.4, ≥ 80 px) | 98.0 % (147 / 150) | 99.6 % (249 / 250) |
| New INT8-only boxes (≥ 0.12) | 40 | 21 |
| Mean / 5th-percentile IoU of matched boxes | 0.936 / 0.838 | 0.944 / 0.844 |
| Ball ≥ 0.05 kept | 87.5 % (14 / 16) | 94.1 % (64 / 68) |

Stage 1, night window, end to end: 295.1 s → 119.4 s. Detections 12,140 → 12,202. **OCR crops 785 → 752
(−4.2 %)**.

**Verdict: needs revision before any promotion proposal.** It is not equivalent:
- The changed boxes sit at the score threshold (FP32 score 0.12–0.28), including tall near-camera people at night.
- 4 % fewer OCR crops means fewer chances to read the number. The measured bottleneck is already sparse reads
  (ledger §14, research §5).

The smallest falsifiable test is a full identity replay on IMG_4809, judged by the repo's existing accuracy gate
`bench/gates/balanced_5.2.json`, relative to the CPU FP32 run on the same decoded pixels:
- wrong-identity seconds 0;
- claimed-recall drop ≤ 0.02 and IDF1 drop ≤ 0.01;
- confirmed-correct seconds drop ≤ 0.5;
- state agreement ≥ 0.97.

(Corrected 2026-11-21: this replaces an ad-hoc ≤ 1 % rule written earlier the same day.) Since 2026-11-21 a
quantised ONNX export is reported as `yolox_s@1280/onnx-int8` (`yolox_net.onnx_is_quantised`). It can no longer
pass as the FP32 detector in run reports or stage-1 checkpoints.

## 4. Cost per analysis: CPU Cloud Run vs L4 (list prices, estimates)

Cloud Run instance-based billing, europe-west6 (same tier as europe-west1/4): $0.000018 per vCPU-s, $0.000002 per
GiB-s, L4 non-zonal $0.0001867/s; re-read 2026-11-21 and equal to the 2026-11-14 snapshot. Free tier: 240,000
vCPU-s and 450,000 GiB-s per month. Overhead (start, model load, shutdown) assumed at 80 s, retries at 5 %. Both are
unmeasured, as in `cost_model.py`.

| Path for a 47-min match | Measured wall | Billed config | Estimate |
|---|---|---|---|
| CPU, release, 47-min held-out match (pre-pilot decision §4) | 11,002 s (2 vCPU) | 2 vCPU / 4 GiB | **$0.51** |
| CPU, release, 46-min held-out match | 13,721 s | 2 vCPU / 4 GiB | $0.64 |
| L4, scaled from the only full L4 run (1,854 s for 34 min) | ~2,563 s | L4 + 8 vCPU / 32 GiB | **$1.09** |

What this means:
- **The CPU path costs about half of the L4 path.** About 10 CPU matches per month fit in the free tier.
- **It is also the path all accuracy evidence was measured on.** CPU/GPU parity is pre-pilot blocker 4, and the GPU
  path abstains more.
- The cost is latency: about 3–4 h per match on 2 vCPU.
- Stage 1 already runs in checkpointed chunks. Fanning the chunks out as parallel Cloud Run job tasks would cut wall
  time to roughly stage-1/N + resolve, at about the same vCPU-seconds. That is a design proposal, not built.
- If the INT8 detector passes the identity replay, the detection share of CPU time drops by about 60 %.
- The LLM text per report stays under $0.01.

Not measured:
- Cloud Run CPU generation. The INT8 gain depends on VNNI. This host has AVX-512 VNNI and AMX; an AVX2-only host
  gains less.
- Cloud Run start and model-load time.
- Whether the full-match wall time splits the same way as the 60 s window.

## 5. Recommended order

1. Owner decision: evaluate the CPU Cloud Run job path as the production candidate, instead of continuing the
   blocked GPU parity search. It needs no new model work.
2. INT8 identity replay on IMG_4809 (section 3). CPU only, offline, no billing.
3. One staging measurement of CPU Cloud Run start/load time and the INT8 speed on its CPU. That needs a billing
   approval.
4. Quality remains bounded by jersey reading on small digits. The synthetic-digit PARSeq fine-tune (E9) still needs a
   GPU session; it was not attempted here.

## 6. INT8 identity replay: how to run it (prepared, not run)

The IMG_4809 proxy (`Downloads/Mobile Devices/IMG_4809_proxy_10fps.mp4` on the owner PC, 1.41 GB, see
`bench/references/img4809_proxy_10fps.json`) was not in the folder shared with this session. Both arms must run in
the same environment and on the same decoded pixels.

```bash
COMMON="--video IMG_4809_proxy_10fps.mp4 --number 20 --kit orange --kit2 white \
  --reference bench/references/img4809_proxy_10fps.json \
  --ground-truth bench/results/5.1/gt_img4809_intervals.json --gate bench/gates/balanced_5.2.json"
SCOUTX_WEIGHTS_DIR=det_fp32 python bench/full_match_benchmark.py $COMMON --out fp32/full_match.json --work-dir w_fp32
SCOUTX_WEIGHTS_DIR=det_int8 python bench/full_match_benchmark.py $COMMON --out int8/full_match.json --work-dir w_int8
python bench/compare_runs.py --reference fp32/full_match.json --candidate int8/full_match.json \
  --gate bench/gates/balanced_5.2.json --out int8_vs_fp32.json      # exit 0 = gate passed, 3 = failed
```

`det_int8` holds `yolox_s.pth` plus the INT8 file renamed to `yolox_s.1280.onnx` (SHA-256 in
`bench/results/int8-20261121/detector_agreement.json`). Expected CPU time here: about 2 h for FP32 and 1.2 h for
INT8.
