# PitchProof 5.3 App Store submission handoff

**Updated:** 2026-11-04 (~22:10 CET) after engine/cards engineering pass  
**Authoritative ledger:** `docs/release/blocker-register-2026-11-04.md`  
**Engineering progress:** `docs/release/engine-cards-progress-2026-11-04.md`

---

## Verdict

# READY AFTER SPECIFIC NAMED EXTERNAL ACTIONS

Local engineering advanced (privacy-safe exports, coaching sufficiency, identity corrections on report screen, OCR provenance **E** default ON). **0 CODE blockers** expected from release-gate code paths; unit **724** pass. Submission still blocked on **named external** evidence. Not “READY FOR APP STORE SUBMISSION.” No tracking perfection or Apple acceptance claimed.

**Superseded:** any device/IPA validation against `6679226` / build 1.0.0 (4), and any freeze at `6d1266c` / `3cddd36` as the **shipping** candidate — freeze the tip SHA after this engineering commit instead.

---

## 1. Freeze identity (pending commit tip — resolve with `git rev-parse HEAD` after landing)

| Field | Value |
|---|---|
| Branch | `release/pitchproof-5-3-candidate` |
| Prior reported tip | `6d1266cf58dd60958d12d6e4381d126d109466d6` (docs-only; **pre** engine/cards) |
| Bundle / version | `com.scoutx.app` / `1.0.0` |
| ASC / Team | `6820059284` / `833CYAZ8XT` |
| Firebase / iOS app | `scoutx-230b0` / `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` |
| Expo | `@boddibossi/scoutx` |
| GPU baseline | `51d41c9…` ancestor |
| Tip archive | **none** |

---

## 2. Defaults (re-verified)

| Flag | State |
|---|---|
| C OCR consulted-only | **ON** |
| E OCR cache provenance | **ON** (new default this pass) |
| D appearance-only LIKELY disabled | **not promoted** |
| A/B | **off** |
| AI footage / CV worker | fail-closed / null |

---

## 3. What changed (local)

- Export/share cards respect privacy; non-public Passport cannot export CV/card stats.
- Discovery analysis sample count nullable (no fake zero).
- Report screen owner “not me” corrections wired.
- Coaching withheld with concrete next steps until identity + evidence suffice.
- OCR provenance default ON (narrow tracking reliability).

---

## 4. Gates (reconciled)

| ID | State | Blocks submit? |
|---|---|---|
| B-01 App Check | Live: providers **not configured**; DeviceCheck **No**; Enforce Off (rechecked) | **Yes** |
| B-02 / B-10 | Backup marker + RC webhook unproven | Ops |
| B-03 Counsel | LEGAL markers remain; export privacy tightened → may need counsel note | **Yes** |
| B-04 Owner SEC | `_pending_` | Gate |
| B-05 Device | Needs **new** tip TestFlight | **Yes** |
| B-06 D | Still PENDING; do not promote | Promote only |
| B-07 / B-09 | DEFER with REL-CPU | No if scoped |
| B-08 AI | Off / honest | No if not offered |
| B-11 / B-14 | Env names OK; tip archive missing | **Yes** |
| B-12 ASC | Template placeholders | **Yes** |
| B-13 REL-D-OFF | Needed for D-off ship | Decision |

---

## 5. Minimal owner actions

1. **App Check:** Console → scoutx-230b0 → App Check → PitchProof iOS → register App Attest + DeviceCheck → screenshot.  
2. **Owner:** Fill `owner-acceptance.md` (SEC + REL-D-OFF + REL-CPU).  
3. **Approve** EAS production build of **post-engineering tip SHA** → TestFlight → `real-device-protocol-5-3.md`.  
4. **Counsel:** Confirm privacy/export honesty (packet + note local export filter). Sync live legal pages.  
5. ASC App Review Information → Submit.

### Approval request — tip build (A1)

- **Action:** `eas build -p ios --profile production` then later `eas submit`  
- **Why:** No IPA exists for the engine/cards tip; old build invalid  
- **Commit:** full SHA after this commit lands  
- **Cost:** EAS build minutes  
- **Rollback:** do not submit; expire TestFlight  
- **Blocks:** submission and B-05/B-14  

---

## 6. Rollback

- E: `SCOUTX_OCR_CACHE_PROVENANCE=0`  
- Exports/cards/coaching: revert engineering commits  
- Do not submit until App Check + device evidence on tip  

---

## 7. Submission steps (only after 1–5)

1. Locate Expo build for frozen tip SHA (not `6679226`).  
2. Select in ASC TestFlight / version 1.0.0.  
3. Confirm demo account, privacy answers, AI/tracking honesty (AI off; tracking unavailable).  
4. Submit for Review.
