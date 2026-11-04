# PitchProof 5.3 App Store submission handoff

**Updated:** 2026-11-04 (~22:30 CET) after UX honesty / navigation pass  
**Authoritative ledger:** `docs/release/blocker-register-2026-11-04.md`  
**Engineering progress:** `docs/release/engine-cards-progress-2026-11-04.md`  
**UX audit:** `docs/release/ux-audit-2026-11-04.md`

---

## Verdict

# READY AFTER SPECIFIC NAMED EXTERNAL ACTIONS

Local product UX honesty improved (Welcome/Discover/coaching gates/Performance tab). Prior engine/cards work retained. **Controlled pilot** possible after Firebase/TestFlight for invited users; **not** App Store ready. Submission still blocked on **named external** evidence. No tracking perfection or Apple acceptance claimed.

**Superseded:** any device/IPA validation against `6679226` / build 1.0.0 (4); product freezes at `79c00d6` / docs `83c7600` — freeze the **post-UX tip SHA** after this commit.

---

## 1. Freeze identity

| Field | Value |
|---|---|
| Branch | `release/pitchproof-5-3-candidate` |
| **Release candidate (full)** | `47e49cf037671d964180404ee0cfd6212ed76006` |
| Prior product RC (superseded) | `79c00d6e8009ed68a6139cd39467afa78e8b0aa1` |
| Prior docs tip (superseded) | `83c760097e6bcbb8cadc1be43a745a14a9e798d3` |
| Bundle / version | `com.scoutx.app` / `1.0.0` |
| ASC / Team | `6820059284` / `833CYAZ8XT` |
| Firebase / iOS app | `scoutx-230b0` / `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` |
| Expo | `@boddibossi/scoutx` |
| GPU baseline | `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (ancestor) |
| Tip archive | **none** — A1 build not started |

---

## 2. Defaults (re-verified)

| Flag | State |
|---|---|
| C OCR consulted-only | **ON** |
| E OCR cache provenance | **ON** |
| D appearance-only LIKELY disabled | **not promoted** |
| A/B | **off** |
| AI footage / CV worker | fail-closed / null |

---

## 3. What changed (this tip)

- Share sheet: omit stats/endorsements/photo/tagline; confirm export preview before card share; downloaded copies cannot be recalled (copy disclosed in UI).
- Coaching scenario unit evaluations (strong/weak/mixed/sparse/identity/contradiction/coverage).
- Player cards: explicit evidence captions (trust-verified vs self-entered) on identity panels.
- E4 tracking defect: **left xfail** (no silent threshold drop / no solver overhaul).
- Owner decision pack template: `owner-decisions-template-5-3.md`.

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
- Known wrong-player xfails (incl. **E4**) retained — pipeline may **abstain** or mis-claim on some windows; do not describe as successfully tracking the selected player end-to-end.
- Coaching withheld until identity confirmed + moments/accepted events; insufficient paths give concrete next steps.
- Qualitative coaching judgment still needs **human review** in the field.

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
