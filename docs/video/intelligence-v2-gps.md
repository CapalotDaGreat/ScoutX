# Privacy-preserving wearable import

## Audit and implemented scope

Existing phone GPS uses `toLocalPoint` to discard the geographic origin, then stores
summary metrics/heatmap rather than raw tracks. `GpsSessionRepository.completeSession`
can write to Firestore and clears active recording recovery; it is intentionally NOT
used for imports. Existing intelligence and movement-zone calculators assume contiguous
samples and are not suitable for merging independent imported frames unchanged.

New `gpsImportService.ts` is a synchronous, reusable local normalization boundary.
It supports GPX track segments, TCX Tracks, and the strict CSV schema below. It uses the
available `@xmldom/xmldom` 0.8.15 parser, not regex XML parsing. XML warnings/errors,
DOCTYPE and ENTITY declarations are rejected. FIT/ZIP/PDF, GPX routes, summary-only
vendor reports, quoted CSV and arbitrary vendor column mappings are not implemented.

Limits: 5 MiB UTF-8, 50,000 source samples. Timestamps must have an explicit timezone.
Coordinates must be finite degrees in valid geographic ranges. Missing coordinates or
timestamps reject the file. Duplicate/backwards samples are excluded without sorting
or inventing clock corrections. Accuracy above 20 m is excluded; absent accuracy is
unknown, not precise. Position-derived speeds above 12 m/s are excluded. Intervals
over 10 seconds and source track boundaries start new frames. These are conservative
product filters, NOT device-calibrated confidence or vendor-equivalent algorithms.

Continuous frames are calculated separately with existing summary functions, so gaps
do not add distance, duration or sprint effort. Summary distance and duration retain
the existing per-frame rounding; many very short segments can lose precision.
The first sample of each frame has speed zero. No acceleration or vendor proprietary
metric is imported. Original device speeds are not used. Multiple frames withhold
the heatmap rather than superimposing unrelated origins. Imported zones are empty and
intelligence is null: no invented attacking direction or coaching conclusions.

## Local UI and persistence

`GpsImportPanel.tsx` is mounted in the existing GPS screen. DocumentPicker selects a
single file without requesting an app cache copy. File size is checked before reading,
then the normalization boundary checks actual UTF-8 size. On web, the picker disables
base64 generation and reads `asset.file.text()` directly, never constructing Expo File.
`gpsImportInteraction.ts` validates declared and actual file size before reading; native
platforms use the injected Expo File reader. Missing browser File objects fail honestly.
Native content-URI/provider
behavior still requires physical-device validation; if reading fails, the UI reports
failure and saves nothing. The user's original source file remains theirs; it is not
deleted, uploaded, logged or copied intentionally by this feature.

Preview contains only a location-free session summary, quality counts and provenance.
Confirm requires the same player ID and a bounded user-provided label; cancel drops
the preview without storage. The latest confirmed local import replaces the preceding
one at `gps/local-import/<encodeURIComponent(playerId)>` in existing AsyncStorage (the
key remains unchanged for ordinary Firebase UIDs). The owner-scoped summary
is readable on reopening and deletable from the panel. Account switching hides the
other owner's summary and drops pending preview. The reusable `gpsImportStorage.ts`
service allowlists nested summary, provenance and quality fields on BOTH writes and
reads; it no longer imports the cloud repository. Reads reject corrupt JSON,
owner mismatches, invalid numbers and unsupported/claimed verified, linked or oriented
provenance. Unknown nested fields are dropped rather than spread into persistence.
This is application-level isolation, not encrypted storage.

Public storage functions (also exported from the GPS feature):

- `loadLocalGpsImport(ownerId)` returns the summary plus validated provenance/quality,
  or null for missing/corrupt/mismatched records; storage I/O failures propagate.
- `saveLocalGpsImport(ownerId, confirmedPreview)` validates ownership, persists only
  allowlisted fields and returns the sanitized result.
- `clearLocalGpsImport(ownerId)` is idempotent owner-only cleanup. Parent reports it
  is wired in accountService after server-confirmed deletion and before sign-out;
  this slice does not modify the parent deletion flow.

The shared default service serializes operations per owner. Cleanup waits for earlier
in-flight writes, so a pending save cannot resurrect the record after cleanup resolves;
other owners are not blocked. A new explicitly requested save after cleanup can still
create a record, so account deletion must also stop further user actions. The injectable
`createGpsImportStorage(adapter)` factory supports tests without native modules.

Import IDs now use the existing `createSecureId('gps-import')` helper, including native
secure randomness, rather than a millisecond-only ID.

Preview and saved imports render the existing `GpsHeatmap` only when the normalized,
allowlisted grid has cells, immediately beneath the existing provenance stating that
pitch orientation is unknown. The unchanged component draws a neutral cell grid, not
a pitch, attacking labels or geographic map. Multi-frame imports with withheld/empty
grids do not render a heatmap.

The panel uses a synchronous operation guard before launching picker/save/delete/cancel,
preventing duplicate handlers before React rerenders. Disabled/signed-out/stale-owner
handlers are refused. Owner/disabled transitions and unmount invalidate pending reads,
successes and errors, including A -> B -> A transitions. Pending operations retain the
busy lock until settled; old completions cannot unlock a newer operation. Once a save
has started, an account switch does not cancel its owner-scoped disk write, but its
callback cannot modify the new account's UI. Initial loads cannot overwrite later
mutation results. Inputs/cancel/delete respect busy and disabled state.

No track, geographic origin, source filename, source URI, raw XML/CSV, or original
fix timestamps is returned or persisted. `startedAt`/`endedAt` denote import time,
not original activity time. Persisted provenance is `wearable_file`, format,
`user_supplied`, `matchId: null`, `not_synchronized`, and `orientation: unknown`.
The session label is NOT a verified match association. There is no provider connection,
automatic match matching, video offset, drift correction, half orientation calibration,
cloud history, or third-party processing. All those are explicit unimplemented states.

CSV header is exactly `timestamp,latitude,longitude` or
`timestamp,latitude,longitude,accuracy_m`. Decimal-dot degrees, metres, unquoted fields;
timestamps are ISO 8601 with Z or a numeric timezone offset. Example synthetic input:

```csv
timestamp,latitude,longitude,accuracy_m
2026-01-01T12:00:00Z,47,8,5
2026-01-01T12:00:01Z,47.00004,8,5
```

## Vendor restrictions verified from official sources

Checked 2026-10-23. No credentials, agreements or vendor private sample files supplied.
These sources establish available export channels, not PitchProof interoperability.
No vendor adapter/API has been implemented or tested. Regional availability and exact
commercial prices are not established by these sources; obtain vendor confirmation.

- STATSports: [consumer CSV session report](https://support.statsports.com/hc/en-us/articles/360017646617-How-do-I-export-a-CSV-report-of-a-session)
  is a coach report with selected players and metric templates, not a guaranteed
  timestamped coordinate track. [Sonra export documentation](https://elitesupport.statsports.com/hc/en-us/articles/13494616698141-Export-Data)
  distinguishes CSV metrics/drills, XML metrics/drills and event exports. It explicitly
  requires editing video sync time before XML export. Do not treat these reports as
  raw GPX or assume an open consumer OAuth API. Raw-sample availability/access requires
  the account holder/vendor; no API entitlement is established here.
- Catapult: [10 Hz sensor export](https://support.catapultsports.com/hc/en-us/articles/360001427755-Exporting-10Hz-Sensor-Data-from-the-OpenField-Console)
  is an OpenField Console per-athlete CSV export, with relative timestamps and vendor
  quality fields. It does not match our ISO timestamp CSV schema automatically.
  [API tokens](https://support.catapultsports.com/hc/en-us/articles/360002186896-API-Tokens)
  require the API Token Admin module enabled for the account (contact support). Tokens
  have selected scopes and expiry; integration tokens cannot be refreshed
  programmatically. These are secrets, not values to collect/store in this mobile UI.
- Garmin: current [program overview](https://developer.garmin.com/gc-developer-program/overview/)
  distinguishes Personal (own data, personal key, pull-only), Business Starter
  (application/app, push-only, limited users, no history), and Enterprise (tailored
  terms, expanded delivery/history). [FAQ](https://developer.garmin.com/gc-developer-program/program-faq/)
  still describes business approval, OAuth 2.0, no general licensing/maintenance fee
  but possible metric licensing fees/minimum device orders. The overview and older FAQ
  are not fully aligned; verify current eligibility and terms directly rather than
  promise approval or free unrestricted access. FIT data availability is NOT FIT parser
  support in this slice. Do not scrape user Garmin credentials.
- Polar: [AccessLink official reference](https://www.polar.com/accesslink-api/)
  allows registered Flow users to register an API client. OAuth2 client credentials,
  user authorization, mandatory consents and applicable scopes are required. Exercise
  FIT/TCX retrieval described there is limited to uploads within 30 days and uploads
  after registration with the client; TCX responses may be gzip. GPX may return no
  content when GPS is absent. No OAuth backend, gzip handling or API fetching exists
  here; the user must select an already exported supported text file.
- Playermaker: [official consumer support](https://portal.consumer.directed.support/support/solutions/articles/154000211142-can-i-export-my-session-data-in-the-form-of-an-excel-api-pdf-report-)
  documents activity PDF/screenshots, API calls only for the Elite package, and coach
  dashboard export by discussion. [API terms](https://www.playermaker.com/pages/api)
  link to organization agreement conditions and third-party data-transfer duties.
  [Data portability](https://www.playermaker.com/pages/gdpr) offers a username-associated
  export request via support, not a published universal positional track schema.
  Playermaker technical metrics must not be presented as geographic GPS samples.

## Parent integration and release blockers

1. Promote available `@xmldom/xmldom` to a direct runtime dependency; package and lock
   files were deliberately not modified. Confirm Metro/native bundling and dependency
   review. FIT/ZIP require separately approved proven libraries and representative tests.
2. Addressed: translated import keys now exist in en/de/fr/es/it/nl/pt with tested key
   and interpolation parity. No shared resource-builder changes were needed.
3. Owner-only cleanup is implemented/tested as `clearLocalGpsImport(ownerId)`; parent
   reports accountService integration after server-confirmed deletion and before
   sign-out. Local AsyncStorage is not an
   authorization backend or encrypted vault. Do not move imports through the existing
   cloud repository until the parent reviews cloud schema/rules and provenance.
4. Operation guards, storage lifecycle and web/native reader selection are unit-tested.
   Still validate actual picker/confirm/cancel, restart, account switch and deletion on
   iOS/Android/web, accessibility, theme and small-screen behavior. No rendered UI or
   physical-device test is claimed.
5. Obtain authorized representative vendor exports and compare reference results.
   Filters, sprint counts and spatial approximation are not scientifically validated.
   No real-device GPS benchmark, match linking or production readiness is claimed.

## Verification

`node --import ./tests/unit/support/register.mjs --test tests/unit/gpsImport*.test.ts tests/unit/gpsIntelligence.test.ts`
passes 33 tests: 9 parser/normalization tests, 8 interaction/ID/locale/source-wiring
tests, 8 persistence tests, and 8 existing GPS intelligence tests; 0 failures.
Synthetic GPX/default/prefixed namespace, TCX,
CSV, owner checks, stripping, gap handling, poor accuracy, spikes, duplicate samples,
invalid input, entity declarations and unsupported formats are covered. Follow-up tests
cover owner isolation/cleanup (including pending saves), allowlisted reads/writes,
preserved provenance, corrupt data, I/O failures, secure ID collisions in a fixed
millisecond, locale parity, disabled/busy/ABA guards and web File/native-reader branches.
Final heatmap additions verify populated grid validity and saved round-trip preservation,
plus source-wiring checks that both conditional grids follow the provenance text.
Source-wiring checks are not rendered-component or screenshot tests.
Real AsyncStorage/native picker and vendor interoperability remain integration coverage.
Parent is running full E2E/native export separately; no result from that work is
claimed here. No additional features or dependencies were added for the heatmap wiring.

Focused ESLint passes for GPS import services, panel, exports and tests.
Both `npx tsc --noEmit --pretty false` and `npx tsc --noEmit -p tests --pretty false`
pass in the shared workspace after the follow-up. Earlier locale parity errors are
resolved; unrelated upload-test errors reported during the initial slice are no longer
present in the shared workspace. No upload tests were modified by this slice.

No package edits, Firestore rules changes, backend mutations, commits or deployments.

Parent integration update: the XML parser is now a pinned direct dependency;
account deletion invokes owner-local cleanup after server-confirmed deletion.
The actual browser picker/cancel/confirm/reload/delete flow passed on desktop and
mobile, verifying location stripping in local storage. Mobile pixels were reviewed.
The native iOS bundle includes the parser successfully, but actual native picker,
device GPS accuracy and vendor-file validation remain outstanding. Full final
results and any later corrections are recorded in `intelligence-v2-delivery.md`.
