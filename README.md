# PitchProof

## Clean checkout

Requires Node 22.18 or newer (the scripts run TypeScript files directly).

```
npm ci                      # app dependencies
npm ci --prefix functions   # Cloud Functions dependencies
npm run typecheck           # first generates the git-ignored review-preview data from committed fixtures
npm run lint
npm run test:unit
npm run build --prefix functions
```

`npm run typecheck` runs `npm run preview:prepare` automatically. That step writes
`scripts/review-preview/.generated/reports.json`, which only the review preview (`scripts/review-preview/`) imports.
The app never imports it, so EAS and web builds (which do not typecheck) neither need it nor bundle it.

## Before an EAS build

```
npx eas-cli env:pull --environment production --path /tmp/pp-production.env   # keep this file out of git; delete it afterwards
npm run preflight:eas -- --profile production --env-file /tmp/pp-production.env   # or simulator / preview
```

The preflight evaluates the real Expo configuration (`app.config.ts` and its build gates) with the pulled EAS environment
and the profile's own variables, and prints only names. It fails on a dirty checkout, a profile without an explicit
`"environment": "production"`, automatic submission, a simulator App Check flag outside the simulator profile, a missing
native Firebase file, a non-`appl_` RevenueCat key, mock/emulator/debug switches, or a wrong bundle identifier or App Attest
entitlement. `simulator`, `preview` and `production` all use the EAS **production** environment; `development` is unchanged.
