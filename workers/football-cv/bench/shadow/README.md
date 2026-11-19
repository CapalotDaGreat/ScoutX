# Two-match shadow evaluation kit (prepared 2026-11-19; not run)

Private, automatic-first comparison of the frozen control (all flags off) and candidate (T+D+C+I) plus three
single-flag ablations, on two matches nobody has seen predictions for. Plan of record:
`docs/video/internal-shadow-evaluation-plan-2026-11-18.md`; this kit is its runnable form.

## Hard prerequisites (each one blocks the next step)
1. **Footage on the PC.** Owner runs `hydrate.ps1 -Action Pin -Batch batch-01.txt`. Today 0 of 10 are local.
2. **Grouping.** `inventory.py` on the downloaded files; recordings of the same match (same local date, overlapping
   or adjacent capture times, same pitch/kit) form one group and stay together (`split.py add GROUP --members ...`).
   IMG_4809 and IMG_4529 are development, IMG_5105 is exposed (inspected); none of them is eligible.
3. **Owner identity confirmation per group** (`identity_confirmation_template.json`): the owner's own answer at an
   exact source timestamp, with its scope. Date/number hints alone never count. Without `"answer": "yes"`
   `freeze.py` refuses and `run_shadow.sh` cannot start.
4. **Freeze before inference** (`freeze.py`): source and proxy SHA-256, proxy-to-source timestamp mapping check
   (frame comparison at 8 plan times), frozen tree commit, model file hashes, full flag values of all five
   configurations, the sampling plan, the difficult-stretch list and the scoring-rule hash. Never overwritten.

## Steps per group
| Step | Where | Command |
|---|---|---|
| Proxy | PC VM | `make_proxy.py` per chunk, `assemble.py` (decoded-frame identity verified) |
| Plan | anywhere | `sample_plan.py --proxy-json P.json --group G --out plan.json [--exclude pre-match/half-time ranges chosen from raw video]` |
| Difficult stretches | PC (raw proxy, no overlays) | fill `difficult_stretches.csv` (reason, chooser, `predictions_seen=no`) |
| Labels | PC (raw frames) | `labels.csv` from `labels_template.csv`: every planned frame + difficult stretches; states `target_visible` (box) / `absent` / `occluded` / `uncertain`; labeller, role (agent/owner/independent) and exposure on every row |
| Freeze | PC VM (has the original) | `freeze.py ... --source ORIGINAL --mapping-check 8` |
| Run | workspace | `run_shadow.sh freeze.json proxy.mp4 OUTDIR /home/claude/work/dval/env.txt` (tree `f699669`) |
| Score | workspace | `score.py --plan --labels --run control_all_off=... --run candidate_...=... --changed-against control_all_off` |

Labels are written before any prediction exists for the group and are not edited afterwards; the post-run list of
changed claims is reviewed and reported **separately** from the predeclared scores. Agent labels are reported as
agent labels; owner or independent review is reported as such.

## Scoring (frozen by hash; see `score.py`)
Per match and per sampling method (fixed every 10 s, difficult, three 20-s sequences at 2 fps): recall with
target-visible abstentions and missing output **in** the denominator; claim precision; wrong-player CONFIRMED and
LIKELY; claims with no target; unverified claims on uncertain frames; missing output. A CONFIRMED wrong-player claim
on a labelled frame stops promotion work for that configuration (plan §7). A group that informs a fix is marked
exposed (`split.py expose`) and fresh footage is reserved for the successor.

## Storage budget
| Item | Size | Where |
|---|---|---|
| batch-01 originals (10 files) | 33.2 GB | PC (331 GB free; `hydrate.ps1` keeps ≥ 120 GB) |
| proxy per 45-min match | ≈ 0.9 GB (IMG_4529: 0.94 GB) | PC + workspace |
| stage 1 (control) | ≈ 1.0 GB (IMG_4529: 0.96 GB) | workspace |
| each further configuration (hard-linked stage 1, fresh caches) | ≈ 30 MB | workspace |
| **per match in the workspace** | **≈ 2.1 GB peak** | one match at a time, `--min-free-gb 0.5` |

The workspace currently has about 1.6 GB free, so one match does not fit yet. Before the first run, about 1 GB of
this workspace's own superseded scratch (for example the IMG_4529 proxy and release stage 1, whose results and
hashes are already committed) must be removed, or the run waits. Originals are never touched.

## Not in scope here
Owner-assisted runs (need their own frozen anchor protocol), any production/Firebase path, paid GPU, external AI,
footage leaving the PC/workspace, identity-model training.
