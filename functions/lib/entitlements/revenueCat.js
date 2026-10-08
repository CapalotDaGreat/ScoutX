"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revenueCatWebhook = exports.PREMIUM_ENTITLEMENT_ID = void 0;
exports.isAppUserUid = isAppUserUid;
exports.parseRevenueCatEvent = parseRevenueCatEvent;
exports.deriveEntitlement = deriveEntitlement;
exports.applyRevenueCatEvent = applyRevenueCatEvent;
exports.revenueCatSecretMatches = secretMatches;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const webhookSecret = (0, params_1.defineSecret)('REVENUECAT_WEBHOOK_SECRET');
/** RevenueCat entitlement identifier that unlocks the premium plan. */
exports.PREMIUM_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID?.trim() || 'pitchproven';
const ACTIVATING = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    'NON_RENEWING_PURCHASE',
    'SUBSCRIPTION_EXTENDED',
    'TEMPORARY_ENTITLEMENT_GRANT',
    'CANCELLATION',
]);
/** Firebase uids only; RevenueCat anonymous ids never map to an account. */
function isAppUserUid(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 128 && !value.startsWith('$RCAnonymousID');
}
function parseRevenueCatEvent(body) {
    const event = body?.event;
    if (!event || typeof event !== 'object')
        return null;
    const data = event;
    if (typeof data.id !== 'string' || typeof data.type !== 'string')
        return null;
    return data;
}
function touchesPremium(event) {
    const ids = event.entitlement_ids ?? (event.entitlement_id ? [event.entitlement_id] : null);
    return !ids || ids.length === 0 || ids.includes(exports.PREMIUM_ENTITLEMENT_ID);
}
/**
 * Entitlement implied by one event, or null when the event does not change it (tests,
 * pauses, other entitlements). Expiry dates come from RevenueCat, never from the client.
 */
function deriveEntitlement(event, now = new Date()) {
    if (!touchesPremium(event))
        return null;
    const base = {
        productId: event.product_id ?? null,
        store: event.store ?? null,
        environment: event.environment ?? null,
        lastEventId: event.id,
        lastEventType: event.type,
        lastEventAt: new Date(event.event_timestamp_ms ?? now.getTime()).toISOString(),
        source: 'revenuecat',
    };
    const expiresMs = typeof event.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
    const expiresAt = expiresMs === null ? null : new Date(expiresMs).toISOString();
    const active = expiresMs === null || expiresMs > now.getTime();
    if (ACTIVATING.has(event.type)) {
        const status = !active ? 'expired' : event.period_type === 'TRIAL' ? 'trial' : 'premium';
        return { ...base, status, expiresAt, willRenew: event.type !== 'CANCELLATION' && event.type !== 'NON_RENEWING_PURCHASE' };
    }
    if (event.type === 'BILLING_ISSUE') {
        const graceMs = typeof event.grace_period_expiration_at_ms === 'number' ? event.grace_period_expiration_at_ms : null;
        if (graceMs !== null && graceMs > now.getTime()) {
            return { ...base, status: 'grace', expiresAt: new Date(graceMs).toISOString(), willRenew: true };
        }
        return { ...base, status: active ? 'premium' : 'expired', expiresAt, willRenew: false };
    }
    if (event.type === 'EXPIRATION') {
        return { ...base, status: 'expired', expiresAt, willRenew: false };
    }
    return null;
}
function secretMatches(header, secret) {
    if (!header || !secret)
        return false;
    const provided = Buffer.from(header.replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(secret);
    return provided.length === expected.length && (0, node_crypto_1.timingSafeEqual)(provided, expected);
}
/** Applies one event idempotently; older events never overwrite newer state. */
async function applyRevenueCatEvent(db, event, now = new Date()) {
    const eventRef = db.collection('revenueCatEvents').doc(event.id);
    if (event.type === 'TRANSFER') {
        const to = (event.transferred_to ?? []).find(isAppUserUid);
        const from = (event.transferred_from ?? []).filter(isAppUserUid);
        return db.runTransaction(async (tx) => {
            if ((await tx.get(eventRef)).exists)
                return 'duplicate';
            const sources = await Promise.all(from.map((uid) => tx.get(db.collection('entitlements').doc(uid))));
            const moved = sources.find((snap) => snap.exists)?.data();
            for (const uid of from) {
                tx.set(db.collection('entitlements').doc(uid), { status: 'free', expiresAt: null, willRenew: false, lastEventId: event.id, lastEventType: event.type, updatedAt: now.toISOString() }, { merge: true });
            }
            if (to && moved) {
                tx.set(db.collection('entitlements').doc(to), { ...moved, lastEventId: event.id, lastEventType: event.type, updatedAt: now.toISOString() });
            }
            tx.set(eventRef, { type: event.type, processedAt: now.toISOString() });
            return 'applied';
        });
    }
    const uid = [event.app_user_id, event.original_app_user_id].find(isAppUserUid);
    const record = deriveEntitlement(event, now);
    return db.runTransaction(async (tx) => {
        if ((await tx.get(eventRef)).exists)
            return 'duplicate';
        const ref = uid ? db.collection('entitlements').doc(uid) : null;
        const existing = ref ? await tx.get(ref) : null;
        tx.set(eventRef, { type: event.type, processedAt: now.toISOString(), ...(uid ? { uid } : {}) });
        if (!ref || !existing || !record)
            return 'ignored';
        const lastAt = Date.parse(String(existing.get('lastEventAt') ?? ''));
        if (Number.isFinite(lastAt) && lastAt > Date.parse(record.lastEventAt))
            return 'ignored';
        tx.set(ref, { ...record, uid, updatedAt: now.toISOString() });
        return 'applied';
    });
}
exports.revenueCatWebhook = (0, https_1.onRequest)({ secrets: [webhookSecret], cors: false, invoker: 'public', maxInstances: 10 }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method not allowed');
        return;
    }
    if (!secretMatches(req.get('authorization') ?? undefined, webhookSecret.value())) {
        res.status(401).send('Unauthorized');
        return;
    }
    const event = parseRevenueCatEvent(req.body);
    if (!event) {
        res.status(400).send('Invalid event');
        return;
    }
    try {
        const outcome = await applyRevenueCatEvent((0, firestore_1.getFirestore)(), event);
        firebase_functions_1.logger.info('RevenueCat event processed', { type: event.type, outcome });
        res.status(200).json({ outcome });
    }
    catch (error) {
        firebase_functions_1.logger.error('RevenueCat event failed', { type: event.type, message: error instanceof Error ? error.message : 'unknown' });
        res.status(500).send('Retry later');
    }
});
//# sourceMappingURL=revenueCat.js.map