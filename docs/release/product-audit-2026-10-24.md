# Product audit and enhancement pass

Follow-up: the code-level 500-profile cap and compatible dependency issues below
have since been addressed. Current results, the required index activation, and
the single remaining unpatched node-forge advisory are recorded in
`blocker-follow-up-2026-10-24.md`. The original pass below remains historical.

Date: 2026-10-24. Scope: repository-wide automated checks and focused manual
review of the flagship evaluation workflow, player identity cards, discovery,
detail navigation, privacy boundaries and dependency/release posture. This is
not an exhaustive security certification or a real-footage accuracy assessment.
No deployment, training, dataset ingestion or footage upload was performed.

## Release blockers and remaining work

- Flagship full-match tracking remains unvalidated on the orange #8 recording.
  The compiled worker approval remains null. Correct local evaluation machinery
  is not evidence of identity accuracy, continuous tracking or calibrated confidence.
  Obtain authorized footage and independent reviewed labels, measure errors and
  abstention, then meet the existing multi-match approval criteria.
- App production dependency tree: 18 affected package entries, 13 high and
  5 moderate, no critical. These are dependency-tree entries, not 18 independent
  vulnerabilities or proof of production exploitability. Several npm suggestions
  downgrade major SDKs; do not run a forced automatic remediation.
- Functions production tree after the compatible body-parser patch: 8 moderate,
  no high/critical. Both audits used `--omit=dev`; do not compare directly with
  historical all-dependency counts. Separate SDK-compatible remediation work is
  still required before public launch.
- Discovery supports a complete public set of up to 500 profiles. Above that,
  it returns an explicit error rather than misleading partial matches. A privacy-
  reviewed server-side search/index and stable snapshot pagination are required
  for scale. The current implementation re-reads the bounded set per page; it is
  a correctness-first bridge, not a scalable or cheapest search architecture.
- Native iOS/device behavior, purchases, App Attest, legal/owner approvals,
  backup/restore and remaining external-console items retain their existing
  validation requirements. Web/emulator success does not validate these items.

## Implemented fixes

### Player cards and drill-down

A reusable identity panel supplies the portrait, readable name, position and
club context across discovery, the scout detail header, public Passport and
private owner profile. Missing or failed portraits use honest initials, never
a generated likeness. Discovery cards show availability, logged matches,
analysis-sample count and highlight availability rather than an invented overall
grade, potential score or self-rated star summary.

The card and its explicit View player action open the existing player detail
screen. Save/compare remain separate accessible actions. The detailed scout view
retains deeper evidence, recruitment and existing gated interactions; public
Passport remains a server-projected public view. The owner profile retains edit
controls and self-reported details. No Firestore access rule or projection was
widened, and no private phone number or private biography is added to discovery.

Discovery uses two columns on sufficiently wide screens and one readable column
on mobile. Sorting moved from a long row of commands into the existing menu
control next to Filters. Search suggestions appear on focus instead of dominating
the initial screen. Loading keeps search controls mounted; a pending debounce
does not present the previous query's results as current. Refresh, errors and
explicit pagination actions are distinct. Shared dropdowns no longer look disabled
when enabled, and expose the selected value accessibly.

### Search and navigation correctness

Previously live Firestore pages were independently filtered/sorted, which could
hide matches after an empty first page or misorder results. Search now filters
and ranks a complete bounded public set before pagination. Accent-normalized
AND-token queries can match across public fields; field scopes constrain both
matching and relevance. Unknown distances/dates sort last and ties are stable.
Invalid cursors and database failures are explicit instead of silently restarting
or showing an empty directory. The document ID overrides any body-provided ID.

Player-detail requests ignore late responses after navigation/unmount. Club
lookups likewise cannot replace the current player's club with an older response.
Related-player loading catches failures, offers retry and filters blocked users.
Block lists now use a shared viewer-scoped query cache; unknown/error states do
not expose discovery/related records. Successful mutations update all consumers.
Server block failures are no longer represented as successful local-only blocks.
Privacy Center shows loading/error states and catches unblock failures. Dropdown
validation errors/hints remain accessible outside the decorative display field.

### Flagship integrity

The independent benchmark now requires different anchor and ground-truth
reviewers. Missing or malformed target traces fail validation rather than being
scored as no prediction. An explicit empty trace remains legitimate abstention.
These are independent-review/correctness improvements, not learned tracking
improvements. Reviewer independence remains attested, not cryptographically proven.

### Server dependency patch

Updated only the compatible Functions transitive `body-parser` lock entry from
1.20.8 to 1.20.9, addressing the reported compressed-body denial-of-service
advisory. No framework downgrade, forced override or production deployment.
Advisory: https://github.com/advisories/GHSA-27r3-jxmh-p828.

## Design decisions and trade-offs

- Portrait/position-led identity borrows the fast recognition of football game
  rosters without copying their artwork or unearned numeric ratings. Stronger
  visual identity is useful; fake precision would undermine scout trust.
- A concise teaser supports comparison and browsing. Deep evidence belongs one
  click away; cramming biography, ratings, radars and recruitment actions onto
  every card would reduce readability and increase accidental disclosure risk.
- Public and private views share visual language, not data permissions. Separate
  data flows are kept because a visual variant is never an authorization boundary.
- Existing design tokens, portrait fallbacks, translated strings, menu controls
  and navigation are reused instead of introducing a second component framework.
- Complete bounded search fixes incorrect results without sending player records
  to a new third-party service. Its read cost and hard scale limit are explicit
  reasons to schedule a server-index implementation next.

Reference inspiration, not a claim of equivalent capabilities:
- Hudl recruiting/public separation:
  https://support.hudl.com/s/article/coaches-guide-to-recruiting-hudl-v3?language=en_US&topic=Get_Athletes_Recruited
- Wyscout search, profiles and shortlist workflow:
  https://www.hudl.com/en_gb/products/wyscout/faq
- EA player/position-centric presentation (not its rating model):
  https://www.ea.com/games/ea-sports-fc/ratings

## Changed areas

- `src/components/player-card/PlayerIdentityPanel.tsx`: shared identity presentation.
- `playerCardPresentation.ts` and its unit test: responsive column policy.
- Discovery `PlayerDiscoveryCard.tsx`, `DiscoverySortBar.tsx`,
  `PlayerDiscoveryScreen.tsx`, `ScoutReportHero.tsx`, `PlayerDetailScreen.tsx`:
  redesigned teaser/detail presentation and state handling.
- Discovery `usePlayerDiscovery.ts`, `usePlayerDetail.ts`,
  `useDiscoverablePlayerPool.ts`: pending/refresh, stale-response and error/block handling.
- Discovery repository, `discoveryQueryService.ts`, `smartDiscoveryService.ts`,
  `tests/unit/discoverySearch.test.ts`: complete-set search and sorting regressions.
- `FootballPassportHero.tsx`, `ProfileHero.tsx`: shared public/private identity style.
- `src/components/primitives/Dropdown.tsx`: enabled-state contrast and selected-value accessibility.
- Trust-safety `useBlockedUsers.ts`, `BlockedUserRepository.ts`,
  `TrustSafetyActions.tsx`, `services/blockedUserState.ts`, its unit test and
  `PrivacyCenterScreen.tsx`: shared fail-closed visibility and mutation/error handling.
- `src/i18n/locales/{en,de,es,fr,it,nl,pt}/{scout,common}.json`: localized card and pagination labels.
- `e2e/flows/scout.spec.ts`: search/card navigation, privacy markers, screenshots and overflow checks.
- `FirebaseBootstrap.tsx`, `src/config/appMode.ts`, `tests/unit/appMode.test.ts`:
  an explicit development-only demo can start without backend credentials;
  production and unknown runtimes ignore the mock flag and remain fail-closed.
- `scripts/release-gate.mjs`: execute the production/unknown-runtime mock guard
  with the mock flag forced on instead of requiring one exact source-code spelling.
- Worker `eval/full_match_validation.py`, its tests and workflow guide: fail-closed trace and reviewer checks.
- `functions/package-lock.json`: compatible server security patch.
- This report and `docs/security/dependency-audit.md`: current evidence and residual work.

## Verification evidence

Local logs are private ignored artifacts under `.local/project-audit-*`.

- App unit suite: 639 passed (`project-audit-unit-final.log`).
- Full Firestore/Storage/Functions rules suite: 256 passed (`project-audit-rules.log`).
- Full worker suite: 323 passed; one existing Starlette/httpx deprecation warning
  (`project-audit-worker.log`).
- TypeScript (app/tests), ESLint and production web export passed. ESLint's last
  run used a 6 GiB Node heap after a parallel default-heap run exhausted memory;
  no lint rules were disabled. Logs: `project-audit-types-final.log`,
  `project-audit-lint-final.log`, `project-audit-web-verified.log`.
- Broad desktop browser suite: 27 passed, 2 intentional opt-in skips (marketing
  capture and gated experimental target anchors), no failed tests
  (`project-audit-browser-final.log`).
- Final-code scout browser passes: 5 desktop and 5 mobile tests passed in
  `project-audit-scout-final.log`, with a fresh emulator lifecycle per browser.
- Isolated local demo mobile smoke: no page runtime errors or page-level
  horizontal overflow (`project-audit-demo-smoke.log`). A failed early preview
  attempt exposed the development bootstrap issue fixed above; it is not
  counted as a successful smoke test.
- Legal generated-content check passed; internal static release checks report
  no code blocker but retain external/legal/unvalidated requirements. Rules were
  tested separately, not claimed from the `--skip-tests` release command.

Browser screenshots use generated demonstration fixtures, not real player data.
No native-device test, real-match accuracy or public-release approval is claimed.

Next development stage: privacy-reviewed server-side discovery indexing and
independent real-footage validation of the exact worker build, followed by
SDK-compatible dependency remediation and the native TestFlight device matrix.
