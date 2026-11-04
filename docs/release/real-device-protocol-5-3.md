# Focused real-device validation protocol (5.3)

**Environment note (2026-11-04):** Release engineering host is **Windows** — no Xcode, no local iOS Simulator signing. Device validation requires **physical iPhone** + TestFlight/EAS build. Simulator / unsigned web ≠ device validation.

**Record for every run:** git commit SHA · EAS build ID · profile (`production` / `preview`) · device model · iOS version · tester initials · date · pass/fail/notes.

Use test accounts from `e2e/fixtures/accounts.json` patterns or dedicated sandbox users — **not** production user footage without authorization.

---

## A. Install and permissions

| # | Step | Expected | Evidence |
|---|---|---|---|
| A1 | Fresh install from TestFlight | Launches; no immediate crash | Screenshot home |
| A2 | Photo library permission when picking media | System prompt; app explains use | Screenshot |
| A3 | Location when starting movement session | When-In-Use only; background location off | Screenshot / note |
| A4 | Notifications (if prompted) | Optional; deny path still usable | Note |

## B. Auth and session

| # | Step | Expected | Evidence |
|---|---|---|---|
| B1 | Sign in with Apple / email | Session established | — |
| B2 | Kill app; relaunch | Session restored or clean re-auth | — |
| B3 | Sign out | Returns to signed-out state | — |
| B4 | Under-13 / teen path (test account) | Private mode / guardian gates per copy | Note age band used |

## C. Video / analysis (respect AI gate)

| # | Step | Expected | Evidence |
|---|---|---|---|
| C1 | Import short fixture video | Upload/quarantine succeeds or clear error | Job id |
| C2 | If `AI_FOOTAGE_PROCESSING_APPROVED` **unset** | Analysis refused with “not available” style message — **not** silent success | Screenshot |
| C3 | If approved in controlled eval only | Still-frame/limited path; no claim of continuous tracking | Screenshot report |
| C4 | Background during upload | Resumes or fails gracefully with retry | Note |
| C5 | Airplane mode mid-job | Clear failure; no corrupted “success” | Note |

## D. Results honesty

| # | Step | Expected | Evidence |
|---|---|---|---|
| D1 | View results / abstention | Abstention ≠ “tracked successfully” | Screenshot |
| D2 | Owner confirmation / correction UI if shown | Can correct without crash | — |
| D3 | CV tracking features | Unavailable / Coming soon — not a fake track | Screenshot |

## E. Deletion

| # | Step | Expected | Evidence |
|---|---|---|---|
| E1 | Delete analysis / media | Removed from library | — |
| E2 | Account deletion (test account) | Re-auth if required; completes; cannot sign in to old data | — |

## F. Purchases (sandbox)

| # | Step | Expected | Evidence |
|---|---|---|---|
| F1 | Sandbox Apple ID purchase monthly/yearly | StoreKit sheet; entitlement unlocks | Screenshot (no PII) |
| F2 | Restore purchases | Restores on second device/install | — |
| F3 | Expired subscription demo (for ASC) | Paywall / expired state reviewable | Note |

## G. Release-only App Check

| # | Step | Expected | Evidence |
|---|---|---|---|
| G1 | Production TestFlight build | Callables succeed with App Check registered | No `appCheck` permission-denied storms |
| G2 | If enforcement on and tokens fail | Document exact error; do not “fix” by disabling App Check in production without approval | Logs (redact tokens) |

## H. Stability

| # | Step | Expected | Evidence |
|---|---|---|---|
| H1 | 10 min navigation smoke | No crash | — |
| H2 | Memory after large video pick | App remains responsive | Note |

---

## Operator: obtain a device build

1. Re-auth EAS/Firebase (see `operator-actions-2026-11-04.md` §3).
2. Confirm production env names: `npx eas-cli env:list --environment production`.
3. **APPROVAL REQUIRED** to queue:
   ```powershell
   npx eas-cli build -p ios --profile production
   ```
4. **APPROVAL REQUIRED** to submit TestFlight:
   ```powershell
   npx eas-cli submit -p ios --latest
   ```
5. Install on physical device; run this protocol; paste results into `docs/release/validation-matrix.md` (or attach a dated checklist copy under `docs/release/`).

### Logs to collect
- EAS build URL / ID
- Device Console / Xcode Devices logs around failures (no App Check debug tokens, no secrets)
- Screenshots for A1, C2/C3, D1, D3, F1

### What not to claim
- Pass from Expo Go or web-only E2E as “real-device App Store validation”
- ASC acceptance from a green local unit suite
