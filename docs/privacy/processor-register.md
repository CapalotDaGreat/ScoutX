# Processor and Transfer Register

Every location and transfer mechanism below is **LEGAL REVIEW REQUIRED**: each entry has to be
checked against the signed contract (DPA) and the processor's current subprocessor list before
launch. Where this repo cannot know a value, it says so instead of guessing.

| Processor | Service | Data | Location | Transfer safeguard | Contract status |
| --- | --- | --- | --- | --- | --- |
| Google (Firebase, Google Cloud) | Auth, Firestore, Storage, Cloud Functions, Cloud Tasks, Hosting, App Check | All of D1–D17, D19–D21 | Region set at project creation; EXTERNAL CONFIGURATION REQUIRED to confirm (Functions default `us-central1`) | Google Cloud DPA with SCCs; Swiss-US DPF certification to verify | Accept Cloud DPA in console |
| OpenRouter | AI request routing | Extracted frames, prompt text, match context the user asked to analyse | United States | Contract to confirm. Every request sends `provider: { data_collection: 'deny', zdr: true }` (`functions/src/ai/providerConfig.ts`) | ZDR availability for the chosen vision model NOT VALIDATED |
| Model providers routed by OpenRouter | Inference | Same as OpenRouter | Varies per provider | Only providers that honour `data_collection: deny` and ZDR are eligible | Depends on OpenRouter routing |
| Sentry (Functional Software Inc.) | Crash and performance diagnostics | Scrubbed crash reports, device model, OS, app version | US or EU, depending on the organisation's data region | Sentry DPA | EXTERNAL CONFIGURATION REQUIRED |
| RevenueCat | Subscription entitlements | Firebase uid (as app user id), purchase events | United States | RevenueCat DPA | EXTERNAL CONFIGURATION REQUIRED |
| Apple | App Store purchases, APNs | Purchase data, push token, notification content | Apple's infrastructure | Apple developer agreement | n/a |
| Expo (650 Industries) | Push relay to APNs | Push token, notification title/body/path | United States | Expo DPA | Minors' notifications carry generic text only |
| SMTP provider used by Trigger Email | Guardian approval emails | Guardian email, player first name, signed link | Depends on provider; not chosen yet | Provider DPA | EXTERNAL CONFIGURATION REQUIRED |
| Cloudflare | Marketing site `scoutx.app` (hosted outside this repo) | Request metadata of site visitors | Global edge network | Cloudflare DPA | Outside this repo |

## Notes

- No advertising, analytics or attribution SDK is integrated.
- AI providers are never given user data for training: `data_collection: 'deny'` is set on every
  request, and output is checked by `functions/src/ai/outputValidator.ts`.
- The guardian approval page is served from Firebase Hosting, not Cloudflare.
- The privacy policy (`legal/documents/privacy-policy.md`) names the same processors.
