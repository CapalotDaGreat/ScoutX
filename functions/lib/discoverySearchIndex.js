"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEARCH_SORTS = exports.SEARCH_VERSION = void 0;
exports.searchWords = searchWords;
exports.publicSearchFields = publicSearchFields;
exports.indexedSearchMatches = indexedSearchMatches;
exports.normalizeSearchSort = normalizeSearchSort;
exports.publicEvidenceRank = publicEvidenceRank;
exports.buildDiscoverySearchIndex = buildDiscoverySearchIndex;
exports.sameDiscoverySearchIndex = sameDiscoverySearchIndex;
/** Canonical public-projection search policy; sync checked server copy before building. */
exports.SEARCH_VERSION = 1;
exports.SEARCH_SORTS = ['relevance', 'recently_updated', 'age', 'name', 'distance', 'most_viewed', 'sprint_speed', 'weak_foot', 'skill_moves', 'goals', 'assists'];
function searchWords(value) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}
function publicSearchFields(player) {
    const text = (value) => typeof value === 'string' ? value.slice(0, 180) : '';
    return { name: [text(player.fullName), text(player.username)], club: [text(player.club)],
        position: Array.isArray(player.position) ? player.position.slice(0, 12).map(text) : [],
        nationality: [text(player.nationality)], league: [text(player.league)] };
}
function indexedSearchMatches(player, search, scope) {
    const fields = publicSearchFields(player);
    const words = (scope === 'all' ? Object.values(fields).flat() : fields[scope]).flatMap(searchWords);
    return searchWords(search).every((term) => words.some((word) => word.startsWith(term)));
}
function normalizeSearchSort(value) {
    return exports.SEARCH_SORTS.includes(value) ? value : 'recently_updated';
}
function numberKey(value, descending = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 8_000_000_000_000)
        return '1';
    const scaled = Math.round(value * 1000);
    return `0${String(descending ? 8_000_000_000_000_000 - scaled : scaled).padStart(16, '0')}`;
}
function publicEvidenceRank(player) {
    return (player.verified === true ? 25 : 0) + (player.recentlyActive === true ? 20 : 0) + (player.hasHighlightVideos === true ? 15 : 0);
}
function buildDiscoverySearchIndex(player) {
    const tokens = new Set();
    for (const [scope, fields] of Object.entries(publicSearchFields(player)))
        for (const word of fields.flatMap(searchWords)) {
            const letters = Array.from(word).slice(0, 32);
            for (let i = 1; i <= letters.length; i++) {
                const prefix = letters.slice(0, i).join('');
                tokens.add(`${scope}:${prefix}`);
                tokens.add(`all:${prefix}`);
            }
        }
    const date = typeof player.updatedAt === 'string' ? Date.parse(player.updatedAt) : NaN;
    const evidenceRank = publicEvidenceRank(player);
    const name = typeof player.fullName === 'string' ? player.fullName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().slice(0, 180) : '';
    return { version: exports.SEARCH_VERSION, tokens: [...tokens].sort(), order: {
            relevance: numberKey(evidenceRank, true), recently_updated: numberKey(date, true),
            age: numberKey(player.age), name: name ? `0${name}` : '1', distance: numberKey(player.distanceKm),
            most_viewed: numberKey(player.viewCount, true), sprint_speed: numberKey(player.sprintSpeedKmh, true),
            weak_foot: numberKey(player.weakFoot, true), skill_moves: numberKey(player.skillMoves, true),
            goals: numberKey(player.goals, true), assists: numberKey(player.assists, true),
        } };
}
function sameDiscoverySearchIndex(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const actual = value;
    const order = actual.order;
    return actual.version === expected.version && JSON.stringify(actual.tokens) === JSON.stringify(expected.tokens)
        && !!order && typeof order === 'object' && !Array.isArray(order)
        && Object.keys(order).length === exports.SEARCH_SORTS.length
        && exports.SEARCH_SORTS.every((key) => order[key] === expected.order[key]);
}
//# sourceMappingURL=discoverySearchIndex.js.map