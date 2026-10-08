# Computer-vision evaluation evidence

This folder holds the evidence that approves one exact build of the football-cv worker. It is empty
on purpose: no real-footage evaluation has been done. Never put footage or annotations with
personal data here; the manifest and report contain ids, hashes and counts only.

Files, once an evaluation exists:

- `manifest.json`: the dataset manifest (`workers/football-cv/eval/manifest.schema.json`).
- `report.json`: unedited output of `python -m eval.evaluate`.
- `approval.json`: the record below.

```json
{
  "schemaVersion": 1,
  "workerVersion": "football-cv/x.y.z",
  "models": { "detector": "…", "tracker": "…", "jerseyReader": "…", "decoder": "…" },
  "datasetId": "…",
  "manifestPath": "docs/video/evaluation/manifest.json",
  "manifestSha256": "…",
  "reportPath": "docs/video/evaluation/report.json",
  "reportSha256": "…",
  "thresholdsSha256": "…",
  "evaluatedAt": "YYYY-MM-DD",
  "approvedAt": "YYYY-MM-DD",
  "approver": { "role": "product owner" },
  "securityReview": { "completedAt": "YYYY-MM-DD", "reference": "…" },
  "scope": { "identityAndAvailability": true, "events": false }
}
```

Hashes are SHA-256 of the file with CRLF normalised to LF. `models` must equal the `models` the
worker reports in every response. Check with `node scripts/cv-approval.mjs`; compile into Functions
with `--write`. An absent or invalid record compiles to `null`, which keeps the worker off.
