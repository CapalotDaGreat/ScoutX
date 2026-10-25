# Indexed discovery rollout

The 500-profile directory cap is removed from the live repository. Native
Firestore queries now provide globally ordered candidate pages and a derived
prefix index on existing public `discoverablePlayers` documents. No external
search provider, private-profile index or new production AI permission is used.

## Search behavior

Queries are accent-normalized AND-prefix terms across name/username, club,
position, nationality and league, or a selected scope. This is prefix search,
not arbitrary substring/fuzzy/full-text search. Up to 12 terms/256 characters
are accepted. Prefix indexing is bounded per public field and per word; long
terms use an indexed prefix plus exact in-memory predicate checking.

Sort keys are maintained from public fields only. Null/unknown numeric values
sort last, and document ID is the deterministic tie-breaker. Evidence first is
an ordering by published verification/activity/highlight availability, not a
player ability grade or query-specific relevance score. Local demo ordering uses
the same evidence policy. Legacy overall/potential/newest choices use recency.

Each request reads at most 200 candidate documents in batches of 50. Remaining
advanced predicates are applied without reordering the globally ordered source.
If a batch has no matches but candidates remain, the UI offers continuation;
it does not claim the entire search has no results. There is no total-player cap
or complete-directory download. Some candidates from a partially consumed batch
can be reread on the next request; the read budget is per request, not a claim
that every result costs one read. Narrow prefix terms reduce that cost.

Continuation tokens retain consumed sort value/ID and query identity, so deleted
cursor documents do not restart pagination. Changing criteria invalidates the
cursor. This is live pagination, not a frozen snapshot: concurrent profile updates
can move records; refresh to obtain the latest order. Existing viewer-scoped
block checks remain fail-closed. No new access to private profiles is granted.

## Operator steps

The 2026-10-24 production deployment and guarded migration are complete. See
[production evidence](indexed-discovery-deployment-2026-10-24.md) for the exact
scope, checks and empty-production-dataset limitation. The following procedure
is retained for future migrations.

1. Build/check the current Functions package, app and tests. Deploy the new
   projection/index-maintenance Functions before migration; all public-projection
   writers must be on the new code. Never backfill private profile documents.
   `node scripts/sync-discovery-search.mjs --check` validates the generated server
   policy copy (also enforced by Firebase predeploy and unit tests). After an
   intentional canonical-policy edit, regenerate with `--write`. The Functions
   package itself builds without requiring files outside its deployment directory.
2. Deploy the reviewed Firestore rules and `firestore.indexes.json`. Wait for
   every `_search.tokens`/`_search.order.*` composite index to finish building.
   The only new rules permission is a signed-in GET of
   `discoverySearchState/current`; list/client writes stay denied. Existing
   profile, youth, consent and private-evidence rules are unchanged.
3. Inspect using least-privilege operator credentials and the explicit project:

   ```powershell
   npm run build --prefix functions
   node scripts/backfill-discovery-search.mjs --project YOUR_PROJECT
   ```

   This default dry run reads public projections/counts only and writes nothing.
4. In a planned rollout window, explicitly authorize metadata writes:

   ```powershell
   node scripts/backfill-discovery-search.mjs --project YOUR_PROJECT --apply --authorize-index-write
   ```

   The command uses a renewable operator lease, marks readiness false, re-reads
   each current public document transactionally, updates only `_search`, verifies
   current rows and probes every required native index. Only then does it publish
   `ready: true`. Failures leave readiness unavailable; do not manually declare
   success. An abandoned lease expires after 15 minutes; rerun rather than
   overwriting another operator's lease. A new profile written by an old producer
   after verification remains a rollout risk: finish deploying all writers first.
5. Release the new client after migration, then smoke-test name/scope queries,
   filters, every sort, continuation, block/unblock and discoverability withdrawal.
   The legacy server search callable also uses indexed recency cursors instead
   of its old fixed first-200 window. It retains its existing role/rate gates.

The readiness document contains schema/migration metadata, not player records.
Technical readiness is NOT CV approval or release approval. Missing readiness
fails visibly; no partial or old capped fallback is silently used.

## Privacy and validation

The `_search` tokens derive from the redacted public projection, after youth
display handling. Biography, phone, raw private identity fields and arbitrary
search keywords are not indexed. Unlisting deletes the public document and its
index together; delayed maintenance re-reads current data and cannot resurrect it.
No external index retains a second copy. Parent projection retention/deletion
therefore also removes the derived fields.

The readiness rule addition is a prototype access rule requiring signed-in
readers and denying client writes/listing. Review and verify it before broad
rollout; emulator tests cannot prove deployed composite-index readiness.

Tests include a 701-profile paging fixture, matches after empty batches beyond
profile 650, native emulator queries over 650 profiles, migration dry-run/apply,
query-bound cursors, idempotence and unlisting. These synthetic tests use local
demo emulators only; production rollout evidence is recorded separately above.
