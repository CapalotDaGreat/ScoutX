# R3 decision request: tracking reports and images in access requests and the account archive

For: the owner, and counsel. Status: **open** (no decision recorded in the repository as of 2026-11-19). Current behaviour
is kept until a decision is recorded; any change needs its own reviewed implementation and validation.

## What the code does today (verified on candidate `65d9868`)
- **Ordinary report download:** none exists for tracking reports. Share cards, football CV, career replay and reel
  export read no tracking data; the report is only shown in the app from `tracking/current` under the database rules.
- **Account archive** (Privacy Center → `requestDataExport` → Cloud Task `buildDataExport` →
  `exports/{uid}/{id}/scoutx-data-export.json`, 7-day links): contains the match-analysis job documents (status, tracking
  run state, cleanup state, frame and video paths), owner corrections and the target-only identity summary. It contains
  **no tracking report in any state** (released, held, withheld, discarded, superseded) and **no review or discovery image
  paths or links**; held paths are excluded from links by code. Emulator archives with released, held, withheld,
  reprocessed and cancelled jobs confirmed this (`r3.*` checks, ledger §29/§30).
- In the app, a released report and its images are visible to the owner only; held and withheld material is never
  client-readable; superseded and discarded images are deleted (retention matrix, 2026-11-19 rows).

## What the policy drafts say (both marked `effectiveDate: LEGAL_REVIEW_REQUIRED`, last changed 2026-10-25)
- Privacy Policy: "You can access, correct, export and delete your data … Most of this is available directly in the
  Privacy Center. For anything else contact {{privacyEmail}}." and "Rights have legal conditions and exceptions …".
- Your Data Protection Rights: "Portability does not cover every internal record or another person's information." and
  "Under Swiss rules the ordinary access-response period is 30 days; where the GDPR applies it is one calendar month."
  "We may ask for proportionate information to verify your identity or authority to act for someone else."
- Retention matrix: tracking images and source-video rules are "Product decision (not lawyer-reviewed)".
None of these says whether a tracking report or its images belong in the archive, or how held/withheld copies are treated.

## Decisions needed (please answer each; "not decided" is a valid answer)
1. **Archive content.** Should the account archive include the *current released* tracking report: (a) report data only,
   (b) report data and its review images, (c) neither (current behaviour)?
2. **Non-released material in an access request.** For held (not yet reviewed), withheld (contained after release),
   superseded (replaced by reprocessing) material, and discarded material if any copy is still retained: include,
   describe without disclosing, or exclude — and on what basis?
3. **Other people.** Review and discovery images are crops of match footage and can show other players, including
   minors. Should images be included, redacted/cropped further, or provided only on request with review?
4. **Manual process.** If any of this is answered manually: who owns it (name/role), how identity and scope are verified
   (account sign-in, guardian authority for minors), how material is delivered (secure link, expiry), and which response
   deadline applies — counsel to confirm the 30-day (Switzerland) / one-month (GDPR) wording in the draft before it is
   relied on.

## Effect on the pilot and on staging
- **Blocks the participant pilot:** decision 1 and 4 at least (participants can request their data from day one); 2 and 3
  before any held/withheld material exists for a participant.
- **Does not block staging:** the staging checks verify the *current* contract (nothing tracking-related in the archive;
  ordinary app paths respect report visibility) and can proceed independently.
