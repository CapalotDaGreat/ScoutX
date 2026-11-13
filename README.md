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
