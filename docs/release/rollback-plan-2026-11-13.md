# Rollback and recovery plan for the redesign merge (2026-11-13)

Audit only: nothing here was executed. Commands assume a clean checkout with `origin` = `CapalotDaGreat/scoutx`.

## 1. What `git revert -m 1 <candidate>` reverses

The candidate is a `--no-ff` merge. Parent 1 is `9c6d6edd7d6a1540b89eedf3f295b854144291a8`
(release `01f9459` + index fix `9986c4f` + Node 22 merge of `0adacdf`); parent 2 is the redesign branch tip.

```
git diff 9c6d6ed <candidate> --stat                      # 238 files, +17295 / -1174 (successor candidate 60254e8)
git diff 9c6d6ed <candidate> -- firestore.indexes.json functions/package.json functions/package-lock.json \
    firebase.json firestore.rules storage.rules          # empty
git diff 9c6d6ed <candidate> --stat -- functions         # 3 files: userSafety.ts and its compiled lib/.js(.map)
```

So `git revert -m 1 <candidate>` restores exactly the tree of `9c6d6ed`:

| Reverted | Kept |
|---|---|
| The whole redesign: screens, navigation, Back fix (B-20), sign-out/guest fix (B-23), Settings stale-result guard, review-preview tooling, EAS explicit environments, preview build gate, `preflight:eas`, tests, docs | Node 22 runtime (`functions/package.json` engines `22`, lockfile) |
| Operator rename to Lusiola Software (app, website, policies, guardian email sentence in source) | `firestore.indexes.json` with the `accountRestrictions` index (deployed `CICAgNjpgYIK`) |
| | Rules, storage rules, `firebase.json`, all analysis thresholds/decoder/candidate defaults (unchanged by the redesign) |

It does **not** touch anything deployed. Two consequences to keep in mind:
- A revert removes the rename; the legal pages would name the previous operator again. Prefer a selective revert (section 3) that keeps `0a71917`.
- A later re-merge of the redesign branch after a revert needs the revert reverted first (`git revert <revert-sha>`), otherwise Git treats the redesign as already merged.

Returning to Node.js 20 is not a rollback option: it is decommissioned (2026-10-30) and deploys are refused.

## 2. Recovery procedures by layer

### UI / application regression
The app ships only as a native binary; Firebase Hosting serves the website (`public/`: legal pages, guardian pages), not the app.
Neither is changed by a Git revert alone, and the redesign's website changes (rename, regenerated legal pages) are **not deployed** yet.
1. Website (only if a later approved hosting deploy goes wrong): in the Firebase console, Hosting → release history → roll back to the
   previous release, or `firebase hosting:clone scoutx-230b0:@<previous-version-id> scoutx-230b0:live` (version id from the release history). Verify `/privacy`,
   `/terms`, `/guardian/` return 200, keep their security headers and name the expected operator.
2. Source, narrow fix preferred: fix forward on a branch from the release tip, run unit, typecheck, lint, both browser suites, merge with `--no-ff`.
3. Source, whole redesign: `git switch -c revert/redesign origin/release/pitchproof-5-3-candidate && git revert -m 1 <candidate>`;
   then `git diff 9c6d6ed HEAD --stat` must be empty and `grep '"node": "22"' functions/package.json` must match. Open a PR; do not force-push.
4. Native: see "Native artifact" below; a source revert never changes an installed binary.

### Backend (Cloud Functions) regression
The redesign changes only the guardian email sentence in `functions/`. All 94 deployed functions run source `0adacdf` (Node 22) and
BE-5 (rename redeploy of five functions) is not yet approved.
1. To restore a function's previous behaviour, redeploy it from the known-good source **on Node 22**:
   `git worktree add ../fn-restore 0adacdf && cd ../fn-restore/functions && npm ci && npm run build &&
   firebase deploy --only functions:<name>[,functions:<name>…] --project scoutx-230b0`.
2. Archived source of every pre-migration revision is in the session scratch backup `live-src-backup-2026-11-13/` (81 archives) — evidence only; it is Node 20 code and must not be redeployed as is.
3. Verify: `gcloud functions describe <name> --region europe-west6 --project scoutx-230b0 --format='value(state,buildConfig.runtime)'` → `ACTIVE nodejs22`; trigger and env compare with `docs/release/backend-deploy-manifest-2026-11-12.json`.
4. Never use `firebase functions:delete` as a rollback; it drops triggers and scheduled jobs.

### Database index
The `accountRestrictions` composite index (`CICAgNjpgYIK`, READY) is required by `releaseExpiredSuspensions`. It is in both parents, so no revert removes it.
- Keep it in `firestore.indexes.json` on every branch that deploys. Deploy indexes only with `firebase deploy --only firestore:indexes` and **never** answer "yes" to deleting indexes not in the file.
- If it is lost: restore the line from `9986c4f` (`git checkout 9986c4f -- firestore.indexes.json`), deploy indexes, wait for READY: `gcloud firestore indexes composite list --project scoutx-230b0`.

### Configuration
- Firestore/Storage rules: unchanged by the redesign. To restore the deployed rules, `firebase deploy --only firestore:rules,storage --project scoutx-230b0` from `9c6d6ed`; the console keeps prior rulesets for a one-click rollback.
- Functions environment (`functions/.env.scoutx-230b0`, not in Git): restore the recorded value (hash `29c6479420cce303` in `node22-reconciliation-2026-11-13.json`); a redeploy is needed to apply it.
- App Check: no enforcement change was made. App Attest config (`tokenTtl 3600s`) stays. Do not disable App Check to roll anything back.
- EAS: `eas.json` profiles now set `"environment": "production"` explicitly. Reverting them is safe for the store build but loses the preflight; keep them. EAS environment variables live in EAS, not Git; nothing in Git rolls them back.
- Auth: still `CONFIGURATION_NOT_FOUND`; no Identity Platform upgrade was made, so there is nothing to roll back.

### Native artifact
No native build of the redesign exists. If one is built and later found faulty:
1. It was never uploaded (approval excludes upload), so delete or ignore the EAS artifact; nothing reaches users.
2. If a future approved build is in TestFlight, expire it in App Store Connect (owner) and rebuild from the fixed release SHA. Build numbers only go up (`appVersionSource: remote`, `autoIncrement` on production); never reuse one.
3. The last shipped binary remains production 1.0.0 (4) from `6679226`.

## 3. Forward repair / selective revert (preferred)

Keep Node 22, the index and the rename; revert only the faulty part:

```
git switch -c repair/<topic> origin/release/pitchproof-5-3-candidate
git log --oneline 9c6d6ed..<candidate>^2           # find the faulty commit(s) on the redesign side
git revert <faulty-sha> [<faulty-sha> …]           # single commits, not the merge
git diff 9c6d6ed HEAD -- firestore.indexes.json functions/package.json functions/package-lock.json firebase.json   # must stay empty
grep -q 'Lusiola Software' src/config/legalConfig.ts
npm run typecheck && npm run lint && npm run test:unit && npm run build --prefix functions
# both browser suites (web-mobile, web-desktop) on fresh emulators, --retries=0
git push origin repair/<topic>                     # then PR into the release branch; no force push
```

If the faulty commit is the B-23 fix (`23dc0a8`), reverting it reintroduces two guest sign-ups per sign-out; prefer a fix forward.
