# Video Intelligence Privacy Report

Not reviewed by a lawyer. Policy texts updated to 1.2.0 (video recording, data retention, AI use)
are flagged for legal review. Owner statement (2026-10-09): "The AI policies have been reviewed."
That is recorded as the owner's statement, not as legal sign-off.

| Principle | Implementation | Verified by |
| --- | --- | --- |
| Explicit consent per video | `recordVideoProcessingConsent`; four acknowledgements; enforced by `assertVideoConsent` in upload, analysis and segment review | `uploads.test.mjs`, `analysisPipeline.test.mjs`, release gate |
| Withdrawal | `revokeVideoProcessingConsent` cancels the job and discards uploads; a withdrawal during upload validation deletes the quarantine and promoted copies (`consent_withdrawn`); queued pipeline stages stop before any frame reaches the model or the worker | `uploads.test.mjs`, `analysisPipeline.test.mjs` |
| No silent retention | Source deleted by default; keep-video, keep-for-retry and evidence clips opt-in; temporary footage not filed in the library | `analysisPipeline.test.mjs`, `uploads.test.mjs`, release gate |
| Data minimisation | Short clips upload frames only; only cited frames survive; identity frames capped at 6; preflight reads metadata on the phone and uploads nothing | `analysisPipeline.test.mjs`, `matchAnalysisHonesty.test.ts` |
| Upload integrity | Server compares its own CRC32C with the client's declaration; missing or mismatching hashes are rejected | `uploads.test.mjs` |
| No facial recognition or biometrics | Jersey OCR and kit colour only; contract pins `faceRecognition: false`; release gate rejects face/biometric libraries in app, functions and worker; no reference photo exists | worker tests, `videoIntelligence.test.ts`, release gate |
| Identity | Ambiguous when two people carry the target number at once; changes only through the player's confirmation; corrections never switch identity | `test_worker.py`, `analysisPipeline.test.mjs` |
| Bystanders | Worker discards non-target tracks per request; the evaluation trace (boxes) exists only in local evaluation runs, never in the service response | worker tests |
| Feedback is not training | Corrections stored with `usedForTraining: false`; PitchProof does not train on footage or corrections (AI use policy) | `analysisCorrections.test.ts`, emulator tests |
| AI provider | OpenRouter with `data_collection: deny`, `zdr: true` | `aiPrivacyGate.test.ts` |
| Access | Consents, segment reviews, CV results, report versions, clips and corrections: owner read, server write | `firestore.rules.test.mjs`, `storage.rules.test.mjs`, `analysisPipeline.test.mjs` |
| Deletion and export | Job delete purges its objects and subcollections; account deletion also deletes analysis subcollections; export includes corrections (`analysisFeedback`) | `accountDeletion.test.mjs`, `analysisPipeline.test.mjs` |
| Logs | Error logs pass through `logSafeError`, which redacts URLs, tokens and storage paths; upload logs carry the upload id, not the path | code review, `redact.ts` |

Semantic changes in this phase (documented for policy review):

- Uploads can now be rejected for `integrity_mismatch` or `integrity_missing`, and cancelled with
  `consent_withdrawn` during validation.
- Lifecycle cleanup deletes only object names the app writes; unknown objects under a job are left
  and counted for review instead of being deleted.
- The preview no longer blocks clips under 30 s or shows a duration-based "quality" band; it shows
  measured facts and warnings, never an automatic rejection for quality.

Open items: legal review of the 1.2.0 texts and retention periods; production dry run and owner
decision for legacy media; ZDR availability for the chosen vision model (NOT VALIDATED).
