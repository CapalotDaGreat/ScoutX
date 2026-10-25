# Flagship Video Intelligence Architecture

Date: 2026-10-23. Status: proposed architecture, not deployed capability.
Companion: `intelligence-v2-delivery.md` records implemented changes and actual checks.

Implementation follow-up: `target-identity-foundations.md` documents the now-implemented
experimental offline contracts/resolver/CLI. The app now has a separately gated sampled-frame
rectangle editor and transactional server-owned anchor revisions. The proposed temporal
association, appearance Re-ID, timeline and calibration stages below are still proposals;
the offline resolver is not connected to production v2 and never confirms temporal coverage.

## Evidence And Corrections To The Supplied Research

The local code, not the remote default branch, is the implementation baseline. Existing
Expo feature components, Firebase repositories, generation-aware Cloud Tasks, consent,
quotas and approval gates remain authoritative.

The actual authorized fixture is approximately 33:55, 2.23 GB, 1080p HEVC 10-bit HLG,
not an established 140-minute Veo recording. Its camera/vendor origin has not been
verified. Target 20, orange/white, CAM is user nominated. The readable manual anchor
is 242 seconds. No match-clock or half-time boundaries have been annotated.

The local RT-DETR/ByteTrack/EasyOCR baseline processed 10 frames over seconds 240-245
in 20.261 CPU seconds after 7.975 seconds cached model loading. Identity remained
UNKNOWN with no confirmed target trace. This is a useful negative baseline, not an
accuracy estimate. Torso OCR can miss the shorts number visible to a human.

Local decoder protocol isolation and single-thread slice decoding were needed for
the combined Windows reference runtime. Do not extrapolate this run to GPU cost or
production throughput. Production HTTP decoding was not modified by that fix.

## Decisions

1. Retain RT-DETR, ByteTrack and EasyOCR as the measured baseline; benchmark alternatives
   independently before changing the approved model set.
2. Separate durable match target identity from transient tracker IDs. Neither kit similarity
   nor the nominated playing position establishes same-player identity.
3. Introduce a versioned experimental contract beside v2; do not silently add tracklets,
   embeddings or new visibility states to the currently approved wire contract.
4. Preserve original source timestamps. Match-clock mappings and camera/play states
   are independent, explicitly reviewed evidence, not guessed from recording duration.
5. Require confirmed identity and validated calibration before observed pitch occupancy.
   Never interpolate absent-player movement or derive physical metrics from pixel paths.
6. Keep multimodal coaching downstream of verified evidence. General-purpose video
   understanding is not a long-term identity resolver.

## Stage Boundaries

Intake and source validation -> timeline proposals -> bounded segment tracklets ->
ordered match-scoped resolver -> evidence verification -> observed metrics -> coaching.

Each stage reads an immutable input manifest identified by source hash, pipeline
generation, model-set digest and configuration digest. Results commit only if that
generation is current and the job is not cancelled. Deterministic stage keys prevent
duplicate committed events and quota accounting. Preventing duplicate *paid work*
also needs expiring per-stage leases, not merely idempotent final writes.

Parallel segments may decode overlapping context but own non-overlapping output
intervals. Only owned timestamps contribute to coverage, events and billing summaries.
Reconciliation orders completed segment manifests; arrival order cannot determine identity.
Missing segments produce incomplete coverage, never an implicit successful whole match.

## Proposed Bounded Models

All models below are proposed, not existing persisted collections or working endpoints.

- `TargetAnchor`: match/source/generation identifiers, original timestamp, normalized
  bounding box, frame dimensions and frame evidence hash; human/automatic provenance,
  reviewer identity and revision. A click confirms only that anchor observation.
- `TrackletManifest`: segment and camera-epoch identifiers, local track ID, owned/context
  bounds, sampled boxes, digit evidence with crop source, team evidence, quality flags,
  optional appearance-artifact reference and exact model provenance.
- `TargetAssociation`: target/tracklet references, explicit accepted/candidate/ambiguous/
  rejected state, supporting and contradicting evidence, bounded validity interval,
  association revision and resolver version. Similarity scores are not probabilities.
- `MatchTimeline`: ordered, non-overlapping source intervals with period/play/camera
  state, review provenance and optional period-relative match-clock anchors. Unknown
  gaps remain explicit; interruptions and stoppage need distinct mappings.
- `CalibrationEvidence`: camera epoch and validity interval, ground-plane landmark
  correspondences, pitch dimensions/orientation source, transform, residual, uncertainty
  and rejection reasons. Camera movement invalidates stale transforms.
- `StageUsage`: attempt ID, deterministic stage key, lease owner/expiry, model load/decode/
  inference time, resource allocation, retries and externally reconciled billing data.

Set strict count/byte/duration ceilings before accepting each contract. Dense boxes and
appearance vectors belong in private, bounded object artifacts, not an unbounded Firestore
document. Firestore holds immutable manifest references and small status summaries.

## Identity Resolver Rules

Anchor association starts from a user-reviewed frame and a uniquely overlapping detection;
ambiguous overlap requires review, not nearest-box guessing. Manual rectangle selection
must remain available if a segmentation model fails or is not licensed/deployed.

Within an uninterrupted camera epoch, combine observed motion, tracklet continuity,
jersey evidence and quality-screened appearance features. Across cuts, long gaps or halves,
motion alone is invalid; require independently validated stronger evidence or another anchor.
Use a globally compatible assignment rather than independently accepting every similarity.
Simultaneous incompatible tracks cannot both be the target. Conflicting readable digits and
contradictory anchors veto acceptance; unavailable digits are not negative jersey evidence.

Do not promote every observation on a track because one frame was confirmed. Association
validity ends at ambiguity, gap or camera transition unless the resolver has validated
support. Group uncertainty into bounded review intervals so users review meaningful
transitions, not hundreds of duplicate frames. A correction invalidates dependent intervals,
metrics and coaching and creates a new generation. Undo is not resurrection of old claims.

Appearance artifacts are match-scoped personal data even without faces. Use no facial
recognition, cross-user gallery or persistent person identity database. Artifact access must
be server-only, purpose limited and deleted with source/job retention and account deletion.
Scheduled cleanup needs a tested deletion manifest; storage TTL alone is insufficient proof.

## Timeline, Heatmaps And GPS

Preserve source PTS, reviewed period-relative clocks and optional displayed match clock
separately. Do not equate 45 elapsed minutes with half-time. Replay/non-play candidates
must be reviewed or validated before exclusion from metrics; do not destroy source media.

Video occupancy uses confirmed ground-contact observations projected through a valid
camera-specific calibration. Reject degenerate/poorly supported transforms and implausible
projections. Weight occupancy by valid observed duration, never raw frame count under
adaptive sampling. Report the observed-time denominator, omitted intervals and uncertainty.

Current imported GPS session-local grids are not aligned pitch maps. Fusion additionally
needs field dimensions, explicit orientation, half direction, activity-clock provenance and
reviewed video/GPS synchronization with drift/error limits. Keep original geographic data
ephemeral under the existing privacy design. FIT/ZIP/vendor adapters remain separate work.

## Research And License Check

Official sources checked 2026-10-23; repository licenses are not blanket permission for all
bundled dependencies, weights, training data or hosted commercial use. Obtain owner/legal
decisions on exact pinned artifacts before incorporation.

- [SoccerNet-GSR](https://github.com/SoccerNet/sn-gamestate) combines tracking/identity/pitch
  reconstruction, but its [reference code license is GPL-3.0](https://raw.githubusercontent.com/SoccerNet/sn-gamestate/main/LICENSE).
  Treat benchmark use, dataset access and production code reuse as separate decisions.
- The supplied BoT-SORT URL returned 404; the [author repository](https://github.com/NirAharon/BoT-SORT)
  documents optional Re-ID and camera-motion approaches. Its MOT results do not establish
  football-target re-entry accuracy. Audit constituent detectors/Re-ID weights separately.
- [SAM 2](https://github.com/facebookresearch/sam2) supports prompted segmentation/video
  propagation. It is a candidate selection aid, not identity proof. Check its Apache/BSD
  notices and exact checkpoint/dependency terms; it is not installed in this pass.
- [Ultralytics licensing](https://www.ultralytics.com/license) requires explicit review of
  AGPL versus enterprise terms before a proprietary deployment. No YOLO package added.
- [Veo download guidance](https://support.veo.com/hc/es/articles/4451733961361-C%C3%B3mo-descargar-tus-partidos-de-Veo)
  limits ordinary match downloads to authorized follow-cam recordings, not panoramic or
  interactive views. Do not scrape viewer links or claim an integration/partnership exists.
- [FIFA EPTS](https://inside.fifa.com/innovation/standards/epts) includes optical and wearable
  performance evaluation. PitchProof is not certified; choose metric-specific reference
  tests instead of presenting sparse video estimates as certified physical measurements.

## Implementation Sequence And Acceptance

### Milestone 1: Trusted Target Review

Create private annotations around 242 seconds and difficult intervals. Separate calibration
and held-out evaluation slices; record identity-positive, ambiguous and genuinely unobservable
intervals. Establish consent, source hash, annotation revision and independent reviewer.

Then implement normalized anchor geometry/accessibility, bounded experimental tracklet
contracts, and a deterministic resolver behind an off-by-default gate. Evaluate torso/shorts
digit evidence separately; never relax consensus merely to make this fixture succeed.

Test stale generations, source/model mismatches, boundary overlaps, contradictory anchors,
co-visible competitors, cuts, re-entry, cancellations, retention and correction invalidation.
Report target precision/recall and wrong-attribution/recovery rates with sample sizes and
uncertainty. A proposed 99% precision goal is not an approved threshold or current result.

### Milestone 2: Positional Intelligence

Add reviewed two-clock timeline, calibrated field landmarks and observed-only occupancy.
Measure calibration residual and ground-plane error against independent references across
camera movement, partial fields and direction changes. Withhold maps outside valid coverage.

### Milestone 3: Physical And Tactical Intelligence

Evaluate target-attributable temporal ball interactions before event counts. Validate distance,
speed and sprint definitions independently using sufficiently continuous calibrated observations
or reference wearables. Benchmark coaching groundedness separately from tracking accuracy.

### Production Acceptance

Require pinned container/model artifacts, private authenticated GPU service, restricted media
access and SSRF controls, actual cost telemetry, bounded concurrency, failure/lease recovery,
cleanup verification, representative held-out recordings, and physical-device lifecycle tests.
Neither a CPU smoke nor passing software unit tests satisfies these gates. No deployment,
provider footage upload, additional model purchase or release approval is authorized by this ADR.
