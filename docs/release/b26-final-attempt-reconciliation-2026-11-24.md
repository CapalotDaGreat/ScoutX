# B-26 final-attempt reconciliation contract

Implemented on source only, 2026-11-24. No deployment, scheduler creation, cloud execution, billing linkage or
benchmark rerun is authorized or performed. B-26 remains OPEN; real task/recovery/capacity evidence is outstanding.

## Durable registration and settlement

The final delivery uses the existing task budgets: resolve attempt 2 of 0..2, OCR-refresh attempt 1 of 0..1.
`claimTrackingTask` writes a server-only `trackingAttemptReconciliation/{leaseToken}` ticket in the **same Firestore
transaction** as the lease. A final delivery returning `busy` registers the live owner's original expiry and
snapshots instead of taking over or silently losing recovery. Earlier deliveries create no ticket. A process kill
after the transaction commits therefore cannot strand final-attempt state merely because `finally` never ran.
Unexpected final-attempt exceptions keep the lease; the handler still throws, and the sweep can settle it later.
Earlier retry semantics and typed deadline handling remain unchanged. No extra task attempt is enqueued.

Tickets contain job id, scope, token, feedback revision, OCR round, generation, resume `startedAt`, initial report
version and due time. They contain no footage, report, credentials, owner id or source URL. Default Firestore deny
rules keep the collection client-inaccessible. Tickets are removed transactionally when settled or superseded;
failed transactions leave them available for a later sweep. Job deletion never causes recreated job metadata.

`reconcileTrackingAttempts`, exported from the Functions entry point, is a new five-minute scheduled function.
It reads at most 100 due tickets per invocation through a single-field due-time index, then reconciles each in a
transaction. The ordinary Firestore automatic ascending index suffices; no composite index is required. One
instance is configured, and transactional checks make duplicate/overlapping invocations safe. There are no calls
to the CV worker, AI providers, task enqueue APIs or notification producers. No CV approval bypass is needed to
settle abandoned state; the sweep never starts analysis.

Settlement occurs only after the stored lease has expired (31 minutes from claim). It rechecks the token,
generation, resume start time, feedback revision and initial current-report version, job existence/cancellation,
progress outcome, scope and OCR round. A report published before a later enqueue/notification failure is preserved
because its version changed. A released/replaced lease or newer result causes ticket deletion without altering
that work. A still-live extended lease postpones its ticket instead of being forcibly expired.

- Full resolve: clear only a matching `resolving=full` slot with no full publication, set progress to `interrupted`.
  The owner can use the existing resume path; finished extraction artifacts are preserved.
- Preliminary resolve: clear only its matching slot; do not interrupt the full analysis.
- Feedback resolve: preserve the existing stale report and set `pendingReason=resolve_interrupted` only for the
  matching feedback revision. Do not make stale metrics current or fail another orchestration scope.
- OCR refresh: fail only the still-runnable same revision/round. Preserve report content/version, main analysis,
  crop/quota accounting and newer/completed rounds. No new OCR round or daily quota entry is created.

The expiry fence already prevents late worker results publishing through the expired lease. Reconciliation retires
only the matching expired token and does not cancel remote work. No claim is made that CPU work stops at expiry.

## Operational limits and validation still required

After future reviewed deployment, normal settlement is eligible after the 31-minute lease plus the next successful
five-minute sweep; scheduler delays, failures and a backlog can extend that. A 100-ticket batch is a bound, not a
latency guarantee. Monitor oldest due ticket age, backlog, scheduler failures and settlement outcomes through an
approved operator process. Schedule/Firestore outages must leave tickets intact and recover on a later invocation.
Configure and validate the new scheduled function and its permissions only under separate rollout authorization.

Registration covers a final delivery that reaches a successful claim transaction (including `busy`). A delivery
that never enters the handler/claim, an already-stranded legacy task without a ticket, queue expiration before the
last delivery, or a permanently disabled scheduler is outside this recovery proof. Do not fabricate tickets or
invent a retry budget to label those cases recovered. They still require a separately reviewed operator procedure.
Tickets cannot prove that a remote request stopped or provide capacity/accuracy evidence.

For runbook R-08, kill isolated final resolve and OCR handlers after registration, before publication; observe no
early settlement, then the real sweep's guarded terminal update. Also test successful publication followed by
process death, duplicate final delivery on a busy owner, same-generation resume, new feedback/generation/round,
cancellation/deletion, concurrent lease takeover, sweep crash/transaction retry and a backlog larger than 100.
Capture task/lease/ticket hashes and state before/after privately. Synthetic unit tests simulate these state paths
but do not establish deployed scheduler delivery or real Firestore contention behavior.

Rollback must preserve the sweep until pending tickets are drained or explicitly handled under an approved
procedure. Disabling it immediately leaves those tickets pending; lease expiry alone does not replace it.
Never restore short task/client deadlines against already queued long-running work. The existing
[integration/capacity runbook](b26-integration-capacity-runbook-2026-11-23.md) supplies the broader rollback and
cleanup protocol. Billing stays unlinked throughout this implementation task.
