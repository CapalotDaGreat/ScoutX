# Data Inventory and Processing Register

Controller: CML Electronics, Höglerstrasse 55, 8600 Dübendorf, Switzerland (`src/config/legalConfig.ts`).
Privacy contact: support@pitchproof.online. No data protection officer and no EU representative have been appointed.
Governing law: Swiss law (revised FADP). The GDPR is considered where EU/EEA users are served.

Status markers: **LEGAL REVIEW REQUIRED** marks a legal basis or period a lawyer must confirm.
Nothing in this register has been reviewed by counsel yet.

## 1. Data inventory

| # | Category | Fields | Where stored | Source | Visible to |
| --- | --- | --- | --- | --- | --- |
| D1 | Account | uid, email, display name, sign-in provider | Firebase Auth, `users/{uid}` | User | Owner |
| D2 | Role | `player` / `scout` / `coach` | `users/{uid}` | User | Owner, server |
| D3 | Age band | `under13` / `13-17` / `18plus` only (no date of birth) | `userSafety/{uid}` (server-written) | User | Owner, server |
| D4 | Guardian | guardian email, decision, granted scopes, consent version, expiry | `guardianContacts/{uid}`, `youthConsents`, `userSafety/{uid}` | Player, guardian via signed link | Owner (status only), server |
| D5 | Profile | club, positions, foot, nationality, biography, career history | `players/{uid}` | User | Owner; public projection only if allowed (D17) |
| D6 | Football data | match logs, stats, goals, training, notes | `players/{uid}/matches`, `developmentGoals`, `trainingSessions`, ... | User | Owner |
| D7 | Media | videos, photos, reels and their metadata | Storage `profiles/{uid}/...`, `players/{uid}/media`, `reels`, `reelExports` | User | Owner; others only via visibility or grants |
| D8 | Upload quarantine | unvalidated bytes, ffprobe result, fingerprint (SHA-256 of size plus first/last 8 MiB) | Storage `quarantine/{uid}/...`, `mediaUploads`, `mediaUploadSessions` | User, server | Server only |
| D9 | Analysis | extracted frames, AI observations, coverage and confidence, highlight candidates | `matchAnalysisJobs`, Storage `profiles/{uid}/matchFootage/{jobId}/frames/` | Server, AI provider | Owner |
| D10 | Movement sessions | distance, speed, sprints, zones, heatmap in metres relative to the session start. **No latitude/longitude** | `gpsSessions`, Storage `gpsSessions/{uid}/` | Device (computed on device) | Owner; public only with `public_movement` |
| D11 | Scouting | watchlists, briefs, reports, evidence requests, trial invitations | `recruitmentWorkspaces`, `scoutBriefs`, `scoutingReports`, `evidenceRequests`, `trialInvitations` | Scout / coach | Scout; the player for items addressed to them |
| D12 | Notifications | Expo push token, preferences incl. lock-screen preview, throttle state, activity feed | `pushTokens`, `notificationPreferences`, `pushThrottle`, `activities` | Device, server | Owner |
| D13 | Consent records | document id, version, timestamp, scope | `consentRecords/{uid}/items` | User | Owner, server |
| D14 | Moderation | reports, cases, actions, appeals, notices, restrictions | `contentReports`, `moderationCases`, `appeals`, `moderationNotices`, `accountRestrictions` | Users, staff | Reporter (own reports), staff |
| D15 | Entitlements | plan status, RevenueCat event receipts, usage ledger | `entitlements`, `revenueCatEvents`, `usageLedger` | RevenueCat webhook, server | Owner (read), server |
| D16 | Data rights | privacy requests, deletion requests, export archives | `privacyRequests`, `deletionRequests`, `dataExports`, Storage `exports/{uid}/` | User, server | Owner |
| D17 | Public projection | allowed Passport fields, `ageGroupLabel: youth` for minors | `publicPassports`, `discoverablePlayers`, `passportSummaries` | Server (projection sync) | Public / scouts per visibility |
| D18 | Diagnostics | crash reports and 20% performance traces, PII scrubbed, no user id set | Sentry (production builds only) | Device | Operator |
| D19 | Security signals | App Check attestation tokens | Firebase App Check | Device | Server |
| D20 | Legal retention | minimised records with hashed identifiers after deletion | `legalRetention` | Server | Server only |
| D21 | Admin audit | staff actions | `adminAuditLog` (append-only) | Server | Staff |
| D22 | External football source links | link to an allowlisted football website, provider, source type, visibility, moderation status, linked match ids, report count. **No content from the linked page** | `players/{uid}/footballSources`; projections `publicPassports/{uid}.footballSources`, `scoutFootballSources/{uid}`; on a report, provider and link in `moderationCases.targetContext` | User (pasted link) | Owner; Passport viewers or scouts only by the player's choice and guardian scope; staff on report |

Not collected: date of birth, precise or coarse location, contacts, advertising identifiers,
analytics events, cross-app tracking. Raw GPS fixes exist only in memory during a recording
(`src/features/gps/services/gpsTrackingService.ts`) and are converted to pitch-relative metres before
anything is stored.

## 2. Processing register

| Activity | Data | Purpose | Legal basis (FADP / GDPR) | Minors |
| --- | --- | --- | --- | --- |
| Account and sign-in | D1, D2, D19 | Provide the service | Contract (Art. 6(1)(b)) | Same |
| Age gate | D3 | Apply age rules, block under-13 | Legal obligation / legitimate interest (child protection) | Core control |
| Guardian consent | D4, D13 | Unlock youth scopes | Consent of the guardian (Art. 8) | Required for 13–17 |
| Passport and profile | D5, D6, D17 | Football identity | Contract; public projection by consent | Public parts need guardian scopes |
| Media library | D7, D8 | Store and validate uploads | Contract | Public media needs `public_media` scope |
| AI analysis | D7, D9 | Analysis the user requests | Consent (`ai_analysis` scope for minors); contract for adults | Guardian scope |
| Movement sessions | D10 | Distance and pitch heatmap | Contract | Available to all ages (no location) |
| External football source links | D22 | Let players point to their league, team or player pages | Contract; showing a link to others by the player's choice | Sharing needs `public_passport` or `discovery` scope |
| Scouting | D11 | Scout tools, contact through PitchProof | Contract (scout); consent (player discovery/contact) | `discovery`, `scout_contact`; trials need guardian co-approval |
| Notifications | D12 | Inform users | Contract; push requires OS permission | Generic lock-screen copy always |
| Moderation | D14, D21 | Safety and abuse handling | Legitimate interest; legal obligation | Priority handling of minor reports |
| Subscriptions | D15 | Premium entitlements | Contract | No promotions shown to minors |
| Data rights | D16, D20 | Access, export, deletion | Legal obligation | Same |
| Crash diagnostics | D18 | Stability | Legitimate interest | Same |

LEGAL REVIEW REQUIRED: every legal basis above, the use of consent versus contract for adult AI
analysis, and whether Art. 8 GDPR age thresholds per EU member state require a higher guardian
age for EU users.
