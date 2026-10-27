# Video Intelligence 4.0 screenshots

Made by `node scripts/review-preview/capture.mjs <outDir> [excerpt.mp4]`. The script exports a
development-only preview entry (`scripts/review-preview/`, not part of the app) to static web,
renders it with Playwright at a 412 × 915 phone viewport and saves full-page captures (stored here
at half resolution). These are renders of the real components with React Native Web, not device
screenshots.

Data: the tracking reports are the **recorded worker output for IMG_4809 / orange #20**, validated by
the server parser (`functions/src/analysis/trackingV3.ts`). Thumbnail images were removed from the
fixtures, so cards show the time instead of a picture. **Progress states (parts done, timestamps,
time left) are fixture values**, not a measured run.

| File | State | Data |
|---|---|---|
| 01-workspace | Analysis just started, nothing measured yet (no time estimate is shown) | fixture progress |
| 02-early-results | 3 of 8 parts done, preliminary report, "Is this you?" moments while extraction continues | auto report cut to 12:00; its coverage numbers are still the full-match ones (preview simplification) |
| 03-review-simple | Final review, simple view | real report after 39 owner answers |
| 04-review-auto | Final review without any owner answers | real report, no answers |
| 05-review-detailed | Detailed view: match story strip and analysis details | real report after answers |
| 06-scout-view | Evidence only: confirmed moments, coverage, limitations; no coaching | real report after answers |
| 07-coach-illustrative | Coach with strengths, an improvement, drill and timestamp links | **synthetic actions** added to the real report to show the layout; the real recording has no measured target ball actions |
| 08-interrupted | Interrupted analysis with resume action | fixture progress |
| 09-review-de / 10-early-es | German and Spanish | as 03 / 02 |
| 11-ask-km / 12-ask-identity | Ask PitchProof refusing an unmeasurable question / answering from coverage | real report, no answers |

A moment-player capture (real match footage with the target outline at 32:36) was produced as well
but is not stored in the repository because it shows identifiable players.
