# Video Intelligence 5.0 screenshots

Same development-only preview as 4.0/4.1 (`node scripts/review-preview/capture.mjs <outDir>`,
412 × 915 viewport, stored at half resolution). Web renders of the real components, **not device
screenshots**.

| File | State | Data |
|---|---|---|
| 16-review-50-offball | Review with the measured off-ball section: match-level observation and the clip-level sequence 22:36–22:44, each with interpretation kept separate | **5.0 engine output** for IMG_4809 with the 39 owner answers and the 7 discovery sightings (`tests/fixtures/tracking50-img4809-answers.json`, images removed), validated by the server parser |
| 17-focus-followup | Detailed view with "Your focus from earlier matches": evidence for a positioning focus, "not enough footage" for a passing focus | same report; the two saved focuses are **fixture goals** |
| 18-review-50-de | German | as 16 |

The "Follow me" player view needs match footage and is not stored here (identifiable players).
