# Video Intelligence 4.1 screenshots

Made with the same development-only preview as 4.0 (`node scripts/review-preview/capture.mjs <outDir>`,
412 × 915 viewport, stored at half resolution). Renders of the real components with React Native
Web, **not device screenshots**. Screens 01–12 are unchanged from `../screenshots-4.0/`.

| File | State | Data |
|---|---|---|
| 14-discovering | Discovery running, no report yet: "Looking for #20: 1 of 4 parts scanned", early "Your moments so far" with playable shirt-number sightings | sightings are the **measured discovery output** for IMG_4809 (`tests/fixtures/tracking41-img4809-discovery.json`, images removed); progress counts are fixture values |
| 15-review-with-sightings | Final review (no owner answers) with discovery sightings merged into Best moments as "Shirt number seen · Confirmed on video" | real 4.0 auto report + measured sightings |

The moment-player capture (13) shows real match footage and identifiable players, so it is not
stored in the repository.
