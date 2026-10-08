# Video Intelligence Privacy Report

Not reviewed by a lawyer. Policy texts updated to 1.2.0 (video recording, data retention, AI use)
are flagged for legal review.

| Principle | Implementation | Verified by |
| --- | --- | --- |
| Explicit consent per video | `recordVideoProcessingConsent`; four acknowledgements; enforced by `assertVideoConsent` in upload, analysis and segment review | `tests/rules/uploads.test.mjs`, `analysisPipeline.test.mjs`, release gate |
| Withdrawal | `revokeVideoProcessingConsent` cancels and discards uploads | `analysisPipeline.test.mjs` |
| No silent retention | Source deleted by default; keep-video, keep-for-retry and evidence clips opt-in; temporary footage not filed in the library | `analysisPipeline.test.mjs`, `uploads.test.mjs`, release gate |
| Data minimisation | Short clips upload frames only; only cited frames survive; identity frames capped at 6 | `analysisPipeline.test.mjs` |
| No facial recognition | Jersey OCR and kit colour only; worker contract `faceRecognition: false` enforced on both sides | `workers/football-cv/tests`, `tests/unit/videoIntelligence.test.ts` |
| Bystanders | Worker discards non-target tracks per request; contract forbids retaining them | worker tests |
| AI provider | OpenRouter with `data_collection: deny`, `zdr: true` | `tests/unit/aiPrivacyGate.test.ts` |
| Access | Consents, segment reviews, CV results, report versions and clips: owner read, server write | `tests/rules/firestore.rules.test.mjs`, `storage.rules.test.mjs` |
| Deletion | Job delete purges Storage prefix and subcollections; account deletion includes consents | `analysisPipeline.test.mjs`, `accountDeletion.ts` |

Open items: legal review of the 1.2.0 texts and retention periods; backfill for jobs completed
before the lifecycle shipped; ZDR availability for the chosen vision model (NOT VALIDATED).
