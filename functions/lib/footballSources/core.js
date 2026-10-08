"use strict";
// Mirrored verbatim in functions/src/footballSources/core.ts; tests/unit/footballSources.test.ts
// fails if the two copies differ. Edit both together.
//
// External football sources are links only. Nothing in this module (or anywhere else in the
// feature) fetches, parses, previews or caches the linked page.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_MATCHES_PER_SOURCE = exports.MAX_FOOTBALL_SOURCE_URL_LENGTH = exports.MAX_FOOTBALL_SOURCES = exports.SCOUT_FOOTBALL_SOURCES_COLLECTION = exports.FOOTBALL_SOURCES_COLLECTION = exports.FOOTBALL_SOURCE_PROVENANCE = exports.FOOTBALL_SOURCE_STATUSES = exports.FOOTBALL_SOURCE_VISIBILITIES = exports.FOOTBALL_SOURCE_TYPES = exports.FOOTBALL_SOURCE_PROVIDERS = void 0;
exports.isFootballSourceType = isFootballSourceType;
exports.isFootballSourceVisibility = isFootballSourceVisibility;
exports.findFootballSourceProvider = findFootballSourceProvider;
exports.hostMatches = hostMatches;
exports.providerForHost = providerForHost;
exports.parseFootballSourceUrl = parseFootballSourceUrl;
exports.footballSourceLogContext = footballSourceLogContext;
exports.FOOTBALL_SOURCE_PROVIDERS = [
    { id: 'fvrz', name: 'FVRZ', countryCodes: ['CH'], allowedHosts: ['fvrz.ch'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'football_ch', name: 'football.ch (SFV/ASF)', countryCodes: ['CH'], allowedHosts: ['football.ch'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'fupa', name: 'FuPa', countryCodes: ['CH', 'DE', 'AT'], allowedHosts: ['fupa.net'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'fussball_de', name: 'fussball.de', countryCodes: ['DE'], allowedHosts: ['fussball.de'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'oefb', name: 'ÖFB', countryCodes: ['AT'], allowedHosts: ['oefb.at', 'fussballoesterreich.at'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'the_fa', name: 'The FA (Full-Time)', countryCodes: ['GB'], allowedHosts: ['thefa.com'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'knvb', name: 'KNVB / Voetbal.nl', countryCodes: ['NL'], allowedHosts: ['knvb.nl', 'voetbal.nl'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'fff', name: 'FFF', countryCodes: ['FR'], allowedHosts: ['fff.fr'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'rbfa', name: 'RBFA', countryCodes: ['BE'], allowedHosts: ['rbfa.be'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'rfef', name: 'RFEF', countryCodes: ['ES'], allowedHosts: ['rfef.es'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'tuttocampo', name: 'Tuttocampo', countryCodes: ['IT'], allowedHosts: ['tuttocampo.it'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'fpf', name: 'FPF', countryCodes: ['PT'], allowedHosts: ['fpf.pt'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    { id: 'zerozero', name: 'zerozero', countryCodes: ['PT'], allowedHosts: ['zerozero.pt'], enabled: true, linkOnly: true, mode: 'link_only', legalReviewStatus: 'pending_review' },
    {
        id: 'transfermarkt',
        name: 'Transfermarkt',
        countryCodes: ['CH', 'DE', 'AT', 'GB', 'NL', 'FR', 'BE', 'ES', 'IT', 'PT'],
        allowedHosts: ['transfermarkt.com', 'transfermarkt.ch', 'transfermarkt.de', 'transfermarkt.at', 'transfermarkt.co.uk', 'transfermarkt.nl', 'transfermarkt.fr', 'transfermarkt.be', 'transfermarkt.es', 'transfermarkt.it', 'transfermarkt.pt'],
        enabled: true,
        linkOnly: true,
        mode: 'link_only',
        legalReviewStatus: 'pending_review',
    },
];
exports.FOOTBALL_SOURCE_TYPES = ['league', 'team', 'player', 'match', 'competition', 'other'];
exports.FOOTBALL_SOURCE_VISIBILITIES = ['private', 'passport', 'scouts'];
exports.FOOTBALL_SOURCE_STATUSES = ['active', 'hidden', 'reported', 'removed'];
exports.FOOTBALL_SOURCE_PROVENANCE = 'self_reported_with_link';
exports.FOOTBALL_SOURCES_COLLECTION = 'footballSources';
exports.SCOUT_FOOTBALL_SOURCES_COLLECTION = 'scoutFootballSources';
exports.MAX_FOOTBALL_SOURCES = 30;
exports.MAX_FOOTBALL_SOURCE_URL_LENGTH = 2048;
exports.MAX_MATCHES_PER_SOURCE = 20;
function isFootballSourceType(value) {
    return typeof value === 'string' && exports.FOOTBALL_SOURCE_TYPES.includes(value);
}
function isFootballSourceVisibility(value) {
    return typeof value === 'string' && exports.FOOTBALL_SOURCE_VISIBILITIES.includes(value);
}
function findFootballSourceProvider(id) {
    return exports.FOOTBALL_SOURCE_PROVIDERS.find((provider) => provider.id === id) ?? null;
}
/** Exact host or a true subdomain. `evilfvrz.ch` and `fvrz.ch.attacker.com` never match. */
function hostMatches(host, allowedHost) {
    return host === allowedHost || host.endsWith(`.${allowedHost}`);
}
function providerForHost(host) {
    return exports.FOOTBALL_SOURCE_PROVIDERS.find((provider) => provider.allowedHosts.some((allowed) => hostMatches(host, allowed))) ?? null;
}
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
function isHostname(host) {
    if (host.length === 0 || host.length > 253)
        return false;
    const labels = host.split('.');
    return labels.length >= 2 && labels.every((label) => HOST_LABEL.test(label));
}
/** Fragments are dropped unless the site uses them for routing (`#/` or `#!`). */
function keepFragment(fragment) {
    return fragment.startsWith('#/') || fragment.startsWith('#!');
}
/**
 * Validates and normalises a pasted link without touching the network. Only https links to an
 * enabled provider's hosts pass. Redirects are never followed, so the stored URL is exactly
 * what the player pasted (normalised), not wherever it might lead.
 */
function parseFootballSourceUrl(input) {
    const trimmed = typeof input === 'string' ? input.trim() : '';
    if (!trimmed)
        return { ok: false, error: 'empty' };
    if (trimmed.length > exports.MAX_FOOTBALL_SOURCE_URL_LENGTH)
        return { ok: false, error: 'too_long' };
    // Whitespace, control characters, backslashes and non-ASCII are rejected rather than repaired,
    // since browsers interpret them inconsistently (e.g. `\` as `/`).
    if (/[^!-~]/.test(trimmed) || trimmed.includes('\\')) {
        return { ok: false, error: 'malformed' };
    }
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
    if (!scheme || scheme[1].toLowerCase() !== 'https')
        return { ok: false, error: 'not_https' };
    const match = /^https:\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(trimmed);
    if (!match)
        return { ok: false, error: 'malformed' };
    const authority = match[1];
    if (authority.includes('@'))
        return { ok: false, error: 'credentials' };
    if (authority.includes(':'))
        return { ok: false, error: 'port' };
    const host = authority.toLowerCase();
    if (/^[0-9.]+$/.test(host) || host.startsWith('['))
        return { ok: false, error: 'ip_address' };
    if (!isHostname(host))
        return { ok: false, error: 'malformed' };
    const provider = providerForHost(host);
    if (!provider)
        return { ok: false, error: 'unsupported_provider' };
    if (!provider.enabled || provider.legalReviewStatus === 'disabled')
        return { ok: false, error: 'provider_disabled' };
    let path = match[2];
    if (path !== '' && !path.startsWith('/'))
        return { ok: false, error: 'malformed' };
    while (path.length > 1 && path.endsWith('/'))
        path = path.slice(0, -1);
    if (path === '/')
        path = '';
    const query = match[3] && match[3] !== '?' ? match[3] : '';
    const fragment = match[4] && keepFragment(match[4]) ? match[4] : '';
    const url = `https://${host}${path}${query}${fragment}`;
    const dedupeKey = `${provider.id}|${host.replace(/^www\./, '')}${path}${query}${fragment}`;
    return { ok: true, url, host, dedupeKey, provider };
}
/**
 * The only parts of a source that may appear in analytics or logs: never the URL, its path or
 * its query string, which can identify a person.
 */
function footballSourceLogContext(source) {
    return { providerId: source.providerId, sourceType: source.sourceType };
}
//# sourceMappingURL=core.js.map