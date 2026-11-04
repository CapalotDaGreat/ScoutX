# Independent review of candidate D — operator brief

**Status:** D **not promoted**. Default remains appearance-only LIKELY allowed (`SCOUTX_APPEARANCE_ONLY_LIKELY` default `"1"`). Enabling D means setting env to `"0"` so appearance alone never yields LIKELY.

**Do not** treat any AI or author re-review as independent.

---

## 1. Suitable reviewer

Someone who:

- Can watch the local match proxy `IMG_4809` (or equivalent local copy),
- Has **not** read PitchProof 2026-11-02/03/04 identity reports, scores, traces, or agent chats about these frames,
- Is not the author of `label_corrections_i0225.json`.

Unsuitable: packet author, anyone who saw model predictions/states, this coding agent.

---

## 2. What to give the reviewer (local only)

| Give | Path |
|---|---|
| Build instructions + rubric | `workers/football-cv/bench/results/5.3/identity-review-packet-20261103/README.md` (**Version 2**) |
| Items | `.../items_v2.json` |
| Video | Local `IMG_4809_proxy_10fps.exact.mp4` (never commit / never upload in this workflow) |

**Build (on a machine with the video + worker venv):**

```text
cd workers/football-cv
python bench/review_packet.py --video <LOCAL_PROXY_MP4> \
  --items bench/results/5.3/identity-review-packet-20261103/items_v2.json \
  --out <LOCAL_OUT_FOLDER>
```

Reviewer receives `<LOCAL_OUT_FOLDER>` with images, `answers.csv`, `RUBRIC.txt` only.

**Do not give** before stage-1 is finished:

- `workers/football-cv/bench/results/5.3/identity-review-private-20261104/` (mapping + stage2)
- `failure_inventory.json` / scoreboards / traces

---

## 3. How they complete it

### Stage 1
For each box in `answers.csv`:

| Field | Values |
|---|---|
| `answer` | `target` (#20), `other`, or `uncertain` |
| `legibleNumber` | only if readable in **that** frame |
| `uncertainty` | `none` / `occlusion` / `crowd/contact` / `small/blurred` / `identity continuity` / `other` |
| `notes` | what the decision rests on |

Rules from packet: do not force certainty; do not decide from kit colour alone in crowds.

Record on return: initials/name, date, independence attestation, display limitations.

### Stage 2 (coordinator only after stage-1 committed)
Hand over `identity-review-private-20261104/stage2_corrections.csv`. Reviewer marks each proposed correction C1–C8: supported / unsupported / uncertain.

---

## 4. Reconciliation

1. Commit stage-1 `answers.csv` (reviewer initials + date in filename or README).
2. Score vs original labels **and** vs proposed corrections separately (existing protocol in packet README).
3. Open private `mapping_v2.json` only after stage-1 is locked; verify `privateMappingSha256` in `items_v2.json` still matches.
4. Cover explicitly in write-up:
   - proposed label corrections,
   - D’s unverified removed claim frames,
   - crowded set-piece paths (J / related items),
   - ambiguous / uncertain-heavy items.

---

## 5. Decision rule for D promotion

| Outcome | Action |
|---|---|
| Independent review supports that appearance-only LIKELY caused false attribution on reviewed paths, and removing those LIKELY claims is acceptable product behavior | Owner may authorize **D on** for release branch (`SCOUTX_APPEARANCE_ONLY_LIKELY=0`) + tests + ledger update |
| Review inconclusive, or corrections unsupported, or reviewer not independent | **Keep D off**; do not promote |
| Review shows labels themselves wrong | Fix labels first; re-score; do not silently promote D |

**Separate decision:** shipping **with D still off** (below).

---

## 6. Release with D off — residual risk (honest)

Leaving D off does **not** make appearance-only false attribution disappear. It means the current decoder may still emit **LIKELY** from appearance without OCR/number evidence.

| Question | Answer |
|---|---|
| Is “D off” an App Store blocker? | **No** — Apple does not grade this model flag |
| Is it a product-safety / honesty gate? | **Yes** — UI and store copy must not present LIKELY/appearance-only as confirmed tracking |
| Can 5.3 still ship scoped release? | **Yes, if** continuous CV tracking stays unavailable, abstention ≠ success, and owner **accepts** residual false-attribution risk **or** waits for D review |

Owner must explicitly choose one of:

1. **Wait** for independent D review before any identity-marketing claims beyond still-frame limited mode, or  
2. **Accept D-off residual risk** in `owner-acceptance.md` (new row or note) for a scoped release that keeps CV worker off and discloses uncertainty.

This agent will not promote D.
