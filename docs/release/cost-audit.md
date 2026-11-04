# Cost Audit

Phase 14 review of what can cost money per user and what caps it. "Bound" means a hard limit
enforced on the server, not a client hint. Provider list prices change; re-check OpenRouter before
locking App Store tiers.

## Recommended consumer prices (owner / ASC)

| SKU | Price | Rationale |
| --- | --- | --- |
| `PitchProven_Monthly` | **$16.99** | Covers max Premium AI COGS **plus** free-tier subsidy at ~10% conversion after Apple’s ~30% cut |
| `PitchProven_Yearly` | **$129.99** | ≈ 2 months free vs 12× monthly |

Planning assumptions (engineered estimates, not a live invoice): Gemini 2.5 Flash via OpenRouter at
$0.30 / $2.50 per 1M tokens; free users consume ~40% of their AI quota on average; ~9 free users
per paying user (10% conversion). Full-match vision is removed from Free so unpaid 90-minute jobs
cannot dominate COGS. Detail: premium-pricing canvas in the Cursor project.

## Cost drivers and server-side bounds

| Driver | Bound in code | Where |
| --- | --- | --- |
| AI footage analysis (OpenRouter vision calls) | Free: **0** full match + **2** clip analyses per 30 days; Premium: **4** + **20**. 8 analysis runs per user per day. 3 attempts per job. Off entirely until `AI_FOOTAGE_PROCESSING_APPROVED=true` | `functions/src/entitlements/plans.ts`, `workerContract.ts` (`ANALYSIS_DAILY_QUOTA`, `ANALYSIS_MAX_ATTEMPTS`), `ai/providerConfig.ts` |
| Frames per model call | Each frame at most 1.8 MB, owner path only | `frameAnalysis.ts` (`MAX_FRAME_BYTES`) |
| Model choice | Only allowlisted models (`google/gemini-2.5-flash` default); env overrides outside the list are ignored | `ai/providerConfig.ts` |
| Hanging model calls | 120 s timeout per call, then typed failure | `ai/openRouter.ts` (`CHAT_TIMEOUT_MS`) |
| Video storage and egress | Free: 3 GB / 120 min per video; Premium: 4 GB / 150 min. Charged before upload, refunded on rejection or early cancel. Abandoned sessions cleaned up on a schedule | `plans.ts`, `uploads/sessions.ts` |
| Concurrent jobs | Free 1, Premium 2 | `plans.ts` (`maxConcurrentJobs`) |
| Frame extraction (Cloud Tasks + ffmpeg) | 10-minute segments; queue dispatch caps 6 and 4 concurrent tasks | `analysis/segments.ts`, `analysis/pipeline.ts` |
| Reel exports | Free **1**, Premium **12** per 30 days | `plans.ts` |
| Data exports | One active export per user, reused for 24 h | `dataRights/dataExport.ts` |
| Guardian emails | 3 per player per day (`MAX_REQUESTS_PER_DAY`) | `safety/youthConsent.ts` |
| Public reports (no App Check) | Rate-limited per client address per day in `publicReportLimits` | `moderation/reports.ts` |
| Callables in general | App Check enforced by default | `callableOptions.ts` |

## Not bounded in code (EXTERNAL CONFIGURATION REQUIRED)

- Google Cloud budget alerts and a billing cap (Cloud Billing budgets).
- OpenRouter key spend limit.
- Cloud Functions `maxInstances` per function (defaults apply; set in the console or code once
  traffic is known).
- Firestore read costs from feeds and discovery: covered by rules and indexes, not by a quota.

## Free tier stays useful

Match logging, basic development, safety, reporting, privacy controls, guardian controls and account
deletion never call the quota service (`NEVER_PAYWALLED` in `plans.ts`). Hitting an AI quota shows
the reset date and the plan screen; the paywall is never opened automatically for minors.

## Not validated

No load test and no production bill has been observed. Per-analysis cost depends on video length,
frames extracted and the routed provider; measure it on the first real analyses before setting
prices (owner decision).
