# Tracking recovery implementation - 2026-10-24

## Status

Worker build: `football-cv/0.5.0`. HTTP contract remains version 2. This build is
not approved for production. `APPROVED_CV_WORKER` remains `null`; its SHA-256 is
unchanged at `cb883f3fff38528b3fcb58044af4d74ac3c20686aed8e787437a38db7aa5e753`.

Orange jersey #8 in the requested 140-minute Veo recording has **not** been
evaluated. The web retrieval tool could not access the recording; the browser
attempt was denied permission to access `app.veo.co`. No alternate browser,
network route, authenticated endpoint or stream extraction was attempted after
that denial. No recording was fetched, uploaded, trained on or added to a dataset.

## Implemented

The detector and orchestration previously discarded detections below 0.4 before
ByteTrack received them. That prevented its lower-confidence association stage
from using those observations for anonymous trajectory continuity.

- `workers/football-cv/app/backends.py`: RT-DETR now retains detections above the
  0.1 tracking floor. ByteTrack explicitly uses a 0.4 activation threshold.
  Its installed implementation also applies its own new-track threshold; weak
  detections do not independently initialize identities.
- `workers/football-cv/app/pipeline.py`: shared tracking/identity thresholds;
  finite geometry/confidence validation and clipping before tracking and OCR;
  below-0.4 detections skip OCR and have no readable-jersey evidence. They cannot
  confirm target observations or increase target-visible coverage. Camera-view
  estimation still uses only detections at or above the original 0.4 threshold.
- `workers/football-cv/tests/test_tracking_recovery.py`: twelve new synthetic
  regression cases, including execution of the installed Supervision ByteTrack
  with high-low-high detections and direct detector-threshold verification.
- `workers/football-cv/tests/test_worker.py`: corrected the fake tracker to assign
  distinct IDs to simultaneous detections. Previously both people received `t1`,
  but the low-scoring second detection was filtered before reaching that fixture.

The thresholds are uncalibrated engineering settings, not accuracy probabilities.
The test proves anonymous ID continuity on a controlled geometry sequence, not
correct player identity during occlusions or a football match.

No dependency, embedding model, face recognizer, production flag, consent gate,
source authorization rule or evidence persistence policy was added or weakened.
The only outputs remain the existing contract/evaluation outputs. Events and
pitch mapping remain explicitly unavailable; they are not guessed from tracking.

## Research Basis

[ByteTrack's official repository and paper](https://github.com/FoundationVision/ByteTrack)
describe using low-score detections to recover existing trajectories rather than
discarding them. That supports restoring its intended association input. It does
not establish that the current detector, OCR or sampling rate is suitable for
this Veo recording.

[SoccerNet's Game State Reconstruction implementation](https://github.com/SoccerNet/sn-gamestate)
separates person detection, tracking, jersey recognition, team affiliation and
pitch calibration, and evaluates the combined system. Its baseline includes
additional representation and tracklet aggregation stages. No baseline weights,
dataset or automatic-download pipeline was installed here. Those additions need
license review, match-scoped retention design and held-out football evaluation.

[SoccerNet's re-identification task](https://www.soccer-net.org/tasks/re-identification)
also treats linking players across viewpoints as an independently measured task.
A persistent tracker ID or a matching kit is not sufficient identity evidence.

[Veo's official recording export instructions](https://support.veo.com/hc/en-us/articles/4451733961361-How-to-download-your-Veo-recordings)
document authorized Follow-Cam MP4 exports with team/club access requirements.
This is not proof of a supported third-party ingestion API. No undocumented API
or public-link download capability is claimed. The similarly named
`developer.veo.co.uk` service was not treated as an integration for `app.veo.co`.

## Verification

Run from `workers/football-cv`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Result: **350 passed**, one existing Starlette/httpx deprecation warning, no
skips. This includes source/PTS verification, coordinator and production gates,
wrong-kit/duplicate-jersey cases, camera cuts, re-entry, halftime and independent
full-match review/report tests. These are synthetic/local test results, not
measured orange #8 accuracy.

From the repository root:

```powershell
node --import ./tests/unit/support/register.mjs --test tests/unit/cvEvidence.test.ts tests/unit/identityCoordinator.test.ts
npm run build --prefix functions
node scripts/cv-approval.mjs
git -c core.whitespace=cr-at-eol diff --check
```

Results: **13 TypeScript contract/gate tests passed**, Functions build passed,
approval remained absent and whitespace check passed. No production deployment
was performed for this worker change.

## Remaining Real-Match Requirements

1. Authorized media-frame access to the exact orange #8 recording, through an
   approved provider integration or authorized local export. A viewing URL alone
   is not a consumable media source in the current system. Browser access also
   requires a new user approval after the denial above.
2. Readable orange #8 reference frames and independently reviewed exact-PTS
   anchors. Do not substitute the earlier orange #20 source or its timestamp.
3. Independent, blinded labels across the whole recording, including non-play,
   similar kits, duplicate numbers, camera cuts and re-entry. The existing
   [full-match validation protocol](full-match-validation.md) supplies the exact
   preparation, sealing, inference and accuracy-report commands.
4. Compare the old and new worker builds on the same sealed holdout: wrong-player
   claims, target recall, visibility precision/recall, abstention and difficulty
   subsets. Report denominators and uncertainty; do not count unknown frames as
   correct tracking. Do not tune on the sealed holdout and then call it independent.
5. Only consider model training after there is lawful, labeled training material,
   a separate validation/test split, explicit storage/compute authorization and
   a baseline showing what needs improvement. Training repeatedly on one match
   cannot demonstrate generalization or guarantee perfect tracking.
6. Obtain the existing immutable CV approval for the new worker/model set after
   accepted real-footage evidence. This implementation does not grant it.

The current conservative identity policy still requires locally supported jersey
reads. Low-confidence trajectory recovery does not implement reliable continuous
identity when #8 is unreadable, off camera or heavily occluded. That remains a
substantive flagship blocker, not a completed feature hidden by passing tests.
