# Experimental Target Identity Foundations

## Status and Scope

`workers/football-cv/app/experimental_identity.py` is a pure, offline,
request-scoped evidence resolver. Its entry point is
`resolve(ResolverRequest) -> ExperimentalResolverOutput`. It has no decoder,
model loading, network access, storage, face recognition, gallery or embeddings.
There is no production v2 integration, enabled runtime flag or HTTP endpoint in
this module. Callable and UI implementation are separate parent-owned work;
their existence does not establish a validated adapter to this schema.

This is not re-identification, continuous tracking or full-match identity.
A manual anchor confirms only a supported observation at one source instant,
including eligible copies of that instant in overlapping segment context.
It never confirms the rest of a tracklet, an intervening gap, a re-entry,
off-camera activity or an entire match. No temporal propagation is performed.

## Exact Input Contract

Every model uses Pydantic `strict=True`, `extra="forbid"`,
`allow_inf_nan=False`, and `frozen=True`. Unknown keys and coercible strings
in numeric fields are rejected; NaN and infinities are rejected. Frozen models
still contain mutable lists: `resolve` dumps and revalidates its input before
processing, rather than trusting construction or earlier validation.

- IDs: 1-80 ASCII characters matching `[A-Za-z0-9_-]+`.
- Digests: exactly 64 lowercase hexadecimal characters. No prefixes.
- Times: finite seconds in `[0, 14400]`.
- Frame indices: integers in `[0, 1728000]`; booleans are not integers here.
- Jersey strings: one or two ASCII digits. Strings are compared literally;
  `"07"` and `"7"` are different evidence. No OCR normalization is performed.
- `NormalizedBox`: required `x`, `y`, `width`, `height`. Coordinates are in
  `[0,1]`, dimensions in `(0,1]`, with `x + width <= 1` and
  `y + height <= 1`. These are top-left coordinates and dimensions, not xyxy.
- `MatchScope`: required `jobId`, `sourceSha256`, `generation`,
  `modelSetDigest`. Generation is an integer in `[0,1000000]`.
- `UserAnchor`: required `anchorId`, `scope`, `frameIndex`, `timestampSec`,
  `box`, `evidenceHash`.
- `Observation`: required `observationId`, `frameIndex`, `timestampSec`,
  `box`, `evidenceHash`; optional nullable `readableJersey` and
  `appearanceScore`, both defaulting to null. Appearance score, if supplied,
  is finite in `[0,1]` and is ignored by the resolver.
- `LocalTracklet`: required `trackletId` and 1-32 `observations`.
  Frame indices and timestamps must each strictly increase within a tracklet.
- `Interval`: required `startSec`, `endSec`, with positive duration;
  intervals are half-open `[startSec,endSec)`.
- `Segment`: required `segmentId`, `scope`, `context`, `owned`, `tracklets`.
  Context duration is at most 120 seconds; positive owned interval must be
  wholly contained within context. There may be 0-16 tracklets. Every
  observation must fall within context, but need not fall within owned time.
- `ResolverRequest`: required `scope`, `anchors` (0-16), `segments` (1-8);
  optional nullable `targetJersey`, default null. At most 512 observations
  total, despite the larger product of per-container limits.

Anchor, segment, tracklet and observation IDs must each be unique across the
request within their entity kind. Tracklet IDs are not merely segment-local
IDs for this uniqueness check. Cross-kind reuse is allowed. Overlap copies
therefore need distinct observation IDs. All anchor and segment scopes must
equal the request scope in all four fields. Any cross-job, cross-source,
cross-generation or cross-model-set mismatch rejects the whole request.

Across observations, one frame index must map to exactly one timestamp and
one timestamp to exactly one frame index. Multiple detections/copies at that
same pair are allowed. This mapping check does not include anchors: an anchor
with a different frame/time pair simply has no match.

## Source PTS and Hash Boundary

Matching uses exact equality of both `frameIndex` and `timestampSec`, with no
epsilon, nearest-frame lookup or FPS-based timestamp reconstruction. Producers
must use one canonical source presentation timeline and frame-index convention
across segment boundaries. Do not substitute segment-relative time, wall time,
UI seek time, `frameIndex / nominalFPS`, or decoder sample ordinals. For variable
frame-rate media, preserve source PTS and a documented time-base/origin conversion;
derive every copy and anchor from the same canonical mapping. A source requiring
duplicate or nonmonotonic presentation times needs an explicitly validated
preprocessing policy, not silent adjustment inside this resolver.

The schema does not carry rational PTS/time-base metadata or verify decoding.
The adapter must establish and test those properties. The frame/time caps are
validation limits, not evidence that a four-hour match has been processed.

`sourceSha256` should bind the exact approved source bytes; `modelSetDigest`
should bind a canonical manifest of actual model/configuration versions.
`evidenceHash` must bind reproducible source-frame evidence under a documented
canonicalization policy. Overlapping copies must use the same policy and hash
the same evidence, not incompatible segment-specific crop encodings. Changed
source/model/configuration or corrections must invalidate stale scope as
appropriate; generation is a caller-managed revision, not a cache here.

These are producer/adapter requirements. The resolver only checks digest syntax
and equality: it does not compute hashes, authenticate their issuer, verify
source bytes, establish provenance or define a canonical evidence encoding.
Equal attacker-supplied hashes do not independently prove identity.

## Resolver Behavior

1. Revalidate the complete request. Initialize every observation to `UNKNOWN`.
   Process anchors in anchor-ID order; observation output is observation-ID sorted.
2. For each anchor, consider only observations with exactly its frame and time.
   Initial hits require box intersection-over-union (IoU) at least 0.5.
   Touching edges alone do not qualify. No hits means `UNMATCHED`.
3. Expand once to same-time observations overlapping any initial hit at IoU
   at least 0.5, including competitors not overlapping the anchor itself.
   This is not a temporal or iterative transitive expansion.
4. The resulting neighborhood must contain at most one observation per segment,
   and every pair of neighborhood boxes must overlap at IoU at least 0.5.
   Otherwise the anchor and involved observations are `AMBIGUOUS`.
5. For a unique neighborhood, every evidence hash must equal the anchor hash.
   All non-null readable jerseys, plus `targetJersey` if supplied, must contain
   at most one distinct string. Any mismatch is `CONFLICT`. With no supplied
   target jersey, two contradictory readable numbers still conflict.
6. Otherwise the anchor is `BOUND`, and neighborhood observations become
   `CONFIRMED_OBSERVATION`. This cross-segment association is only between
   consistent unique copies of the same instant; it is not a tracklet link.
7. When anchors affect an observation repeatedly, severity wins:
   `AMBIGUOUS` > `CONFLICT` > `CONFIRMED_OBSERVATION` > `UNKNOWN`.
   If confirmed observations at one frame include a nonoverlapping pair, all
   confirmed observations at that frame become ambiguous competing target claims.
   Anchor decisions are then reconciled with conflicts/ambiguity on their direct
   overlapping observations. No arbitrary winner is chosen.

Readable jerseys can invalidate evidence but cannot independently confirm it.
Shirt color, role and similarity fields are not accepted by this schema;
appearance scores cannot confirm or break a tie. Corrections replace the input
request/anchors and are resolved afresh; there is no hidden identity history.

## Output and Coverage

`ExperimentalResolverOutput` contains required `scope`, `observations`, `anchors`,
`uncertainWindows`, `ownedCoverageSec`; `experimental` defaults to and must be
true, and `confirmedCoverageSec` defaults to and must equal 0.0.

Observation decisions contain only `observationId` and one of
`CONFIRMED_OBSERVATION`, `UNKNOWN`, `AMBIGUOUS`, `CONFLICT` (maximum 512).
Anchor decisions contain only `anchorId` and one of `BOUND`, `UNMATCHED`,
`AMBIGUOUS`, `CONFLICT` (maximum 16).

Owned intervals are sorted and union-merged, including touching intervals.
`ownedCoverageSec` is their deduplicated duration, bounded by 960 seconds.
It describes supplied ownership, not independently verified decoded coverage.
Context-only time adds no coverage. Gaps outside the owned union add no coverage
and are not silently included in windows.

`uncertainWindows` contains that same owned union (maximum eight intervals),
each with `state="UNKNOWN"` and `reason="point_evidence_only"`. These are the
explicit intervals requiring review; there is no separate `reviewIntervals`
field. Even confirmed point observations contribute zero confirmed duration.
Context-only points can receive observation decisions without adding owned time.
The output model bounds fields; computed union/cross-field semantics are provided
by `resolve`, not a separate output provenance verifier.

## Synthetic Request and Output

All hashes below are fake repeated-character placeholders. This example is
entirely synthetic, not actual footage, measured accuracy or verified provenance.

```json
{
  "scope": {"jobId": "synthetic-job", "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "generation": 0, "modelSetDigest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
  "targetJersey": "17",
  "anchors": [{
    "anchorId": "anchor-1",
    "scope": {"jobId": "synthetic-job", "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "generation": 0, "modelSetDigest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
    "frameIndex": 25, "timestampSec": 1.0,
    "box": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.4},
    "evidenceHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
  }],
  "segments": [{
    "segmentId": "segment-1",
    "scope": {"jobId": "synthetic-job", "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "generation": 0, "modelSetDigest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
    "context": {"startSec": 0.0, "endSec": 10.0},
    "owned": {"startSec": 0.0, "endSec": 10.0},
    "tracklets": [{"trackletId": "track-1", "observations": [{
      "observationId": "observation-1", "frameIndex": 25, "timestampSec": 1.0,
      "box": {"x": 0.1, "y": 0.1, "width": 0.2, "height": 0.4},
      "evidenceHash": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      "readableJersey": "17", "appearanceScore": null
    }]}]
  }]
}
```

```json
{
  "scope": {"jobId": "synthetic-job", "sourceSha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "generation": 0, "modelSetDigest": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},
  "experimental": true,
  "observations": [{"observationId": "observation-1", "state": "CONFIRMED_OBSERVATION"}],
  "anchors": [{"anchorId": "anchor-1", "state": "BOUND"}],
  "uncertainWindows": [{"startSec": 0.0, "endSec": 10.0, "state": "UNKNOWN", "reason": "point_evidence_only"}],
  "ownedCoverageSec": 10.0,
  "confirmedCoverageSec": 0.0
}
```

## App Adapter Boundary

The app anchor representation based on a source path plus normalized bounds is
different from this offline worker's SHA-scoped, evidence-hashed schema. A source
path is not `sourceSha256`; bounds alone are not `evidenceHash`; a UI timestamp
is not automatically an exact source PTS/frame pair. Do not pass or rename fields
as though the contracts were interchangeable.

A validated adapter must authorize the source/job, resolve immutable source bytes,
verify scope and revision, map display orientation/crop/letterboxing to canonical
source coordinates, resolve source frame/PTS, compute documented hashes and reject
stale corrections or mismatches. Adapter tests must exercise those boundaries.
Callable/UI work does not make those guarantees implicit. No production adapter
or end-to-end integration is claimed by these foundations.

## Tests and Offline Resolve CLI

Existing executable checks, from `C:\ZLI\M335\ScoutX\workers\football-cv`:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_experimental_identity.py -q
.\.venv\Scripts\python.exe -m pytest tests/test_experimental_identity.py tests/test_experimental_identity_cli.py -q
.\.venv\Scripts\python.exe -m pytest -q
```

Before the CLI addition, the parent reported a full **114 passed**, including
the HTTP test under elevated execution. This supersedes the earlier HTTP-stall
note; it is a parent-reported baseline, not a new CLI test count. CLI integration
tests invoke the current Python interpreter (`sys.executable`) in subprocesses
with explicitly synthetic JSON, including exact 1 MiB and oversize boundaries,
invalid input/output, and refusal to overwrite. The kernel plus CLI targeted run
passed **74 tests** (53 kernel and 21 CLI cases), using the existing `.venv` and
`--basetemp=.pytest_cache/identity-cli-run-1` to avoid a sandbox temp-directory
permission error. Use a fresh workspace-local basetemp for a similar sandbox run.
Synthetic checks do not establish
annotated footage accuracy. Existing `eval.predict` and `eval.smoke` run the production pipeline;
they do not evaluate this experimental resolver and should not be presented as
its integration or accuracy evidence.

Implemented bounded offline command (from the same worker directory):

```powershell
.\.venv\Scripts\python.exe -m eval.experimental_identity resolve --request data/synthetic-request.json --out data/synthetic-result.json
```

`resolve` is the only subcommand; there is no `eval` or `evaluate` subcommand.
Both arguments are filesystem paths; URLs and UNC paths are rejected. The request
must be a regular file. The command makes one read of at most 1 MiB + 1 byte
(1,048,577 bytes) and rejects inputs exceeding 1 MiB (1,048,576 bytes), before JSON
parsing. It accepts UTF-8 JSON, rejecting duplicate object keys, nonfinite JSON
constants, malformed JSON and invalid request schemas. It invokes the pure
resolver, revalidates the output schema, and serializes it before creating output.

The destination must be a new path with an existing parent directory. Existing
files, directories and symlinks are refused, including using the input as output.
Exclusive creation prevents overwrite if another process creates the destination
after the initial check. No directories are created. Success writes indented JSON
with a trailing newline and returns zero; invalid JSON/schema, invalid resolver
output, path errors and oversized requests return nonzero. Invalid input never
creates output. A filesystem failure during writing may leave a partial newly
created file; writing is exclusive, not an atomic publication protocol.

The CLI performs no model loading/download, backend initialization, network calls,
footage reading or uploads. Local path spelling is checked, not a sandbox guarantee
against OS-mounted remote storage or symlink redirection; use trusted local paths.
It does not calculate evidence hashes or implement the production adapter.

Future annotated evaluation would need independent point truth and verified local
source/hash/model/PTS provenance, recorded code/configuration revisions, and clear
separation of synthetic and approved footage cases. No such evaluation command is
implemented. Any local footage evidence extraction must be a separate, explicitly
approved step using already available models, not a resolver side effect.

Report wrong-person point confirmations, missed supported points, ambiguous and
conflicting outcomes, unmatched anchors, owned-union coverage and review burden.
Do not score overlap copies as independent true positives. Include source/model/
generation mismatches, duplicate IDs, cap boundaries, NaN/extra fields, VFR/PTS
mapping, overlapping competitors, conflicting jerseys, nontransitive box chains,
context-only corrections and long gaps. Compare replacement corrections without
carrying hidden state between runs. Never translate point precision into temporal
coverage, full-match continuity or a general re-ID claim.
