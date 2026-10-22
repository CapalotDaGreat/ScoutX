# Controlled evaluation checklist

Executable checklist for TestFlight / internal evaluation. Record results in
`docs/release/validation-matrix.md` (date, build id, device, iOS version, tester).

**Controlled evaluation may proceed** when: internal release gate is PASS with `--allow-external`,
and the evaluator understands EXTERNAL / NOT VALIDATED items below.

**Public release remains blocked** until EXTERNAL App Check, backups, AI footage approval (if
footage AI is claimed), owner acceptance of SEC residuals, device matrix, and (if claimed)
real-footage CV evaluation are closed.

## Preconditions

| # | Requirement | Expected | Pass / Fail |
| --- | --- | --- | --- |
| P1 | TestFlight build from `main` (note EAS build id) | Install succeeds | |
| P2 | Tester signed in with a non-production sandbox Apple ID | Can open app | |
| P3 | Age band set; under-18 has guardian flow available | Gate works | |
| P4 | `AI_FOOTAGE_PROCESSING_APPROVED` | If **false**/unset: analysis upload must fail closed with a clear privacy message. If **true**: only after provider review is documented. | |
| P5 | CV worker | Stages show unavailable / not deployed; no fabricated tracks | |

## A. Core journeys (still-frame analysis)

| # | Steps | Expected result | Evidence to capture | Pass / Fail |
| --- | --- | --- | --- | --- |
| A1 | Consent gate: pick 2 min clip, open Upload & analyze | Nothing uploads until all acknowledgements ticked; options default off; Cancel → no in-progress job | Screenshot consent sheet; Storage empty for job | |
| A2 | Short clip (~20 s shot) | Mode says frames stay on phone; clip review shows observable / not observable; Storage has `frames/` only (no `video.mp4`) | Console/Storage listing or screenshot of mode line | |
| A3 | Identity confirm | Coaching / strengths appear only after confirm; reject → coaching empty | Before/after screenshots | |
| A4 | Lifecycle default (keep video off) | Notice: original deleted, N cited frames kept; no library item; no seekable original | Lifecycle card + attempt Watch → timestamp-only / noVideo copy | |
| A5 | Keep video on | Video in media library; seek works | Library screenshot | |
| A6 | Withdraw mid-run | Job cancelled; temp media gone after sweep | Job status cancelled | |
| A7 | CV honesty | Technical/tactical/stages show unavailable for tracking/events/pitch; unknown stats show "—" not 0 | Report stages screenshot | |
| A8 | Corrections | Dispute possible event / Not me; numbers unchanged; undo works | Feedback UI screenshot | |
| A9 | Languages | Repeat A1 in de, fr, es, it, pt, nl | No truncation / English leftovers | |

## B. Upload reliability

| # | Steps | Expected | Evidence | Pass / Fail |
| --- | --- | --- | --- | --- |
| B1 | Force-quit at ~40% of a 45 min upload; reopen | Resume from committed offset, not 0% | Progress screenshot before/after | |
| B2 | Airplane 2 min at ~60% | Continues; ETA "estimating" until stable | | |
| B3 | Replace file same name before resume | Refused (file changed) | Error copy | |
| B4 | iCloud cloud-only file | Preparing while downloading; offline → clear error | | |
| B5 | Low storage (<1 GB free) + large pick | Clear message; no orphan in pending-uploads | | |

## C. Sandbox purchases (CONFIG_REQUIRED: RevenueCat `appl_` key)

| # | Steps | Expected | Evidence | Pass / Fail |
| --- | --- | --- | --- | --- |
| C1 | Free account: open Plan / usage | Free limits shown (3 frame / 1 full match / 2 reels per period) | Screenshot | |
| C2 | Adult tester: present paywall from Settings only | Paywall opens; under-18 does not see auto promo | | |
| C3 | Sandbox purchase Premium | Server entitlement becomes premium/trial; usage summary updates without relying on client flag | RevenueCat + app usage screen | |
| C4 | Restore purchases after reinstall / sign-out/in | Entitlement restored; metered features unlock | | |
| C5 | Expire / cancel in sandbox (if available) | Falls back to free limits; essential safety features still work | | |
| C6 | Guest account | Cannot purchase; no Premium | | |

## D. Safety / privacy smoke

| # | Steps | Expected | Pass / Fail |
| --- | --- | --- | --- | --- |
| D1 | Report / block | Works without Premium | |
| D2 | Account deletion | Recent sign-in required; completes or clear error | |
| D3 | Under-13 / guardian | Private mode; no discovery/contact without consent | |

## External / not this checklist

- App Attest registration (SEC-15)
- Backups + restore drill (`docs/security/backups.md`) — **no restore has been run**
- Owner acceptance of SEC-10–14, 17–18 (`docs/release/owner-acceptance.md`)
- Real-footage CV evaluation / worker deploy
- Independent pentest / counsel review

## Sign-off

| Role | Name | Date | Controlled evaluation OK? | Public release OK? |
| --- | --- | --- | --- | --- |
| Tester | | | Yes / No | No (unless all public blockers closed) |
| Owner | | | Yes / No | No |
