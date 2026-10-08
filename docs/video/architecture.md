# Video Intelligence Architecture

Status: **PRODUCTION LIMITED**. The deployed pipeline reviews still frames with a vision model.
Continuous tracking, event detection and pitch mapping need the computer-vision worker, which is
implemented as a reference (`workers/football-cv`) but **not deployed and not evaluated**.

## Flow

1. **Pick** — Photos (`matchVideoPickerService`) or Files / iCloud (`matchVideoFilePickerService`,
   duration read from the file with `expo-video`, free-space check).
2. **Describe the target** — jersey number (required), kit colours, team name, position, intent
   (match / training) and, for short clips, what happens in the clip. All of it reaches the model
   only as untrusted `USER_METADATA`.
3. **Mode** — `selectAnalysisMode` (shared byte-for-byte by `src/features/match-analysis/services/analysisMode.ts`
   and `functions/src/analysis/mode.ts`):

   | Mode | Duration | Processing |
   | --- | --- | --- |
   | `SHORT_CLIP` | ≤ 60 s | `device_frames`: 8–32 frames sampled on the phone; the video is never uploaded |
   | `TRAINING_CLIP` | ≤ 20 min, intent training | `device_frames` if ≤ 60 s, else `cloud_video` |
   | `MATCH_CLIP` | ≤ 20 min | `cloud_video` |
   | `FULL_MATCH` | ≤ 150 min | `cloud_video` |

   The server sets the mode in `recordVideoProcessingConsent` and re-derives it from the ffprobe
   duration in quarantine, so a client cannot route a full match through the clip path.
4. **Consent** — `VideoConsentSheet` → `recordVideoProcessingConsent` writes
   `videoProcessingConsents/{jobId}` (four acknowledgements, providers, policy version
   `2026-10-video-v1`, keep-video / keep-for-retry / evidence-clips, all default false).
   `assertVideoConsent` is checked by upload sessions, frame analysis and every segment review.
   `revokeVideoProcessingConsent` cancels the job and discards uploads.
5. **Upload** (cloud only) — resumable GCS session → quarantine → ffprobe → promotion.
6. **Extraction** — 10-minute `extract_segment` Cloud Tasks; ffmpeg frames per segment.
7. **Review** — with ≥ 2 segments: `review_segment` per segment (observations only on frames where
   the target is visible, possible events always `needs_review`), progress in `segmentReview`;
   then `synthesize_report` (strengths / improvements / ≤ 3 opportunities / decision moments, each
   citing observation ids). Otherwise one frame analysis (`runFrameAnalysis`), or the clip prompt
   for server-set short clips.
8. **Identity** — coaching written before the player confirmed identity is stored in
   `pendingCoaching` and only released by `confirmAnalysisIdentity`; rejection discards it.
9. **Report** — sections with availability and reason codes, `versions` (analysis version,
   pipeline, models, CV worker version), previous reports archived in `reports/{version}`.
   Statistics stay null; `eventCounts` exists only for validated tracker events.
10. **Lifecycle** — see `media-lifecycle.md`.

## Computer-vision worker

- Contract v2 (`functions/src/analysis/cvContract.ts` ⇄ `workers/football-cv/app/contract.py`).
  Privacy flags must be `false`; responses are validated again on the Functions side.
- Gating (`functions/src/analysis/cvConfig.ts`): `CV_WORKER_URL` (https) **and**
  `CV_WORKER_APPROVED=true`, otherwise every CV stage is `unavailable`. Events additionally need
  `CV_EVENTS_VALIDATED=true`. The release gate fails if either flag is set without a passed
  evaluation in `accuracy-report.md`.
- The worker does identity (jersey OCR ≥ 3 confident reads, kit colour as candidate only, no
  faces), availability windows (`CONFIRMED_VISIBLE`, `LIKELY_ACTIVE_OFF_CAMERA` only for short gaps
  on a wide camera, otherwise `UNKNOWN`; never `CONFIRMED_OFF_PITCH`) and coverage. Events and pitch
  stages report `unavailable`.

## Prompt-injection safety

`buildPrompt` separates SYSTEM, TRUSTED, USER_METADATA (data, never instructions) and OUTPUT.
Normalizers drop any claim citing unknown frames, clamp timestamps to frame times and cap lengths.
