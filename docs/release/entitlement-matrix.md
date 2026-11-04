# Free / Premium entitlement matrix

Source of truth for limits: `functions/src/entitlements/plans.ts`. The client reads the same
numbers through the `getUsageSummary` callable. Client `isPremium` is never trusted for
protected operations.

Statuses that unlock Premium limits: `premium`, `trial`, `grace`. Everything else (including
`unknown` and expired) uses Free limits.

## Metered features (per 30-day period)

Sized so Premium can subsidise free AI users after Apple’s cut. Recommended ASC prices:
**$16.99 / month**, **$129.99 / year** (see `docs/release/cost-audit.md`).

| Feature | Free | Premium | Server enforcement |
| --- | --- | --- | --- |
| Short-clip / frame analysis (`frame_analysis`) | 2 | 20 | `consumeQuota` on analysis start |
| Full-match analysis (`full_match_analysis`) | 0 | 4 | `consumeQuota` on upload session |
| Highlight reel export (`reel_export`) | 1 | 12 | `consumeQuota` on export |

## Capacity limits

| Limit | Free | Premium |
| --- | --- | --- |
| Concurrent analysis jobs | 1 | 2 |
| Max video duration | 120 min | 150 min |
| Max video size | 3 GiB | 4 GiB |

## Never paywalled (same on every plan)

Listed in `NEVER_PAYWALLED`: safety_and_reporting, account_deletion, privacy_controls,
guardian_controls, match_logging, basic_development (shown in product copy as safety and reporting,
account deletion, privacy controls, guardian controls, match logging, basic development). The
paywall is never auto-presented to players under 18 (`presentPaywall` is user-initiated; UI hides
upgrade CTAs for minors outside Settings).

## Purchase / restore verification status

| Flow | Status |
| --- | --- |
| RevenueCat webhook → server entitlement | PASS (emulator / simulated) |
| Usage summary reflects server plan | PASS (unit / integration) |
| Sandbox purchase on device | NOT VALIDATED (needs `appl_` key + TestFlight) |
| Restore purchases | NOT VALIDATED on device |
| Refund / billing retry | NOT VALIDATED (provider-driven) |
| Guest / anonymous Premium | Guests cannot purchase; no Premium without an account |

## Product IDs

Client product ID strings live in `src/features/premium/config.ts` (`PitchProven_Monthly` /
`PitchProven_Yearly`). Attaching those IDs to a live RevenueCat offering, App Store Connect
products, and EAS secrets remains **CONFIG_REQUIRED** outside this repository. Production builds refuse a `test_`
public SDK key (`app.config.ts` + release gate).
