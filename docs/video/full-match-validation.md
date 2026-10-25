# Independent selected-player full-match validation

This local workflow requires an explicit jersey and kit target, prepares and seals independent ground truth, scores a complete
authorized run and emits `accuracy.json` plus `accuracy.md`. It performs no model
training, footage upload, provider access or production approval. The commands below use orange #8 as an example; use `--jersey-number 20` for the separately authorized local orange #20 recording. No target defaults to a previous player. Orange #8 in the
140-minute Veo match is still unmeasured. A protected Veo viewing link is not an
input; obtain an authorized local export through the provider, without bypassing
authentication. Do not substitute the previously supplied orange #20 recording.

## Review protocol

Use pseudonymous reviewer/operator IDs, never player names. The ground-truth
reviewer must differ from the inference producer and must label footage before
seeing prediction traces, overlays or reports. Have another reviewer check jersey
8 and orange kit in readable source frames, including ambiguity at re-entry and
halftime. A pseudonym difference cannot prove human independence: blinding and
anchor review are explicit attestations, not automated identity verification.
The anchor reviewer must differ from the ground-truth reviewer; the inference
producer may perform that second anchor check. These are role checks only, not
proof that different pseudonyms represent different people.

Use the existing `eval.prepare_anchor` to obtain exact source-PTS/RGB frame hashes
and a draft manifest. Watch the source, manually supply the reviewed normalized
target box and retain the original anchor ID, scope, PTS and hash. Do not copy a
model-predicted box into ground truth. The new preparation command rehashes the
source and re-decodes the reviewed PTS/RGB anchors without initializing a model,
writing frames or contacting a provider. It may take time on a full recording.

The review draft fixes one sample every five seconds for the entire recording,
including halftime/non-play. A 140-minute recording has 1,680 samples. Do not
remove difficult samples. At each timestamp set:

- `visible`: source-pixel `[x1,y1,x2,y2]` box for the identifiable target.
- `off_camera`: target is not in view; `box: null`.
- `occluded` or `uncertain`: identity/visibility cannot be judged; `box: null`.
- `non_play`: halftime, interruption or unrelated recording; `box: null`.

Do not mark non-play when the target remains visible: label visible and attach
the `halftime` tag instead. Ground truth does not infer distance, on-pitch time,
events or unseen player activity. Optional difficulty tags are `halftime`,
`camera_cut`, `occlusion`, `re_entry`, `similar_kits` and `duplicate_number`.
Review boundary/re-entry samples carefully; tags are reviewer supplied, not
automatic scene detection.

Optional `otherPlayerBoxes` are anonymous, independently drawn source-pixel boxes
of other players (maximum 22 at a sample). They contain no names, jersey IDs or
biometrics and remain local review metadata. They allow a wrong-player claim to
be distinguished from an unexplained localization error. They must not overlap
the reviewed target at IoU >= 0.5. Never derive them from prediction output.

Set `anchorsReviewed` and `blindedBeforePredictions` to true only after the stated
review actually occurred. Every sample must leave `unreviewed` before sealing.
Uncertain/occluded samples and samples within 0.25 seconds of calibration anchors
are excluded, not silently counted as correct. Report denominators and scorable
fraction alongside accuracy; a wholly uncertain review is insufficient evidence.

## Commands

Run from `workers/football-cv` with its existing virtual environment. All paths
below are placeholders for authorized local files/new directories. Keep footage,
labels and generated reports outside source control. Existing outputs are never
overwritten. Every command requires explicit local evaluation authorization.

```powershell
$python = '.\.venv\Scripts\python.exe'
& $python -m eval.prepare_anchor --input C:\Evaluation\match.mp4 --out C:\Evaluation\anchor-001 --reference-sec 242 --job-id orange8-match --generation 1 --authorize-local-evaluation
```

Manually review the frame and complete the normalized box in a separately saved
`C:\Evaluation\anchors.reviewed.json` manifest. The timestamp above is only an
example, not a verified reference for orange #8. Supply a readable #8 timestamp.

```powershell
& $python -m eval.full_match_validation prepare --input C:\Evaluation\match.mp4 --anchors C:\Evaluation\anchors.reviewed.json --jersey-number 8 --kit-primary-color orange --evaluator reviewer_b --producer operator_a --anchor-reviewer reviewer_a --out C:\Evaluation\review-001 --authorize-local-evaluation
```

Complete the fixed samples in `review-001\review.draft.json` while blinded. Then:

```powershell
& $python -m eval.full_match_validation seal --review C:\Evaluation\review-001\review.draft.json --out C:\Evaluation\sealed-001 --authorize-local-evaluation
```

Only after sealing, run the existing evaluator if its existing experimental/CV
approval requirements are legitimately satisfied. This workflow does not set or
bypass them. A missing gate is a blocker, not permission to turn it on.

```powershell
& $python -m eval.match --input C:\Evaluation\match.mp4 --out C:\Evaluation\run-001 --jersey-number 8 --kit-primary-color orange --reference-sec 242 --anchor-manifest C:\Evaluation\anchors.reviewed.json --source-path profiles/OWNER/matchFootage/orange8-match/video.mp4 --anchor-revision 1 --authorize-local-evaluation --run
& $python -m eval.full_match_validation report --review C:\Evaluation\sealed-001\review.sealed.json --run-dir C:\Evaluation\run-001 --out C:\Evaluation\report-001 --authorize-local-evaluation
```

The source path is metadata binding, not an upload instruction. Its job ID and
generation must match the reviewed manifest. Inference uses existing cached
weights/CPU; it is not training. Report generation reads bounded metadata only.
It rejects source/target/model/anchor changes, non-target candidates, incomplete
segments and failed decode audits. Local file and symlink containment checks
prevent resolving run files outside the supplied directory.
Every segment must explicitly contain a `targetTrace` array. An empty array means
recorded abstention; a missing, null or malformed trace is not scored as abstention.

## Metrics and report interpretation

The report records raw counts, per-ten-minute and per-difficulty slices, source
SHA-256, sealed-review digest, per-file prediction digests, exact worker/models,
reviewer IDs, sampling policy and exclusions. A seal detects accidental edits
against its recorded digest; it is not a signature, trusted timestamp, proof of
blinding or protection against someone deliberately resealing altered labels.
Preserve the original seal before inference in independently controlled storage
for a stronger audit trail. No automatic trust or cloud transfer is implied.

- Identity precision: correct target boxes / all target-box claims at scored samples.
- Confirmed wrong-player rate: claims overlapping an annotated other player at
  IoU >= 0.5 / all scored target-box claims. This is a lower bound when not every
  other player is boxed.
- Wrong-or-mislocalized rate: all incorrect target-box claims / scored claims,
  including unsupported claims when target is absent/non-play. Low IoU alone is
  not asserted to prove a different person's identity.
- Target recall: correctly localized target / reviewed visible samples.
- Abstention: no target box / scored samples, separately from exclusions.
- Visibility precision/recall: `CONFIRMED_VISIBLE` availability against reviewed
  visibility at scored timestamps. Correct visibility is not correct identity.

Nearest target trace within 0.25 seconds is matched deterministically; identity
IoU threshold is 0.5. Zero denominators produce null, not perfect scores. These
are sampled metrics, not second-weighted coverage, calibrated probabilities or
proof of continuous identity. Five-second sampling can miss brief identity
switches; it does not establish switch frequency or continuous recovery latency.
The JSON includes every scored outcome so reviewers can investigate errors.

## Release boundary

This report format is intentionally separate from production approval artifacts.
`productionApproval`, `modelTraining` and `cloudUpload` are always false. One match
cannot satisfy the existing multi-video/multi-annotator/difficulty requirements.
Do not manufacture an approval record or publish an accuracy percentage before
authorized real footage, reviewed labels and an exact complete run are available.
Next validation stages are denser boundary annotation, independent second-reviewer
agreement and representative multi-match evaluation under the existing policy.
### Early local inference preflight

`eval.match` accepts `--preflight-review <local-review.json>` for the raw independent
review metadata prepared by `eval.full_match_validation`. Use it together with
`--anchor-manifest` for the flagship orange #8 workflow. It requires reviewed-anchor
and blind-review attestations and exact agreement on source SHA256, metadata
duration, target and the complete anchor manifest (including generation/model scope).
It does not require completed ground-truth labels before inference.

Before any output directory or model initialization, anchored plans and runs check
both existing approval gates, source hash, anchor bounds, owned source job and the
installed `model_versions()` digest. They then reuse `resolve_local_anchors` to
verify exact decoded PTS/RGB evidence and build the sampled proof. This second phase
decodes the recording; it is not metadata-only, but performs no model inference and
persists no frames. Loaded component versions must still match the preflight binding.
The installed version binding is not a weights-content checksum or cache-availability
guarantee. Without a review file the manifest itself does not bind jersey/kit, so no
independent target-review binding is claimed. No accuracy or release approval follows
from a successful preflight; authorized real orange #8 footage and independent labels
are still required.
