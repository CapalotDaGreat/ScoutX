# Video Intelligence 5.0 — research and decision record (2026-10-27)

Scope: what comparable products and research show, which technologies fit PitchProof, and what
5.0 adopts, defers or rejects. Facts about third-party products come from their public
documentation (sources at the end) and can change; nothing here was measured on their systems.

## 1. Comparable products

| Product | How the player is found | Time to results | What it gives the player | Lesson for PitchProof |
|---|---|---|---|---|
| Veo Player Spotlight / Player Moments | Automatic **shirt-number detection** plus rules for "involved in the action"; users link numbers to a lineup; numbers 1–25 work best; low contrast, stripes, sun glare and covered numbers reduce accuracy; detected numbers cannot be edited | Staged: Follow-cam within ~1 h after upload for a 90-min match, AI clips ~5 min later, Analytics and Player Spotlight up to ~1 h after Follow-cam | Per-player playlists of moments, analytics add-on | Even the market leader needs readable numbers and ~2 h; staged results are normal. PitchProof's discovery pass is the same idea, delivered per sighting |
| Veo Coach Assist | — | Only after full processing | Chat over **structured match data sent as text** (events, possession, notes); no video sent to the AI provider; general reference, "check suggestions against footage" | Ask PitchProof answering from structured evidence first is the right default; video reasoning must be an explicit, optional extra |
| Trace (PlayerCam / PlayerFocus) | Player-centred camera on the selected player | Hours (service) | Watching yourself, auto highlights | Video stays central; player-centred viewing is valued → 5.0 adds a "Follow me" virtual camera, bounded so context stays visible |
| Hudl Wyscout | Professional event data, tagged footage | Professional workflows | Searchable event video, comparisons, scouting reports | The Football Passport should show verifiable clips, not unexplained ratings |

## 2. Research results relevant to our bottlenecks

**Jersey-number recognition (our identity anchor).** The strongest public pipeline for the
SoccerNet jersey task (Koshkina & Elder, *A General Framework for Jersey Number Recognition*)
reaches 87.45 % tracklet accuracy on SoccerNet test: a **legibility classifier** (ResNet34)
removes illegible frames, pose-guided torso crops, **PARSeq** scene-text recognition, and
confidence-weighted voting over the tracklet. Ablation: filtering occluded frames improved
accuracy (87.45 vs 84.56 %). Legible frames are rare (~5 % in their hockey data). This matches
IMG_4809: "20" is readable in a handful of instants. PitchProof already uses PARSeq (docTR,
Apache-2.0) + EasyOCR agreement and tracklet voting; the missing piece is a legibility filter —
which would need training data. **Decision:** no learned legibility model in 5.0 (no licensed
training data in reach; customer footage is not training data); instead OCR effort is spent
where evidence appears (5.0 evidence-driven refinement, below).

**SoccerNet data.** Labels and several tasks (jersey-2023, tracking-2023, reid-2023,
calibration-2023) download without the NDA password via the SoccerNet SDK; videos and the
ball-action task need an NDA password. The SDK is MIT; the data terms are research-oriented and
must be checked before any commercial use. **Not reachable from this session** (network
allowlist), so no SoccerNet benchmark was run. **Decision:** use SoccerNet only as an external
benchmark after a licence review; never for training without it.

**Ball action spotting.** SoccerNet 2025 team ball-action spotting: winner 60.03 Team-mAP@1 on
broadcast footage (12 classes); baseline T-DEED 51.72. Broadcast-trained models do not transfer
directly to a phone on the sideline, and our ball is visible in only ~30 % of frames. **Decision:**
improve ball evidence first (5.0 colour gate, measured below); event models later, behind
validation.

**Person re-identification.** OSNet code (torchreid) is MIT, but its public weights are trained
on Market-1501 / DukeMTMC / MSMT17, whose terms are research-only (DukeMTMC was withdrawn).
**Decision:** no third-party re-ID weights. Identity keeps using match-scoped colour/appearance
features computed on the fly (no persistent biometric template, no face recognition).

## 3. Video understanding (multimodal) options

| | Gemini API (direct) | OpenRouter → Gemini (already integrated) | TwelveLabs | Self-hosted VLM (e.g. Qwen-VL family) |
|---|---|---|---|---|
| Video input | Native video; 1 fps default, custom fps and start/end clipping; ~100 tokens/s (low res) to ~300 tokens/s; up to 3 h at low res | Images (we send ≤ 6 stills of one clip) | Indexing + search + generation over uploaded video | Frames / short video, on our GPU |
| Timestamp handling | MM:SS references; 1 fps may miss fast action (docs) | Our frame ids → our timestamps (model cannot invent times) | Segment-level | Depends on model |
| Data use | Paid tier: prompts/responses not used for product improvement by default; logs kept up to 55 days (configurable 7–55) for billing-enabled projects | Existing route requests **zero data retention** (`provider.zdr`, `data_collection: deny`) and fails rather than falling back | Plans priced by storage/workload; retention/training terms not stated on the pricing page | Stays in our infrastructure |
| Fit | Good for longer temporal questions later | **Best fit now**: privacy contract, consent gates and output validator already exist | Useful for natural-language clip search across many matches; adds a new processor | Highest control, highest ops cost |

**Decision (5.0):** a clip-based, consent-gated reasoning layer on the existing OpenRouter
zero-retention route: at most 6 still frames of ONE confirmed clip (≤ 20 s), target outlined,
strict JSON schema, server-side validation that rejects unknown frames, any number except the
shirt number and frame clocks, and claims about goals, assists, distances, speeds, ratings or
percentages. Off by default (`VIDEO_REASONING_ENABLED`), and also gated by the operator footage
approval, the owner's AI consent (+ guardian scope) and the match's video consent listing the
provider. **Not evaluated for quality**: no provider is reachable from this session.

## 4. GPU infrastructure

* **Cloud Run GPU**: NVIDIA L4 (24 GB) or RTX PRO 6000; L4 needs ≥ 4 vCPU / 16 GiB (8 / 32
  recommended); instance-based billing for the whole instance lifetime; scale to zero; ~5 s
  start with drivers pre-installed; default regional quota 3 GPUs; zonal redundancy costs more.
  europe-west1 and europe-west4 offer L4. **Recommended** first production target: one request per
  instance, scale to zero, zonal redundancy off for batch analysis.
* **ONNX Runtime GPU / TensorRT EP**: plausible 2–5× on detection versus PyTorch fp32, FP16
  needs accuracy re-validation. Not measurable here.
* **DeepStream**: maximum throughput for live multi-stream video; heavy integration and a
  different licence stack. Not needed for per-match batch processing. **Rejected for now.**
* **NVDEC (ffmpeg -hwaccel cuda)**: the 5.0 decoder accepts `SCOUTX_HWACCEL=cuda`; colour
  conversion stays explicit (below), so hardware decoding cannot silently change colours.

## 5. HDR colour handling (resolved in 5.0)

iPhone footage is 10-bit HLG BT.2020. OpenCV's FFmpeg backend converts it with an undocumented
path; none of the more than a dozen standard ffmpeg conversions tried matched it (best mean |Δ| 9.7 grey levels). 5.0 defines one
explicit working space (8-bit BT.709 SDR): SDR is converted with the tagged matrix (bit-identical
to OpenCV on 8-bit BT.709 — measured), HLG with the BT.2408 reference white (203 cd/m²), PQ with
Hable tone mapping. On 94 randomly sampled, developer-labelled detections the explicit HLG
conversion classifies the orange kit at least as well as OpenCV (recall 0.83 vs 0.80; 0 vs 1
false positive at the calibrated 0.30 threshold) → **no recalibration needed**, thresholds
unchanged. Single annotator, one recording — to be repeated on the new recordings.

## 6. Decisions summary

| Adopt in 5.0 | Defer | Reject |
|---|---|---|
| Explicit colour pipeline + multi-threaded ffmpeg decode (discovery) | ffmpeg decode for stage 1 on HDR (needs identity re-evaluation) | DeepStream (not needed for batch) |
| Evidence-driven discovery refinement, 416 px overview, ROI re-detection | Learned legibility filter (needs licensed data) | Third-party re-ID weights trained on research-only datasets |
| Clip-level off-ball sequences with evidence-specific thresholds | Ball-action model (needs validation data) | Sending whole matches to an AI model |
| Consent-gated clip reasoning on the ZDR route (off by default) | TwelveLabs search (new processor, terms) | Any statistic generated by a model |
| Match-adaptive ball colour gate | TensorRT FP16 (needs GPU + accuracy check) | |

## Sources

* [Veo: Overview of Player Spotlight / Player Moments](https://support.veo.com/hc/en-us/articles/27698176364817-Overview-of-Veo-Player-Spotlight-How-to-track-and-follow-players-in-your-Veo-recordings)
* [Veo: Processing times after uploading a recording](https://support.veo.com/hc/en-us/articles/37891575336849-Processing-times-after-uploading-a-recording-to-your-Veo-Clubhouse)
* [Veo: Getting started with Coach Assist](https://support.veo.com/hc/en-us/articles/44191212222097-Getting-started-with-Coach-Assist)
* [Trace PlayerFocus announcement](https://www.businesswire.com/news/home/20230502005375/en/Trace-Launches-PlayerFocus-an-Affordable-Video-Highlights-Service-for-Youth-Soccer)
* [Hudl Wyscout](https://www.hudl.com/products/wyscout)
* [A General Framework for Jersey Number Recognition in Sports Video](https://arxiv.org/html/2405.13896v1)
* [SoccerNet 2025 Challenges Results](https://arxiv.org/html/2508.19182v1)
* [SoccerNet SDK (PyPI)](https://www.pypi.org/project/SoccerNet/0.1.57/)
* [Gemini API: video understanding](https://ai.google.dev/gemini-api/docs/video-understanding)
* [Gemini API: data logging and sharing](https://ai.google.dev/gemini-api/docs/logs-policy)
* [TwelveLabs pricing](https://twelvelabs.io/pricing)
* [Cloud Run: GPU support for services](https://docs.cloud.google.com/run/docs/configuring/services/gpu)
