# PitchProof 5.3 App Store submission handoff

**Updated:** 2026-11-09 after cold Linux full-match completion + local reliability/coaching fixes  
**Authoritative records:** `docs/release/scout-tracking-ledger-2026-11-04.md`, `docs/release/gpu-durable-ledger-2026-11-09.md`  
**Earlier text below the verdict is historical and is not the current engine status.**

---

## Verdict

# NOT READY — CONCRETE BLOCKERS REMAIN

Cold Linux CPU full-match on `8e1b633` completed (exit 0, 20350 frames, labelled recall 0.621 / wrong-player 0 on the T IoU≥0.5 table). That repairs the 2026-11-05 Windows allocator failure for cold CPU processing. It does **not** close the GPU accuracy gap: the approved 2026-11-07 L4 session stocked out; Part A on `51d41c9` still has no completed GPU profiles. DETOUR and E remain off by default. P, #6/#17 appearance windows, and independent D review remain open. Stage-1 chunk hashes differ across cold Linux vs resumed Windows despite the same fingerprint — treat cross-host claim diffs carefully.

Do not start a paid build, TestFlight upload, deploy, GPU allocation, or App Store submission without the named external actions / new GPU APPROVAL. External items still required: counsel, `AI_FOOTAGE_PROCESSING_APPROVED`, backup/restore evidence, owner SEC acceptance, real device pass, production Firebase/RevenueCat/`GoogleService-Info.plist`, CV approval, App Check registration, and (for GPU) the 2026-11-09 proposal APPROVAL.

**Superseded:** the 2026-11-04 "ready after named external actions" verdict, and any statement that DETOUR or E is on by default.

---

## Verdict as of 2026-11-04 (historical)

# READY AFTER SPECIFIC NAMED EXTERNAL ACTIONS

Scout Discover honesty improved (freshness/coverage, no preference/potential overclaim). Engine **DETOUR_SPLIT** repairs E4 (and clears E3 likely-N on `reference_i0225`). **Controlled pilot** possible after Firebase/TestFlight for invited users; **not** App Store ready. Tracking is **not** yet flagship-ready (P open; full-match cold replay with DETOUR not re-run here). Submission still blocked on **named external** evidence.

**Superseded:** product `47e49cf` / docs `bfbda44`; any device/IPA against `6679226` / build 1.0.0 (4). Freeze the **post-update tip SHA** after this commit.

---

## 1. Freeze identity

| Field | Value |
|---|---|
| Branch | `release/pitchproof-5-3-candidate` |
| **Release candidate (app/scout)** | `1eebf5c009e88d9ac5adbc804abd5ac459d81cd0` |
| **Engine tip (DETOUR_SPLIT)** | `cd8ba966b3bc34751a06391f16952dcb4e2a1b1e` |
| **Coaching tip** | `45a1ee5c789851ccb7c677a91d6b919be6be0edc` |
| Prior product RC (superseded) | `47e49cf037671d964180404ee0cfd6212ed76006` |
| Prior docs tip (superseded) | `bfbda446dfd09acd9a9a1ec7afa2606da836989c` |
| Bundle / version | `com.scoutx.app` / `1.0.0` |
| ASC / Team | `6820059284` / `833CYAZ8XT` |
| Firebase / iOS app | `scoutx-230b0` / `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` |
| Expo | `@boddibossi/scoutx` |
| GPU baseline | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor) |
| Tip archive | **none** — A1 build not started |

---

## 2. Defaults (re-verified 2026-11-09)

| Flag | State |
|---|---|
| C OCR consulted-only | **ON** |
| E OCR cache provenance | **OFF** unless `SCOUTX_OCR_CACHE_PROVENANCE=1` |
| D appearance-only LIKELY disabled | **not promoted** (code default still allows appearance-only LIKELY) |
| A/B | **off** |
| DETOUR_SPLIT (E4 one-frame detour) | **OFF** unless `SCOUTX_DETOUR_SPLIT=1` |
| AI footage / CV worker | fail-closed / null |

---

## 3. What changed (this tip)

- Scout Discover honesty: freshness/coverage on cards; brief gap codes; filter chips; no preference/potential overclaim (`1eebf5c`). Research: `scout-product-research-2026-11-04.md`. Mock evidence: `docs/release/evidence/scout-discover-freshness-2026-11-04.png`.
- **DETOUR_SPLIT** (default on): repairs E4 one-frame CONFIRMED on wrong player at `reference_i0225` w211; clears E3 likely-N as side-effect (`cd8ba96`). P remains xfail. Full-match cold replay with DETOUR **not** re-run locally (no stage-1 replay package).
- Coaching gates: match-review pass insights require confirmed evidence; short-clip coaching requires cited observables + drill objective/success criteria (`45a1ee5`).

---

## 4. Gates (reconciled)

| ID | State | Blocks submit? |
|---|---|---|
| B-01 App Check | Live CLI: providers **not configured**; Enforce Off (rechecked 2026-11-04) | **Yes** (callable failures → 2.1 risk) |
| B-02 / B-10 | Backup marker + RC webhook unproven; restore script ready dry-run only | Ops |
| B-03 Counsel | LEGAL markers remain; export field-select is material → counsel note | **Yes** |
| B-04 Owner SEC | `_pending_`; template ready | Gate |
| B-05 Device | Needs **new** tip TestFlight | **Yes** |
| B-06 D | Still PENDING; do not promote | Promote only |
| B-07 / B-09 | DEFER with REL-CPU | No if scoped |
| B-08 AI | Off / honest | No if not offered |
| B-11 / B-14 | Env names OK; tip archive missing | **Yes** |
| B-12 ASC | Template placeholders | **Yes** |
| B-13 REL-D-OFF | Needed for D-off ship | Decision |

---

## 5. Tracking / coaching honesty

- Continuous tracking **not** claimed as shipping; CV worker null.
- **E4 repaired** on `reference_i0225` under DETOUR_SPLIT; **P** still xfail (pause-and-resume). Residual confirmed-N on exchange region 176–191 / 195–197 / 208 unchanged.
- Do **not** describe full-match processing as full-match accuracy validation without labelled review + DETOUR cold replay.
- Coaching withheld until identity confirmed + moments/accepted events; pass “confirmed” copy no longer counts LIKELY moments. Qualitative judgment still needs **human review**.

---

## 6. Player cards / public exports

- Public share card + CV refuse non-public Passports.
- Owner selects fields within privacy; preview confirmation required for image share.
- Private coaching criticism is **not** on the share card.
- No live user profile was published during validation.

---

## 7. Minimal owner actions

1. **App Check:** Console → scoutx-230b0 → App Check → PitchProof iOS → register App Attest + DeviceCheck → screenshot. Do **not** flip product Enforce until TestFlight metrics look healthy.  
2. **Owner:** Fill `owner-acceptance.md` from `owner-decisions-template-5-3.md` (SEC + REL-D-OFF + REL-CPU).  
3. **Approve A1** EAS production build of **frozen tip SHA** → TestFlight → `real-device-protocol-5-3.md`.  
4. **Counsel:** Confirm privacy/export honesty (packet + field-select/preview). Sync live legal pages.  
5. ASC App Review Information → Submit (only after 1–4).

### Approval request — tip build (A1)

- **Action:** `eas build -p ios --profile production` then later `eas submit`  
- **Why:** No IPA exists for this tip; old build `1.0.0 (4)` @ `6679226` invalid  
- **Commit:** `47e49cf037671d964180404ee0cfd6212ed76006`  
- **Project:** Expo `@boddibossi/scoutx` / ASC `6820059284`  
- **Expected:** Finished iOS build whose provenance matches tip SHA; TestFlight install  
- **Evidence to return:** EAS build ID, git commit on build page, TestFlight build number  
- **Cost:** EAS build minutes  
- **Rollback:** do not submit; expire TestFlight  
- **Blocks:** submission and B-05/B-14  

### Approval request — App Check registration (A2)

- **Action:** Register App Attest (+ DeviceCheck) for iOS app in Firebase Console  
- **Why:** Live providers still “not configured”; callables already request App Check  
- **Project:** `scoutx-230b0` / app `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1`  
- **Navigation:** Firebase Console → App Check → Apps → PitchProof iOS  
- **Expected:** Providers registered; metrics after TestFlight session  
- **Evidence:** Screenshots (no secrets)  
- **Cost:** DeviceCheck key creation (Apple); no Firebase Enforce flip in this step  
- **Rollback:** leave Enforce Off (already Off)  
- **Blocks:** safe TestFlight callables / review risk  

### Approval request — isolated restore (A4) — billable

- **Action:** Enable PITR or backup schedule; restore into **new** DB ID; dry-run then optional execute deletions re-apply  
- **Commands (after restore DB exists):**  
  `node scripts/reapply-deletions-after-restore.mjs --project scoutx-230b0 --database-id <RESTORE_DB_ID> --dry-run`  
- **Never** restore over `(default)`  
- **Evidence:** date, operator, restore DB ID, dry-run summary; then update `docs/security/backups.md`  
- **Blocks:** B-02 ops gate only (not Apple rule)

---

## 8. Rollback

- E: `SCOUTX_OCR_CACHE_PROVENANCE=0`  
- Exports/cards/coaching: revert tip engineering commits  
- Do not submit until App Check + device evidence on tip  

---

## 9. Submission steps (only after owner actions 1–5)

1. Locate Expo build for frozen tip SHA (not `6679226`).  
2. Select in ASC TestFlight / version 1.0.0.  
3. Confirm demo account, privacy answers, AI/tracking honesty (AI off; continuous tracking unavailable).  
4. Submit for Review.
