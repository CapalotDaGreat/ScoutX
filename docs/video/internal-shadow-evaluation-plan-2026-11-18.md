# Internal shadow evaluation: executable plan (prepared 2026-11-18, not started)

Purpose: measure the candidate tracking configuration on the owner's own authorized footage, privately, with no
user-visible output. This is **not** a participant pilot. Nothing here enables analysis, changes a default, deploys
or uses paid cloud resources.

## 1. What runs
| Item | Value |
|---|---|
| Release baseline | `32ab43f1f5c6274c5d7672b25fa4ac37163bbb7c`, all flags off |
| Candidate tree | `f699669d400eb92e5da43bcf9aced35ce06cd690` (only engine change vs 0bae8d7: candidate I) |
| Configurations | off, T, D, C, D+I, T+D+C, T+D+C+I (automatic); owner-assisted only under section 4 |
| Models | YOLOX-s ONNX (`/home/claude/work/det`, SHA-256 listed in `full_match.json`), docTR 1.1.0 PARSeq, EasyOCR 1.7.2 |
| Runtime | CPU, onnxruntime CPUExecutionProvider, batch 1, decoder cv2, env file `/home/claude/work/dval/env.txt` |
| Input | product-equivalent 10 fps proxy built by `bench/footage/make_proxy.py` on the owner PC, joined by `assemble.py` (decoded-frame identity verified) |
| Where | this cloud workspace (2 CPU) for engine runs; owner PC Linux VM for inventory, proxies and app/backend tests. **No** Firebase project, **no** production worker, **no** external AI |

## 2. Limits
- One match at a time. The workspace keeps ≥ 0.5 GB free (`--min-free-gb 0.5`), and the owner PC keeps
  ≥ 120 GB free (`hydrate.ps1`).
- Stage 1 runs once per match, with the release tree. It is reused by hard link for every configuration; proven
  bit-identical across trees on IMG_4809 600–630 s (section 25 of the ledger).
- Every configuration gets fresh, empty mutable caches. A candidate is never seeded with another run's OCR cache.
- Expected cost: about 3–4 h CPU per 45-min match for stage 1, plus about 0.5 h per configuration.

## 3. Footage and exposure
| Match | Status |
|---|---|
| IMG_4809 | development |
| IMG_4529 | development / exposed (designed candidate I) |
| IMG_5105 | exposed evaluation (inspected; not untouched) |
| Untouched | **none available yet**. Needs downloaded recordings (batch-01) |

Next split, declared **before any prediction**:
1. Run `inventory.py`. Take every downloaded recording ≥ 10 min, with its camera date (embedded `creationdate`) and
   size.
2. Group recordings of the same match: same local date, overlapping or adjacent capture times, same pitch/kit.
   Keep a group together.
3. Take the first two groups in chronological order that the owner has confirmed contain the player. Owner states
   the shirt number and kit; date hints alone are not enough. Freeze them with `split.py add` before proxies are
   run through the engine. Partition comes from the hash rule. If the rule puts both in validation, they are still
   used, in that order. No group is skipped for being difficult.
4. Record the source SHA-256, proxy stream SHA-256 and the predeclared annotation plan in `split.json`.

## 4. Annotation and review (predeclared)
- **Target labels:** every 10 s of match time (one frame), from the proxy, *before* viewing predictions.
  - States: target box / absent / occluded / unsure, with legibility and contact tags.
  - Annotator: agent. These are agent-authored, not independent.
- **Owner spot-check:** 30 of those labelled frames, sampled uniformly by the script, shown without predictions;
  owner marks agree / disagree / unsure. Owner spot-checks measure label reliability, not recall.
- **Owner-assisted mode:** the owner taps the player at the first 2 moments they choose from the raw video
  (no predictions shown). Those taps are replayed for every configuration. The burden recorded is taps and seconds.
- **Metrics:**
  - correct, wrong-player CONFIRMED and LIKELY, abstain when the target is visible, missing output, unverified;
  - switches and fragments, acquisition delay;
  - all per match, with match-level uncertainty (bootstrap by 60-s blocks, not by frame).

## 5. Outputs
- Per configuration: `full_match.json`, `timeline.npz` and `result.json`, kept in the workspace.
- `compare_frames.py` reports and a per-match results JSON (numbers only) go into git. Footage, frames and crops
  never go into git.
- Nothing is written to Firestore, Storage or any user account. No notifications. No publication.

## 6. Retention and cleanup
- Proxies and stage-1 data are deleted from the workspace after results are committed and their hashes recorded.
  They can be regenerated from the PC chunks.
- PC proxies stay in `.local\footage-lib\proxies` until the owner decides. Originals are never touched or evicted.

## 7. Stop criteria
- Any CONFIRMED wrong-player claim on a labelled frame stops promotion work for that configuration until it is
  traced.
- A run that does not complete, or a cache/provenance mismatch, invalidates that cell; rerun it.
- Workspace below 0.5 GB or PC below 120 GB: pause.
