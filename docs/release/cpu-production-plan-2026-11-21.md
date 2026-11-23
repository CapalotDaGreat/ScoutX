# CPU production plan: verified benchmark, rollout still blocked

CPU decision: 2026-11-21. Updated on `main` on 2026-11-23 from the experimental-branch plan, recovered run evidence
and the deadline fix at `72efc2c`. This is a plan, not deployment or release approval.

## 1. Completed: the recorded CPU8 configuration passed

The CPU8 result and claims sidecar were recovered from local Git commit `4c2a827`. A fresh offline
`bench/compare_runs.py` comparison against the recorded CPU reference, using `bench/gates/balanced_5.2.json`,
**passed with exit 0**, no comparability objections and no gate failures. Both claims hashes were verified.
See the [sanitized session summary](cpu8-regate-session-summary-2026-11-23.md) for hashes and recovery details.

- Image source: `bc5a9d13f669bc92f869b6937ad4085b26551d2b`, `Dockerfile.tracker-gpu`.
- Image digest: `sha256:7e8d48728c75be551a8d5c057f9cc9020580b43682bd87cea9e9cd1b94263e2d`.
- Job allocation: **8 vCPU, 32 GiB**, one task, `CPUExecutionProvider`, balanced mode, no task retries.
  CUDA was unavailable. The process reported nine visible logical CPUs; that is not the allocation.
- Full benchmark: **6,628.491 s**, `timingComplete=true`, versus **7,528.287 s** for the reference (1.14x).
- Claimed recall **0.621**, IDF1 **0.766**, confirmed-correct time **10.5 s**; interval-labelled wrong-identity
  and confirmed-wrong-identity time **0.0 s**. State agreement **0.9984**, box agreement **1.0**.

This closes the missing-result/re-gate prerequisite for this recorded configuration and host. It does not establish
full-match identity correctness outside the labelled intervals or parity on every future CPU model. The candidate's
own image-build and lock-hash metadata fields are null; separate job/build records establish the image digest.

A new CPU-only wheel image is not required to reproduce this configuration: the passing image contains CUDA packages
but ran on CPU. Changing wheels, model weights, decoder, thread/resource settings, precision or sampling is a new
configuration and needs its own evidence. A 2- or 4-vCPU option is conditional cost research, not a prerequisite for
the already tested 8-vCPU route. The failed L4 FP16 candidate is not promoted by this CPU pass.

## 2. Completed locally: task deadlines, retries and leases

`72efc2c` fixed resolve and OCR-refresh handling on `main`, including compiled Functions output. Constants live in
`functions/src/analysis/trackingDeadlines.ts`; scoped, token-fenced leases in `trackingTaskLeases.ts`.

| Clock / behavior | Current source |
|---|---|
| Resolve and OCR-refresh worker client | 1,680 s |
| Function timeout and Cloud Tasks dispatch deadline | 1,800 s |
| Attempt lease | 1,860 s (31 minutes), retained after a timeout |
| Minimum retry backoff | 240 s; the retry can start after the retained lease expires |
| Resolve attempts | 3 total; the last timeout interrupts a full resolve |
| OCR-refresh attempts | 2 total; the last timeout fails that follow-up, not the whole analysis |

Discovery/extraction retain their 1,680 s clients and 1,800 s tasks. Their existing null-response retry behavior is
preserved. A resolve client's own timeout is typed and retried; HTTP errors/disconnects remain rejected responses.
Lease checks fence publication and failure settlement against takeover, new generations, feedback and cancellation.
Local verification passed: 53 relevant tests, app/test typechecks, Functions build and focused lint.

These are source changes, not evidence of deployed behavior. The worker service request timeout must be at least
1,800 s; the README example now says so. A shorter service timeout can reject a request before the client deadline.

## 3. Remaining operational prerequisites (B-26)

The [B-26 integration/capacity runbook](b26-integration-capacity-runbook-2026-11-23.md) is prepared, not executed.
It records the missing full-claims collector and mixed-plan comparator as prerequisites; no live validation is authorized.

1. Prepare an explicitly approved, private CPU service rollout using the pinned digest and recorded CPU settings.
   Verify authentication, owner-scoped storage, consent/kill-switch behavior, concurrency/resource limits, rollback
   and the worker request timeout. No service rollout is approved or performed by this plan.
2. Integrate/deploy the matching task definitions and compiled Functions code only in that approved rollout.
   Verify dispatch deadlines, timeout retries, retained leases, duplicate delivery, restart/resume and terminal
   failure behavior end to end. Unit tests do not establish live queue or worker behavior.
3. Validate the actual production chunk layout and publication path. The passing job was sequential with
   `--chunk-sec=300` (seven chunks); `trackingProgress.ts` starts production with **120 s**, then 300 s segments
   (eight for this recording). A matching image alone does not prove these execution paths yield equivalent output.
4. Establish a supported recording-length envelope before serving long matches. The measured non-resumed CPU8
   resolve was **610.872 s**, so it exceeds the former 600 s client but fits the fixed 1,680 s client. A linear
   90-minute projection is **1,620.987 s**, leaving about **59 s**; this is an unmeasured estimate, not a latency SLO.
   Measure representative worst cases, including OCR refresh. If they do not fit, bound the supported input or
   design a longer-running job path; repeated timeout retries cannot fix a deterministic overrun.
5. Keep normal football segments bounded at 300 s. The planner can grow to 900 s for unusually long recordings;
   those larger segments are not covered by this gate pass. Reject or separately validate that input envelope.

For context, the saved CPU8 job measured discovery at 1,035.395 s for the full recording, six 300 s extraction
chunks at 716.739–726.288 s and the final 235 s chunk at 565.581 s. These are single-run measurements, not p95
guarantees or measurements of the production task layout.

## 4. Accuracy, consent and explicit approval remain open (B-06/B-08/B-09/B-13)

- Obtain a second reviewer on the existing label corrections and independent labelled-match evidence. Complete
  the required evaluation protocol and record the model/worker approval artifact before enabling continuous CV;
  one familiar development recording cannot establish release readiness. The report evaluator's proposed
  held-out protocol requires 30 distinct recordings and two reviewers; those data do not exist today.
- Retain the known LIKELY wrong-player inventory (#6, #17 and the pause-and-resume transfer) as an identity-safety
  blocker. See [the full-match audit](../video/wrong-player-exchange-2026-11-02.md), section 8. The later default-decoder
  baseline is 263/502 correct, 14 wrong, 0 confirmed wrong on the corrected labelled frames, with 42 additionally
  reviewed LIKELY wrong frames. Zero confirmed wrong in reviewed frames is not proof of zero error throughout.
  This is a different evaluation from the historical interval gate above; neither silently replaces the other.
- Provider/footage privacy approval, current consent and the explicit owner release decision still apply.
  `APPROVED_CV_WORKER` remains null; do not enable `TRACKING_V3_ENABLED` or `CV_WORKER_APPROVED` from this pass alone.
- INT8 and the E9 number reader remain offline candidates requiring their own evidence before promotion.
  A CPU8 pass does not close the GPU/CUDA accuracy gap or authorize a new GPU session.

App Check, backups/restore, counsel review, device/TestFlight, store submission and other unrelated register items
are unchanged by this update. They have not been revalidated here.

## 5. Cost and session follow-up

The case for CPU is measured accuracy, not a verified price advantage. Older estimates described 8 GiB CPU memory
or a different 2-vCPU audit; this job allocated **32 GiB**. Its embedded cost estimate uses a **G2/L4 VM price model**,
not the CPU-only Cloud Run job allocation, so it is not evidence of this run's actual cost. Record matching CPU/RAM,
startup/build/storage and actual billing data before making cost-per-match claims. No new pricing or billing work
was performed for this update.

The [session summary](cpu8-regate-session-summary-2026-11-23.md) retains the cleanup limits: job, footage bucket and
exact build-source archive confirmed absent at follow-up; image deletion and permanent erasure of soft-deleted
copies unverified. These remain operator follow-ups, not evidence of completed cleanup.

Billing remains unlinked. This documentation update does not authorize or perform a deploy, benchmark rerun,
resource creation, billing link or product-flag change.
