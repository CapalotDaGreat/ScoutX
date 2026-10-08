# Data Protection Impact Assessment (DPIA)

Status: draft prepared by engineering from the implementation. **LEGAL REVIEW REQUIRED** before it
can count as a DPIA under Art. 22 FADP / Art. 35 GDPR. Risk ratings are engineering estimates.

## Why a DPIA is needed

PitchProof processes data of minors (13–17), video showing identifiable people, AI analysis of that
video, movement data, and enables contact between adult scouts and young players. Each one alone
points to a high-risk assessment; together they make it mandatory.

## Scope

iOS app, Cloud Functions backend, Firebase Hosting pages (guardian approval). Out of scope: the
marketing site on Cloudflare.

## 1. Minors

| Risk | Likelihood / impact | Measures in place | Evidence | Residual |
| --- | --- | --- | --- | --- |
| Under-13 users sign up | Medium / high | Age band asked before any data entry; `under13` accounts are private (no public profile, discovery, contact, trials, endorsements, sharing), locked until a parent signs a consent form and confirms it from a second email, and deleted after 14 days without consent; only AI analysis can be granted; only the band is stored | `tests/unit/safetyPolicy.test.ts`, rules "under-13 private mode", `guardianFlow.test.mjs` | Medium (self-declared age; email-plus consent cannot prove parenthood) |
| Minor appears publicly without guardian approval | Medium / high | Public Passport, discovery, public media, public movement each need a separate guardian scope; enforced in rules and server projection | `firestore.rules`, `functions/src/safety/projectionSync.ts`, `tests/rules/firestore.rules.test.mjs` | Low |
| Forged guardian approval | Low / high | HMAC-signed link (`GUARDIAN_LINK_SECRET`), 7-day expiry, sent to the guardian email by the server, decision only on the web page | `functions/src/safety/guardianToken.ts`, unit tests | Medium: the guardian email is player-supplied |
| Adult scout contacts a minor directly | Medium / high | No direct messaging. Scouts reach players only through PitchProof requests; requests to minors need `scout_contact` and notify the guardian (`notifyGuardianOfScoutContact`); trial acceptance by a minor needs guardian co-approval (`firestore.rules` `trialInvitations`) | `tests/rules/requestCenter.test.mjs`, rules "youth safety" | Low |
| Lock-screen exposure | Medium / medium | Minors always get generic push text; accounts without an age band fail closed | `tests/rules/pushChain.test.mjs` "lock-screen privacy" | Low |
| Age details exposed | Low / medium | Public views show only a "Youth" label | `ageGroupLabel` in projections | Low |
| Upselling to minors | Medium / low | Promotions hidden for minors; nothing safety-related is paywalled | `canSeePromotions`, `NEVER_PAYWALLED` | Low |

## 2. Video

| Risk | Measures | Residual |
| --- | --- | --- |
| Bystanders or other players filmed without consent | Upload acknowledgement and rights confirmation; media private by default; "I appear in this video" report reason; takedown flow | Medium: PitchProof cannot verify consent of everyone in a match video |
| Malicious files | Quarantine bucket path, server-side ffprobe validation, type/size/duration limits, no user access to quarantine. **No malware scanning is performed or claimed** | Medium |
| Leaked private media | Storage rules owner-only, time-limited signed URLs for grants and exports | Low |
| Analysis footage kept longer than needed | Per-video consent; source deleted at job end unless "Keep match video"; uncited frames and intermediates deleted; only cited frames (identity frames capped at 6) kept; evidence clips opt-in only; failed jobs 24 h / 7 days; hourly sweep; purge on delete | Low |
| Short clips uploaded when frames would do | Clips up to 60 s are sampled on the phone; only frames upload (`processingMode: device_frames`) | Low |
| Bystanders identified by the analysis | No facial recognition; target found by jersey number and kit colour; CV worker contract forbids retaining non-target identities and rejects requests that ask for it | Low–medium |

## 3. AI analysis

| Risk | Measures | Residual |
| --- | --- | --- |
| Provider retains or trains on data | `data_collection: 'deny'` and `zdr: true` on every request; key only in Cloud Functions secrets | Medium until ZDR availability is confirmed for the chosen model (NOT VALIDATED) |
| Wrong or overstated conclusions about a player | Coverage and confidence attached to results; per-section availability (AVAILABLE / LIMITED / INSUFFICIENT_EVIDENCE / NOT_AVAILABLE); every claim must cite existing frames; still-frame events are "needs review" and never counted; coaching held back until the player confirms identity; computer-vision stages NOT AVAILABLE until an evaluated worker is approved | Medium |
| Prompt injection via user text | Prompt builder separates instructions from user content; validator with injection fixtures | Low–medium |
| Automated decisions about players | PitchProof does not make recruitment decisions; scouts see evidence and its source | Low |

## 4. Movement ("GPS") sessions

| Risk | Measures | Residual |
| --- | --- | --- |
| Location tracking | Foreground "While Using" permission only; background location disabled in `app.json`; fixes converted in memory to metres relative to the session start; latitude/longitude never stored, uploaded or logged | Low |
| Re-identification of home/club location from heatmaps | Heatmaps are relative and have no geographic anchor | Low |

Because no location is stored, movement sessions are available to every permitted age group.

## 5. Scouting

| Risk | Measures | Residual |
| --- | --- | --- |
| Profiling of players | Players control visibility; discovery requires opt-in (and guardian scope for minors); scouts' notes are private to the scout | Medium |
| Misleading "verified" claims | Every Passport item is labelled with its source; no "verified" wording for self-reported data | Low |
| Harassment | Block, report, moderation with priority for minor-related reports, staff audit log | Medium |

## Data subject rights

Access and export (`requestDataExport`), correction (in app), deletion (`deleteAuthenticatedAccount`),
objection and consent withdrawal (Privacy Center, `privacyRequests`). Reply deadline 30 days.

## Open items

1. LEGAL REVIEW REQUIRED: legal bases, retention periods, EU guardian age thresholds, transfer safeguards.
2. NOT VALIDATED: ZDR availability, production App Check enforcement, real push delivery.
3. EXTERNAL CONFIGURATION REQUIRED: privacy and security contacts, SMTP provider, RevenueCat deletion.
4. Server-side recent sign-in for account deletion (SECURITY REVIEW REQUIRED).
