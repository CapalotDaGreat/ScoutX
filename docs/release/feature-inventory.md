# Feature inventory (release audit)

Updated 2026-10-17 (controlled evaluation closure). Statuses:

- **Functional** — implemented with automated evidence; device/provider steps may still be open
- **Partial** — usable core path; named gaps remain
- **Unavailable** — honestly gated or not deployed
- **External** — needs credentials or console work
- **Not validated** — code exists; physical device / real footage not run

| Feature | Status | Notes |
| --- | --- | --- |
| Onboarding / age band | Functional | Self-declared age (SEC-12 residual) |
| Auth (email, Apple, Google), logout, recovery | Functional | Device NOT VALIDATED |
| Account deletion / export | Functional | Server re-auth; device NOT VALIDATED |
| Player profile / Football Passport | Functional | |
| Match logging & stats | Functional | Always free |
| Full-match video analysis (still-frame) | Partial | Frames + AI observations; CV tracking unavailable |
| Short-clip analysis | Partial | Device frames path; device NOT VALIDATED |
| Continuous tracking / events / pitch map | Unavailable | Worker not deployed; UI says unavailable |
| Identity confirmation (jersey/kit) | Functional | No face/biometrics |
| Corrections / feedback | Functional | Not training |
| Trends (≥ 3 analyses) | Functional | Conservative gating |
| Highlights / Reel Studio | Functional | Quota metered |
| Development goals | Functional | Always free (basic) |
| Post-match reflection | Functional | Player's own words per match; prompted from Today; stripped from public Passport projection |
| Scout discovery / compare / watchlists | Functional | Rate-limited search; no overall/potential grade sorting; neutral side-by-side comparison (no winner); pipeline search/stage filters + private workspace notes |
| Evidence requests / trials | Functional | Guardian co-approval for minors |
| Guardian consent | Functional | Email HMAC links |
| Guest / public Passport | Functional | |
| Reporting / blocking | Functional | Never paywalled |
| Premium purchase / restore | External + Not validated | Matrix in `entitlement-matrix.md` |
| Settings / privacy / notifications | Functional | |
| 7 locales | Functional | Parity tests |
| Deep links / share | Partial | AASA configured; device NOT VALIDATED |
| Coming soon website CTAs | Functional | App Store links disabled until launch |

Flagship detail: `docs/video/gap-matrix.md`, `docs/video/readiness-report.md`.
