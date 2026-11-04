# Reauth / TLS / App Check verification pass (2026-11-04 ~21:00 CET)

**Branch:** `release/pitchproof-5-3-candidate`  
**HEAD at pass start:** `aa4a0083db6fee88627c9e6b40d0fa22a6c26a73`  
**GPU baseline ancestor:** `51d41c9f5f333c7e93a606b7181ba8cb1cee8eac` (exit 0)  
**productionApproval:** false · D not promoted · no `answers.csv`

---

## 1. Authentication / TLS

### Diagnosis
| Check | Result |
|---|---|
| Node | v22.23.4 @ `C:\Program Files\nodejs\node.exe` |
| npm | 10.9.9 |
| firebase-tools | 15.30.1 |
| System time | OK (local Europe/Zurich) |
| Proxy env | unset |
| `NODE_TLS_REJECT_UNAUTHORIZED` | **not set** (verification on) |
| `api.expo.dev` via Windows SslStream | OK; issuer **AVG Web/Mail Shield Root** |
| Node default CA → `api.expo.dev` | **FAIL** `unable to verify the first certificate` |
| curl → `api.expo.dev` | HTTP 200 |

**Cause:** AVG HTTPS scanning MITMs TLS. Windows trusts AVG’s root; Node’s default CA bundle does not. Earlier `firebase projects:list` “credentials no longer valid” was the same class of failure (API calls failing under broken Node TLS), not proven credential revocation.

### Repair (verification preserved)
1. Confirmed Node supports `--use-system-ca`.
2. Session + User env: `NODE_OPTIONS=--use-system-ca` (was empty; set User scope).
3. Helper: `.local/use-system-ca.ps1`; diagnosis: `.local/tls-eas-diagnosis-2026-11-04.md`.
4. Optional PEM of AVG root at `.local/certs/avg-webmail-shield-root.pem` (already in Windows Root store) — prefer `--use-system-ca` over `NODE_EXTRA_CA_CERTS`.
5. **Did not** set `NODE_TLS_REJECT_UNAUTHORIZED=0` or insecure flags.
6. Enabled Firebase CLI experiment `appcheckadmin` (local CLI feature flag only; not a cloud mutation).

**Rollback:** clear User `NODE_OPTIONS`; or disable AVG HTTPS scan for Node/`*.expo.dev` / `*.firebase.tools` in AVG UI.

### Post-repair auth
| Command | Result |
|---|---|
| `eas whoami` | Expo account Owner; project `@boddibossi/scoutx` id `a15ee8f0-6d2a-4a4c-9c5d-1ab76ceada10` |
| `firebase login:list` | Logged in (email present; not repeated here) |
| `firebase projects:list` | **PitchProof / scoutx-230b0 (current)** + TradeAcademy |
| `firebase use scoutx-230b0` | OK |
| `firebase apps:list` | PitchProof iOS `1:141939766260:ios:c23d6b9fe65e8a65bd3fa1` |

TLS still enabled: Node `authorized=true` for `api.expo.dev` and `auth.firebase.tools` with `--use-system-ca`.

### EAS production env names (values redacted; 2026-11-04)
Present on Expo project `@boddibossi/scoutx` environment `production`:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY`
- `GOOGLE_SERVICES_PLIST`

Local release-gate still reports EXTERNAL for these because they are not in the local shell (expected). Names match the gate’s required set.

---

## 2. App Check (live read-only)

Commands (after `experiments:enable appcheckadmin`):

```text
firebase appcheck:providers:list --project scoutx-230b0 --app 1:141939766260:ios:c23d6b9fe65e8a65bd3fa1
firebase appcheck:services:list --project scoutx-230b0
firebase appcheck:apps:list --project scoutx-230b0
firebase appcheck:debugtokens:list --app …
```

| Item | Verified state | Timestamp |
|---|---|---|
| App Attest | Configured column **n/a** (API cannot confirm App Attest registration) | 2026-11-04 |
| DeviceCheck | **No** | 2026-11-04 |
| reCAPTCHA Enterprise | **No** | 2026-11-04 |
| Apps providers summary | **not configured** | 2026-11-04 |
| Debug tokens | **none** (good for release) | 2026-11-04 |
| Firestore / Storage / Auth / … product Enforce | **Off** (all listed services) | 2026-11-04 |
| Callable `enforceAppCheck` in source | still default **on** | code |

**Conclusion:** Console App Check registration for release iOS app is **not** complete. Product-level Enforce is Off. Code-level callable enforcement remains on → real devices need working attestation providers before safe TestFlight/App Review callables.

CLI note: App Attest shows n/a even when used; DeviceCheck **No** + apps “not configured” is sufficient to keep B-01 OPEN. Operator should still register App Attest + DeviceCheck in Console and confirm metrics from a **new** production build of the RC tip.

---

## 3. EAS artifacts vs RC

Latest finished iOS **production** build:

| Field | Value |
|---|---|
| ID | `554e311b-541e-41dc-a01e-6a39fde4ed26` |
| Version / build | 1.0.0 (4) |
| Commit | `667922637261d7c42d7ff74367650f1dd9487c62` |
| Status | finished (IPA URL exists on Expo) |
| Ancestor of current HEAD? | **No** (`merge-base --is-ancestor` → 1); **86** commits behind tip |

**Applicability:** historical archive **does not** validate the 5.3 candidate tip. New EAS production build of current HEAD required for device evidence.

---

## 4. External evidence search

Searched: `docs/release/*`, `.local/`, D packet dirs, Desktop/Documents/Downloads/AgentStores (partial; no matching completed artifacts).

| Area | Artifact found? | Notes |
|---|---|---|
| App Check deployed verification | **Yes (this pass)** — providers/services CLI | Shows **not configured** / Enforce Off — not a pass |
| Restore drill | **No** | `BACKUP_CONFIGURATION_REQUIRED` remains; `gcloud` not installed |
| Counsel sign-off | **No** | LEGAL_REVIEW_REQUIRED counts unchanged; owner rows `_pending_` |
| Real-device protocol results | **No** | template only; matrix ~60 NOT VALIDATED |
| Independent D answers | **No** | packet + private mapping exist; **`answers.csv` absent**; README PENDING |

Missing records to supply (only if completed elsewhere): same five items as `final-release-audit-2026-11-04.md` §1, plus optionally gcloud/Firebase Console backup screenshots.

---

## 5. Missing files investigation

### `functions/.env.scoutx-230b0`
| Question | Answer |
|---|---|
| Required for App Store binary? | **No** for AI-footage-off scoped release |
| Consumed by | `scripts/release-gate.mjs` → `functionsEnv()` reads `functions/.env` + `functions/.env.<project>` |
| If absent | Gate EXTERNAL for AI footage (fail-closed) — **correct** |
| Also documented for | `GUARDIAN_LINK_BASE_URL` at **Functions deploy** time (Secret Manager / `.env` on deploy host) |
| Do not create | placeholder secrets to silence the gate |

Secure setup when offering AI: set `AI_FOOTAGE_PROCESSING_APPROVED=true` in Functions env/secrets **after** provider privacy review — never paste values into chat.

### `docs/video/evaluation/approval.json`
| Question | Answer |
|---|---|
| Required for no-CV-worker release? | **No** — absence compiles `APPROVED_CV_WORKER=null` |
| Consumed by | `scripts/lib/cvApproval.mjs`, `scripts/cv-approval.mjs --write`, release gate |
| Gate if absent | NOT VALIDATED “still-frame only” + CV worker PASS “not configured” |
| Schema / provenance | `docs/video/evaluation/README.md` |
| Who provides | Owner after real-footage eval + security review — **do not invent** |

---

## 6. Verdict after this pass

**NOT READY — CONCRETE BLOCKERS REMAIN**

Tooling auth/TLS unblocked for read-only checks. Live App Check shows registration incomplete. External human/device/counsel/restore evidence still missing. Existing TestFlight IPA is not this RC.
