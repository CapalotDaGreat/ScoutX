"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourcesRef = sourcesRef;
exports.sourceIdFor = sourceIdFor;
exports.visibilityAllowed = visibilityAllowed;
exports.addFootballSource = addFootballSource;
exports.updateFootballSource = updateFootballSource;
exports.removeFootballSource = removeFootballSource;
exports.loadVisibleSources = loadVisibleSources;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const userSafety_1 = require("../safety/userSafety");
const core_1 = require("./core");
/**
 * Server-authoritative writes for external football source links. Clients cannot write these
 * documents directly; every write re-validates the link here. No function in this module (or
 * anywhere in the feature) requests the linked page.
 */
function sourcesRef(db, uid) {
    return db.collection('players').doc(uid).collection(core_1.FOOTBALL_SOURCES_COLLECTION);
}
/** Same link, same document: a second add of an equivalent URL cannot create a duplicate. */
function sourceIdFor(dedupeKey) {
    return (0, node_crypto_1.createHash)('sha256').update(dedupeKey).digest('hex').slice(0, 32);
}
function fail(code, reason) {
    throw new https_1.HttpsError(code, reason, { reason });
}
/** Minors need the guardian scope that matches where the link would be shown. */
function visibilityAllowed(visibility, policy) {
    if (visibility === 'private')
        return true;
    if (visibility === 'passport')
        return policy.canUsePublicPassport;
    return policy.canBeDiscovered;
}
async function addFootballSource(db, uid, input, now = new Date()) {
    const parsed = (0, core_1.parseFootballSourceUrl)(typeof input.url === 'string' ? input.url : '');
    if (!parsed.ok)
        fail('invalid-argument', parsed.error);
    if (!(0, core_1.isFootballSourceType)(input.sourceType))
        fail('invalid-argument', 'invalid_source_type');
    const collection = sourcesRef(db, uid);
    const id = sourceIdFor(parsed.dedupeKey);
    const iso = now.toISOString();
    const source = {
        id,
        ownerId: uid,
        providerId: parsed.provider.id,
        providerName: parsed.provider.name,
        url: parsed.url,
        sourceType: input.sourceType,
        addedBy: 'player',
        addedAt: iso,
        updatedAt: iso,
        provenance: core_1.FOOTBALL_SOURCE_PROVENANCE,
        visibility: 'private',
        status: 'active',
        matchIds: [],
    };
    await db.runTransaction(async (tx) => {
        const ref = collection.doc(id);
        const [existing, count] = await Promise.all([tx.get(ref), tx.get(collection.limit(core_1.MAX_FOOTBALL_SOURCES))]);
        if (existing.exists)
            fail('already-exists', 'duplicate');
        if (count.size >= core_1.MAX_FOOTBALL_SOURCES)
            fail('resource-exhausted', 'limit_reached');
        tx.create(ref, { ...source, dedupeKey: parsed.dedupeKey });
    });
    return source;
}
async function knownMatchIds(db, uid, requested) {
    const profile = await db.collection('profiles').doc(uid).get();
    const matches = profile.get('statisticsMatches');
    const known = new Set((Array.isArray(matches) ? matches : [])
        .map((item) => (item && typeof item === 'object' ? item.id : undefined))
        .filter((id) => typeof id === 'string'));
    const missing = requested.filter((id) => !known.has(id));
    if (missing.length > 0) {
        const logs = await db.getAll(...missing.map((id) => db.collection('players').doc(uid).collection('matches').doc(id)));
        logs.filter((snap) => snap.exists).forEach((snap) => known.add(snap.id));
    }
    return known;
}
async function updateFootballSource(db, uid, input, now = new Date()) {
    if (typeof input.sourceId !== 'string' || !input.sourceId)
        fail('invalid-argument', 'invalid_source');
    const ref = sourcesRef(db, uid).doc(input.sourceId);
    const snap = await ref.get();
    if (!snap.exists)
        fail('not-found', 'not_found');
    const current = snap.data();
    const patch = {};
    if (input.sourceType !== undefined) {
        if (!(0, core_1.isFootballSourceType)(input.sourceType))
            fail('invalid-argument', 'invalid_source_type');
        patch.sourceType = input.sourceType;
    }
    if (input.visibility !== undefined) {
        if (!(0, core_1.isFootballSourceVisibility)(input.visibility))
            fail('invalid-argument', 'invalid_visibility');
        if (input.visibility !== 'private') {
            if (current.status !== 'active')
                fail('failed-precondition', 'under_review');
            // The provider must still be on the allowlist before a link is shown to anyone.
            const provider = (0, core_1.findFootballSourceProvider)(current.providerId);
            const reparsed = (0, core_1.parseFootballSourceUrl)(current.url);
            if (!provider || !reparsed.ok || reparsed.provider.id !== provider.id)
                fail('failed-precondition', 'provider_disabled');
            if (!visibilityAllowed(input.visibility, await (0, userSafety_1.loadSafetyPolicy)(uid, db)))
                fail('failed-precondition', 'guardian_scope_required');
        }
        patch.visibility = input.visibility;
    }
    if (input.matchIds !== undefined) {
        if (!Array.isArray(input.matchIds) || input.matchIds.some((id) => typeof id !== 'string' || !id)) {
            fail('invalid-argument', 'invalid_match');
        }
        const requested = [...new Set(input.matchIds)];
        if (requested.length > core_1.MAX_MATCHES_PER_SOURCE)
            fail('invalid-argument', 'too_many_matches');
        const known = requested.length > 0 ? await knownMatchIds(db, uid, requested) : new Set();
        if (requested.some((id) => !known.has(id)))
            fail('invalid-argument', 'invalid_match');
        patch.matchIds = requested;
    }
    if (Object.keys(patch).length === 0)
        return current;
    patch.updatedAt = now.toISOString();
    await ref.update(patch);
    return { ...current, ...patch };
}
async function removeFootballSource(db, uid, input) {
    if (typeof input.sourceId !== 'string' || !input.sourceId)
        fail('invalid-argument', 'invalid_source');
    await sourcesRef(db, uid).doc(input.sourceId).delete();
}
/** Active links at the given visibility levels whose provider is still allowlisted. */
async function loadVisibleSources(db, uid, levels) {
    const snapshot = await sourcesRef(db, uid).get();
    return snapshot.docs
        .map((doc) => doc.data())
        .filter((source) => source.status === 'active' &&
        typeof source.visibility === 'string' &&
        levels.includes(source.visibility) &&
        typeof source.url === 'string' &&
        (() => {
            const parsed = (0, core_1.parseFootballSourceUrl)(source.url);
            return parsed.ok && parsed.provider.id === source.providerId;
        })())
        .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
        .map((source) => ({
        id: source.id,
        providerId: source.providerId,
        providerName: (0, core_1.findFootballSourceProvider)(source.providerId)?.name ?? source.providerName,
        url: source.url,
        sourceType: source.sourceType,
        provenance: core_1.FOOTBALL_SOURCE_PROVENANCE,
    }));
}
//# sourceMappingURL=service.js.map