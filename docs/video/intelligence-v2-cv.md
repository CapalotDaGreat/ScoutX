# Bounded Python CV Identity Hardening

## Scope And Audit

This change owns only `workers/football-cv/**` and this document. The full supplied
PitchProof brief was read; this is a bounded worker improvement, not implementation
or validation of the entire flagship specification. Existing unrelated dirty changes
are preserved. No parent TypeScript, approval records, thresholds, deployment flags,
cloud resources, production data, or model choices are changed.

The reference worker streams sampled RGB frames through RT-DETR, ByteTrack, torso
colour matching, and EasyOCR. Models are lazy-loaded. HTTP contract v2 has strict
request/privacy validation and the caller must provide authenticated invocation and
authorized media. Service IAM and source authorization remain external requirements;
this work is not a security certification. Media is not persisted by the service.

Audit defects addressed:

- Three matching readings anywhere in a tracker ID previously attributed its entire
  history to the target, including unread frames and switched identities.
- One highest-confidence OCR reading determined candidate jersey text, ignoring consensus.
- OCR stripped non-digit characters, potentially turning a partial read into a full number.
- Short wide-camera gaps implied active off-camera status without evidence.
- Tracker IDs survived large timestamp gaps and camera changes without an explicit guard.
- Tests lacked conflicting OCR, reused IDs, camera cuts, and timestamp failure cases.

Events and pitch mapping remain unavailable. No actions, pitch coordinates, physical
metrics, heatmaps, or biometric signatures are produced. Detection/decoding still
dominate expected runtime; no latency, throughput, GPU, or cost benchmark was performed.
Model availability, suitable authorized footage, licensing review, infrastructure,
and measured commercial operating costs remain external deployment prerequisites.

## Evidence Rules

Worker version is now `football-cv/0.3.0`; HTTP version stays 2 with exactly the same
request and response fields. No optional fields or parent changes are required.

OCR accepts only complete one- or two-digit ASCII readings with finite confidence
between 0.6 and 1. It does not repair partial digits, coerce leading zeros, or guess
three-digit jerseys. The v2 request can still carry three characters, but unsupported
numbers cannot become confirmed by this implementation. Multiple distinct plausible
OCR regions in a crop yield no reading, rather than selecting the strongest region.

Consensus needs at least three distinct sampled timestamps and a confidence-weighted
vote share of at least 0.75. Duplicate timestamps provide no consensus evidence.
Candidate jersey text uses consensus, not a single maximum-confidence reading.

Each claimed target observation independently needs consensus within 2.5 seconds on
either side, and must itself have a qualifying target-number read. This is bounded
offline look-ahead, not causal live tracking. Unread, low-confidence, and conflicting
samples remain unknown even when nearby identity is supported. This deliberately
trades recall for conservative attribution. A single conflicting reading does not
erase all other supported observations, but never becomes a target sample itself.
Binary-search slicing bounds local vote work rather than rescanning full tracks.

Evidence cannot cross a tracker observation gap over two seconds, a known-kit mismatch,
or a gross box-center jump exceeding twice the previous box's largest dimension.
Pixel boxes are now retained in request-local memory for these continuity checks even
when evaluation tracing is disabled. They never appear in the HTTP response.

The pipeline resets the tracker and namespaces its IDs after a timestamp gap exceeding
`max(2 seconds, 1.5 sampling steps)` or a mean absolute RGB change above 0.35 on a
16-by-16 sampled grid. These are coarse **uncalibrated** guards: flashes/pans may cause
false resets, similar-looking cuts may be missed, and subtle same-kit switches with
no readable jersey remain unresolved. Invalid, duplicate, reversed, or out-of-window
frame timestamps fail the segment closed with no target trace or visible claims.

Simultaneously supported number matches remain ambiguous: neither is confirmed.
After a gap/cut, fresh local evidence is required. The nominated description remains
the same, but tracker IDs are not proof of personal identity. There is no cross-request
identity memory, appearance embedding, or cross-segment stitching in this scope.

## Unknown Intervals And Compatibility

All gaps between supported sample slots are `UNKNOWN`, confidence zero, regardless
of wide-camera classification or gap duration. There is no inferred off-camera
activity, interpolated location, substitution, or off-pitch claim. The legacy
`LIKELY_ACTIVE_OFF_CAMERA` enum remains accepted by v2 but is no longer emitted here.
Visibility windows represent sampled support at the requested sampling resolution,
not proof of continuous observation between frames. Sparse sampling limits recall.

**`CONFIRMED_VISIBLE` is a legacy heuristic label, not validated identification.**
Its existing window confidence of 0.8, OCR aggregates, team similarity, and all new
thresholds are uncalibrated. None is a measured probability or release approval.
Downstream strong factual claims still require real-footage evaluation and appropriate
product review. An identity stage marked complete means computation completed, not
that identity was validated or resolved.

The existing evaluation trace now contains only supported target samples, using the
same HTTP-independent trace format. Other players' boxes are not added to it.
Candidate payloads remain bounded legacy anonymous hypotheses, not confirmed identities.

## Deterministic Verification

Installed runtime: local `.venv/Scripts/python.exe`, Python 3.12.10, pytest 8.4.2,
numpy 2.5.3, pydantic 2.14.0, FastAPI 0.143.0, Starlette 1.7.0, httpx 0.28.1.
No dependencies or model weights were downloaded.

From `workers/football-cv`, run:

```powershell
.venv/Scripts/python.exe -m pytest -q -k 'not http_endpoint' --basetemp=.pytest-tmp-identity-3
```

Result: **55 passed, 1 deselected**. One existing Starlette/httpx deprecation warning.
Coverage includes conflicting/partial/Unicode OCR, invalid confidences, same-frame
duplicate votes, local consensus, unread prefixes, switched suffixes, kit changes,
box jumps, tracker ID reuse, camera cuts, 45-second re-entry gaps, invalid timestamps,
unchanged v2 result shape, and existing contract/evaluation tests. Synthetic traces
are also checked by the existing identity evaluator; they are not benchmark results.

Initial pytest invocation from the repository root failed collection because worker
imports were not on its Python path. Running inside the worker resolves collection.
Default temporary-directory fixtures failed locally; a fresh worker-local `--basetemp`
allows the file-based evaluator tests to pass.

The existing HTTP TestClient test hangs before reaching the health handler. A timed
diagnostic located the wait in `socket.accept` inside Windows asyncio's fallback
socket-pair creation; the diagnostic process was terminated after 20 seconds. HTTP
execution therefore remains **unverified in this sandbox**, not a passing test.
The full-suite attempts were interrupted rather than left running. Rerun the full
suite in an environment permitting the event loop's local socket creation:

```powershell
.venv/Scripts/python.exe -m pytest -q --basetemp=.pytest-tmp-full
```

## Real-Footage Evaluation Still Required

Integration update: the full suite, including the previously sandbox-blocked HTTP
TestClient case, passed under an elevated local run: 56 passed, one dependency
deprecation warning. Log: `.local/intelligence-v2-python-final.log`. No models or
footage were downloaded. The earlier deselection is historical, not a remaining
test failure; real-footage and GPU validation below remain outstanding.

Use the existing `eval.predict` and `eval.evaluate` modules with consented footage,
manifest hashes, annotated target boxes (including absent-target keyframes), exact
worker/model provenance, and the existing unchanged proposed thresholds. Keep footage
and sensitive annotations private. Include similar kits/numbers, conflicting jersey
reads, crossings, low-resolution crops, long absences, cuts, flashes, pans, and segment
boundaries. Measure precision, recall, wrong-person assignments, switch behavior,
coverage loss, re-entry correctness, and threshold calibration on held-out data.
The existing switch metric counts transitions between correct and wrong claims, not
full multi-person MOT identity switches; do not overinterpret it.

Follow-up: the user supplied authorized local footage and a readable target-20 anchor
at 242 seconds. Local preparation, decoder verification and CPU reference-model smoke
results are recorded in `intelligence-v2-delivery.md`; this is not an annotated accuracy
benchmark. Accuracy/calibration, full-match identity continuity, GPU performance,
infrastructure costs and production readiness remain unvalidated. No deployment approval
is claimed; existing release gates remain untouched.
