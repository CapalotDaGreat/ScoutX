# Video Intelligence Readiness Report

Overall: **PRODUCTION LIMITED**

| Capability | State |
| --- | --- |
| Consent, lifecycle, retention, deletion | Implemented, automated tests pass; real-device NOT VALIDATED |
| Short-clip mode (frames on device) | Implemented; real-device NOT VALIDATED |
| Files / iCloud picker | Implemented (`expo-document-picker`); needs a new native build; NOT VALIDATED |
| Segment review with partial progress, synthesis, versions | Implemented with mocked models; real footage NOT VALIDATED |
| "Is this you?" with held-back coaching | Implemented, automated tests pass |
| Report sections with availability | Implemented |
| Possible events (still frames) | Shown as "needs review"; never counted |
| Continuous tracking | Reference worker implemented, **not deployed**, **not evaluated**; app shows "not available" |
| Event detection, pitch mapping, physical metrics from video | **Not available** |
| Statistics from video | **Not available** (always unknown) |
| Real-footage accuracy | **NOT VALIDATED** (`accuracy-report.md`) |

Before anything here may be called validated: run the device test protocol, annotate real
footage, deploy the worker privately, pass the evaluation against owner-approved thresholds,
record it in `accuracy-report.md`, and pass the public-release gate.

Configuration still required (never invented): `CV_WORKER_URL`, GPU region, Artifact Registry
repository, invoker service account (all CONFIG_REQUIRED), owner decision on thresholds.
