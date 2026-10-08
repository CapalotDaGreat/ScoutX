# External Football Sources (link-only)

Players can add links to pages about them on football websites (league tables, team pages,
player pages, match reports). PitchProof stores the link and a few fields about it. It never
reads, copies or displays the linked page.

This document describes product and security controls. **It is not legal advice and it is not
legal approval** of any provider, of linking to any provider, or of any provider's content or
terms. Whether linking (and any future use beyond linking) is permitted for each provider and
country is LEGAL REVIEW REQUIRED.

## What the feature does

- The player pastes a link. The app checks it locally, the server checks it again, and if it
  points to an approved provider it is stored in `players/{uid}/footballSources/{sourceId}`.
- The player chooses a source type (league, team, player, match, competition, other) and who
  may see it: only them (default), their public Football Passport, or scouts.
- The player may link a source to their own logged matches. Match data is not changed.
- Anyone who can see a link can open it in the system browser (iOS: Safari). The page is
  never loaded inside the app.
- Anyone who sees a link can report it (`contentReports`, target type
  `external_football_source`). A report hides the link from everyone else at once, until a
  moderator decides.

## What the feature does not do

PitchProof does not, for any provider:

- fetch, crawl, scrape or parse the linked page, client-side or server-side;
- follow redirects or check that the page exists;
- request Open Graph metadata, favicons, previews or screenshots, or embed the page (no
  WebView, no iframe);
- import, copy or cache scores, line-ups, goals, cards, statistics or player data;
- create or enrich a profile from an external page;
- mark a player, a match or any data as verified or official because a link exists;
- claim that the person on the external page is the PitchProof user;
- schedule synchronisation, create Cloud Tasks or run background jobs for these links;
- try to get around robots.txt, sign-in, rate limits, bot protection or CAPTCHAs.

The release gate (`External football sources are link-only`) fails if network calls, schedules,
task queues, WebViews or iframes appear in the feature code, or if scraping or link-preview
packages are added.

## Provider registry

The registry is `FOOTBALL_SOURCE_PROVIDERS` in `src/features/football-sources/core.ts`, mirrored
verbatim in `functions/src/footballSources/core.ts` (a unit test and the release gate fail if
the copies differ). Each provider has `id`, `name`, `countryCodes`, `allowedHosts`, `enabled`,
`linkOnly: true`, `mode: 'link_only'` and `legalReviewStatus`.

The technical allowlist (`allowedHosts`, `enabled`) is separate from legal review
(`legalReviewStatus`). Every provider is currently `pending_review`. No provider is
`approved_for_api` or `approved_for_import`, and the gate fails if one is. Being on the
allowlist is a product and security control that limits which hosts can be linked. It is not
legal approval.

| Provider | Hosts (and their subdomains) | Countries |
| --- | --- | --- |
| FVRZ | `fvrz.ch` | CH |
| football.ch (SFV/ASF) | `football.ch` | CH |
| FuPa | `fupa.net` | CH, DE, AT |
| fussball.de | `fussball.de` | DE |
| ÖFB | `oefb.at`, `fussballoesterreich.at` | AT |
| The FA (Full-Time) | `thefa.com` | GB |
| KNVB / Voetbal.nl | `knvb.nl`, `voetbal.nl` | NL |
| FFF | `fff.fr` | FR |
| RBFA | `rbfa.be` | BE |
| RFEF | `rfef.es` | ES |
| Tuttocampo | `tuttocampo.it` | IT |
| FPF | `fpf.pt` | PT |
| zerozero | `zerozero.pt` | PT |
| Transfermarkt | `transfermarkt.com`, `.ch`, `.de`, `.at`, `.co.uk`, `.nl`, `.fr`, `.be`, `.es`, `.it`, `.pt` | several |

To disable a provider, set `enabled: false` (or `legalReviewStatus: 'disabled'`) in both copies
and deploy. New links are refused at once, existing links stop being projected to the Passport
and to scouts, and the app refuses to open them. The owner can still see and delete their
stored link.

## Link validation

`parseFootballSourceUrl` runs on the device and again on the server, with no network access:

- only `https:`. `http`, `javascript`, `data`, `file`, `ftp`, `blob`, `intent` and custom
  schemes are refused;
- no user name or password, no port, no IP address, no whitespace, backslash, control or
  non-ASCII characters;
- the hostname must equal an allowed host or be a subdomain of it. Matching needs a label
  boundary, so `fvrz.ch.attacker.com` and `evilfvrz.ch` are refused. There is no substring
  matching;
- normalised: trimmed, lower-case host, trailing slashes removed, fragments removed unless
  they look like in-page routes (`#/`, `#!`). The query string is kept;
- duplicates (same provider, same normalised link, ignoring a leading `www.`) are refused
  with "This source has already been added." The document ID is a hash of that key, so this
  holds under concurrent requests.

## Data stored

| Field | Notes |
| --- | --- |
| `id`, `ownerId` | Document ID is a hash of the normalised link |
| `providerId`, `providerName` | Derived by the server from the host; the client cannot choose |
| `url` | The normalised link, nothing from the page |
| `sourceType` | Chosen by the player |
| `addedBy: 'player'`, `provenance: 'self_reported_with_link'` | Always; there is no `verified` or `official` field |
| `visibility` | `private` (default), `passport`, `scouts` |
| `status` | `active`, `reported`, `hidden`, `removed`; server-owned (moderation) |
| `matchIds` | The player's own matches; checked by the server |
| `reportCount`, `addedAt`, `updatedAt`, `dedupeKey` | Server-written |

Clients cannot write these documents (`allow write: if false`). All writes go through
`addExternalFootballSource`, `updateExternalFootballSource` and `removeExternalFootballSource`.

## Who sees a link

| Visibility | Shown to | Conditions |
| --- | --- | --- |
| `private` | Owner | Always |
| `passport` | Anyone with the Passport link, and scouts | Passport published, account not held, link `active`, provider still allowlisted; minors need the guardian `public_passport` scope |
| `scouts` | Scout, coach, club and admin accounts | Player discoverable (`discoverableByScouts`), account not held, link `active`, provider still allowlisted; minors need the guardian `discovery` scope |

Public copies are server projections: `publicPassports/{uid}.footballSources` and
`scoutFootballSources/{uid}` (readable by recruiter roles and the owner). They contain only id,
provider, link, source type and provenance. They do not contain owner fields, match links or
moderation state. A minor cannot choose `passport` or `scouts` without the matching guardian
scope, and if consent is later withdrawn the projections drop the links.

## Moderation

- Report reasons offered: impersonation, privacy, spam or misleading, inappropriate, safety
  concern, other.
- `triageReport` checks that the source exists under the claimed owner, increments
  `reportCount`, sets `status: 'reported'` (hidden from others) and records the provider and
  link on the case (`targetContext`) so moderators can review it without anything being
  fetched.
- `dismiss` restores `active`. `hide` sets `hidden`. `remove` sets `removed`. Appeals follow
  the existing flow.
- On account deletion, `targetContext` is cleared from cases about the account.

## Logs, analytics and crash reports

There is no analytics SDK in the app, so no events were added. Server logs for this feature
contain only `providerId` and `sourceType` (`footballSourceLogContext`), never the link, its
path or its query string. Client errors carry only a reason code.

## Open items

- LEGAL REVIEW REQUIRED: per-provider and per-country review of linking, display of provider
  names, and each provider's terms. Until then every provider stays `pending_review`.
- LEGAL REVIEW REQUIRED: privacy policy wording for player-added links (see
  `docs/privacy/data-inventory.md` D22).
- Any move beyond links (API access or import) needs a separate legal approval, a separate
  design and a change to this document. It is out of scope.
