# Staging execution attempt and audit, candidate `5265405` (2026-11-19, 23:40–24:00 Zurich)

**Verdict: staging did not run.** STG-01 is paused before any cloud write because the billing account named in both
approvals (`[BILLING ACCOUNT DISPLAY NAME]` at 23:40, `<EXACT BILLING ACCOUNT DISPLAY NAME>` at 23:57) is a template
placeholder: it matches neither of the two open billing accounts visible to the operator (exact, case-sensitive
comparison of display names; the two real names are distinct, so a real name would resolve to exactly one account). The
approval brief requires a pause in that case. No project, billing link, budget, deployment, queue, service account or
task was created. Production was not touched. The pilot stays pending; user-facing analysis stays off.

## What was verified (read-only or local)

| Item | Result |
|---|---|
| Candidate | `5265405` = `52654050db07545053bdb808b1f10dc903c129d3`, tree `4f45bd542868087f8274348c338d8461b2f0a7fc` |
| Clean checkout | detached worktree of the full SHA: 0 changed files; all staging and rehearsal drivers parse (`node --check`); worktree removed afterwards |
| Deploy artifact | overlay tree `b4537970126e42e8d4a29f0926654ea7fd1e5d4a`, built twice from the full SHA, identical (ledger §31) |
| Authenticated account | the operator's own Google account (not recorded) |
| Staging project | `pitchproof-stg-pilot`: `projects describe` fails (does not exist or not accessible); no project matching `pitchproof-stg*` is listed |
| Billing | 2 open accounts, 0 matches for the given name |
| Production | latest function update in `scoutx-230b0` is still 2026-11-13 16:22 UTC (read-only list) |
| Export (exact code) | `buildDataExport` reads only top-level `matchAnalysisJobs` documents, never the `tracking/` or `pilotHeld/` subcollections, so no tracking report is exported in the released, held, withheld or superseded state; signed links are made only for paths inside the user's prefix and never for `/pilotHeld/`. Tracking image paths live only in those subcollections, so none reach the link list. Defence-in-depth note (not a defect): the link filter itself does not exclude `/tracking/`; the playback callable does. R3 stays pending under this behaviour. |

## Check-by-check record

| Action | Verdict | Evidence |
|---|---|---|
| STG-01 project, billing, budget | **unrun — paused** (billing name unresolved) | this file |
| STG-02 Firebase, Firestore, services | unrun | depends on STG-01 |
| STG-03 overlay + deploy | unrun (overlay input verified locally) | ledger §31 |
| STG-04 fake worker | unrun | — |
| STG-05 preflight | unrun | — |
| STG-06 Cloud Tasks probes A1–A4, R1–R3, D1–D4, S1 | unrun in staging. Emulator only: R1, R2, D1, D2, D3, D4, S1 passed; A1–A4, R3 need real OIDC / probe queues | `pilot-rehearsal-2026-11-19/13-…json` (emulator) |
| STG-07 link revocation | unrun in staging. Emulator only: 13/13 incl. discovery images, issuance vs fetch around the acknowledgment | `14-…json` (emulator) |
| STG-08 rollback boundary | unrun in staging. Emulator only: rehearsal 86/86 incl. `race.*`, `claim.*` | `12-final-5265405.json` (emulator) |
| STG-09 evidence | nothing to export | — |
| STG-10a/b/c cleanup, identity check, deletion | not needed: nothing was created; no residual resources | read-only checks above |
| Spending | USD 0 (no billable resource); watchdog/counters never started | — |
| Lost-response and duplicate-discovery cases | not observed (no run). Known limitations unchanged: a lost worker response means one extra worker call (one stored version); a duplicate discovery delivery can call the worker twice (one publication) | ledger §31 |

## Defect found and fixed (separate candidate; not part of the `5265405` run)
`probe-tasks.mjs --only S1` without an output file took `S1` as the evidence file name. The packet's commands always pass
the output file first, so the approved run is unaffected. Fix: `parseDriverArgs` in `scripts/pilot-staging/lib.mjs` plus
regression test `tests/unit/pilotStagingArgs.test.ts` (fails on the old code, passes on the fix). Recorded under its own
commit after `5265405`; staging should still use `5265405` unless the owner approves a new candidate.

## Exact next action
The owner sends the billing account's **real display name** (as shown in Cloud Billing → Manage billing accounts). With
a unique exact match, STG-01…STG-10c run on `5265405` as approved. No other part of the approval needs changing.
