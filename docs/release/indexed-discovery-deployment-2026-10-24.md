# Indexed discovery production rollout - 2026-10-24

Target: `scoutx-230b0`, Firestore `(default)`, Standard edition,
`europe-west6`. This rollout does not approve or deploy the CV pipeline.

## Dry run and scope

The read-only dry run completed before any production writes and inspected
**0** documents in `discoverablePlayers`. No private profile collection was
scanned. No synthetic players were inserted into production.

The initial ADC-based invocation could not authenticate. The successful run used
the existing Firebase CLI account through an in-memory authorized-user SDK
credential, with an explicit project and REST transport. No credential file,
service-account key or token was added to the repository.

Eleven search composite indexes were created additively through the Firestore
Admin API. Existing indexes and field overrides were not deleted or replaced.

The deployed rules were compared with the local rules before deployment. The
only differences were the authenticated GET-only search readiness rule and an
explicit deny-all rule for Admin-only callable abuse counters. The latter does
not grant access. The rules compiled and deployed successfully; the compiler
reported existing warnings about the unused `isServerVerifiedPlayer` helper.

## Functions

All of the following deployed successfully and were independently confirmed
`ACTIVE`, with update timestamps on 2026-10-24:

- `onProfileWrittenProjectDiscovery`
- `onPassportSummaryWrittenProjectDiscovery`
- `onUserSafetyWrittenReproject`
- `onMediaWrittenReproject`
- `onContentReportCreated`
- `applyModerationAction`
- `resolveAppeal`
- `releaseExpiredSuspensions`
- `recordDiscoverableView`
- `searchDiscoverablePlayers`
- `onDiscoverableSearchIndexWritten`

These cover all existing producers of public discovery projections, their
moderation/safety reprojection paths, view-count ordering and the legacy search
callable. No analysis callable, worker or CV task function was selected for
deployment. No environment configuration or secret was changed.

## Completion Evidence

All **11** composite indexes reached `READY`. The guarded apply completed with
`{"status":"indexed","inspected":0}`. Independent post-migration verification
returned:

```json
{"publicPlayers":0,"ready":true,"version":1,"indexQueriesPassed":11}
```

No player document required a metadata write. The migration transaction created
the technical readiness document, checked its lease and verified every native
prefix-plus-sort query before setting readiness true. All eleven deployed
functions are ACTIVE on the new revision. The final deployed ruleset is
`53848835-b606-4400-8d30-db87c6f18f65` and matches the reviewed local rules.

Checks rerun for this rollout:

- Functions TypeScript build and generated search-policy consistency: passed.
- Search unit tests: **12 passed**, including 701-player traversal, no gaps or
  duplicates, a match after the old cutoff, and query-bound continuation.
- Focused Firestore search/migration/rules suite: **4 passed**, including native
  queries over 650 players, finding player 620, unlisting, dry-run nonmutation
  and client readiness-write denial.
- Full Firestore/Storage privacy and integration suite: **260 passed**, zero
  failures, skips or cancellations. This includes the focused search tests.
- Application and test TypeScript checks: passed.
- ESLint: passed with a 6144 MB heap after the default-heap attempt exhausted
  memory. No lint error was suppressed.
- Whitespace check and final search-policy copy check: passed.
- CV approval check: absent, as required. The approval source SHA-256 stayed
  `cb883f3fff38528b3fcb58044af4d74ac3c20686aed8e787437a38db7aa5e753`.

Search deployment and migration are complete. An authenticated-client smoke
test with real discoverable players remains necessary when such listings exist;
the empty production directory cannot establish live 500-plus-player coverage.

## Privacy And Remaining Limits

The search metadata is derived only from the existing redacted public projection.
The transaction rereads the current document and cannot recreate an unlisted or
deleted player. The readiness lease fails closed on migration failure. Readiness
is a technical search flag, not consent, model approval or a CV release gate.

`APPROVED_CV_WORKER` remains `null`. No model was trained, footage uploaded,
protected provider access bypassed or private profile made public.

Production currently has no public listings, so a live 500-plus-player accuracy
or client search result cannot be claimed. Scale behavior is verified separately
with synthetic local fixtures; production native index probes validate query
availability, not real player relevance or population coverage.

Firebase's deployment CLI warned that the current Node 20 Functions runtime is
deprecated and will be decommissioned on 2026-10-30. A separately tested runtime
upgrade should be prioritized. Its Firebase Functions SDK upgrade warning also
requires compatibility review, not a blind major-version bump during migration.

Real-footage orange #8 tracking accuracy and independently reviewed full-match
validation remain unverified. This search rollout does not resolve those gates.
