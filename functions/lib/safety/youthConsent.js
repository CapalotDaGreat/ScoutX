"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTrialInvitationCreatedGuardian = exports.revokeGuardianConsent = exports.respondGuardianConsent = exports.getGuardianConsentRequest = exports.requestGuardianConsent = exports.setAgeBand = void 0;
exports.notifyGuardianOfScoutContact = notifyGuardianOfScoutContact;
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const accountDeletion_1 = require("../accountDeletion");
const callableOptions_1 = require("../callableOptions");
const policy_1 = require("./policy");
const guardianToken_1 = require("./guardianToken");
const userSafety_1 = require("./userSafety");
const guardianLinkSecret = (0, params_1.defineSecret)('GUARDIAN_LINK_SECRET');
const CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
function linkSecret() {
    const value = guardianLinkSecret.value();
    if (value)
        return value;
    if (process.env.FUNCTIONS_EMULATOR === 'true')
        return 'scoutx-emulator-only-guardian-secret';
    throw new https_1.HttpsError('failed-precondition', 'Guardian links are not configured.');
}
function requireUid(uid) {
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    return uid;
}
function guardianLink(token) {
    return `${(0, userSafety_1.guardianLinkBaseUrl)()}/guardian/?t=${encodeURIComponent(token)}`;
}
function sanitizeFirstName(value) {
    const name = typeof value === 'string' ? value.trim().split(/\s+/)[0] ?? '' : '';
    const cleaned = name.replace(/[^\p{L}\p{M}'-]/gu, '').slice(0, 40);
    return cleaned || 'A young player';
}
/**
 * Records the caller's age band. Bands can only become stricter; loosening goes through
 * support. Under-13 accounts are not allowed, so the account is deleted immediately.
 */
exports.setAgeBand = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = requireUid(request.auth?.uid);
    const ageBand = request.data?.ageBand;
    if (!(0, policy_1.isAgeBand)(ageBand)) {
        throw new https_1.HttpsError('invalid-argument', 'ageBand must be under13, 13-17 or 18plus.');
    }
    const db = (0, firestore_1.getFirestore)();
    const existing = await (0, userSafety_1.loadSafetyState)(uid, db);
    if (!(0, policy_1.canChangeAgeBand)(existing?.ageBand ?? null, ageBand)) {
        throw new https_1.HttpsError('failed-precondition', 'Your age group can only be changed by ScoutX support.');
    }
    if (ageBand === 'under13') {
        const { failures } = await (0, accountDeletion_1.deleteAllUserData)(uid);
        if (failures.length > 0)
            firebase_functions_1.logger.warn('Under-13 account cleanup partial', { uid, failures });
        await (0, auth_1.getAuth)().deleteUser(uid);
        return { ageBand, deleted: true };
    }
    const now = new Date().toISOString();
    if (existing?.ageBand === ageBand) {
        return { ageBand, deleted: false };
    }
    await db.collection('userSafety').doc(uid).set({
        ageBand,
        guardianStatus: ageBand === '18plus' ? 'not_required' : 'required',
        scopes: [],
        consentId: null,
        consentExpiresAt: null,
        consentVersion: null,
        guardianEmailMasked: null,
        ageBandSetAt: now,
        updatedAt: now,
    });
    return { ageBand, deleted: false };
});
exports.requestGuardianConsent = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)({ secrets: [guardianLinkSecret] }), async (request) => {
    const uid = requireUid(request.auth?.uid);
    const data = (request.data ?? {});
    if (!(0, guardianToken_1.isPlausibleEmail)(data.guardianEmail)) {
        throw new https_1.HttpsError('invalid-argument', 'Enter a valid email address for your parent or guardian.');
    }
    const email = data.guardianEmail.trim();
    const authEmail = request.auth?.token.email;
    if (typeof authEmail === 'string' && authEmail.toLowerCase() === email.toLowerCase()) {
        throw new https_1.HttpsError('invalid-argument', "Use your parent's or guardian's email, not your own.");
    }
    const db = (0, firestore_1.getFirestore)();
    const state = await (0, userSafety_1.loadSafetyState)(uid, db);
    if (state?.ageBand !== '13-17') {
        throw new https_1.HttpsError('failed-precondition', 'Guardian approval is only needed for players aged 13 to 17.');
    }
    const secret = linkSecret();
    const contactRef = db.collection('guardianContacts').doc(uid);
    const contact = (await contactRef.get()).data() ?? {};
    const recent = (Array.isArray(contact.requestTimes) ? contact.requestTimes : [])
        .filter((value) => typeof value === 'number' && value > Date.now() - DAY_MS);
    if (recent.length >= MAX_REQUESTS_PER_DAY) {
        throw new https_1.HttpsError('resource-exhausted', 'Too many guardian emails today. Try again tomorrow.');
    }
    const consentRef = db.collection('youthConsents').doc();
    const token = (0, guardianToken_1.createGuardianToken)(secret, {
        ref: consentRef.id,
        purpose: 'consent',
        exp: Date.now() + guardianToken_1.GUARDIAN_LINK_TTL_MS,
    });
    const firstName = sanitizeFirstName(data.playerFirstName);
    const now = new Date().toISOString();
    const pending = await db.collection('youthConsents').where('uid', '==', uid).where('status', '==', 'pending').get();
    const batch = db.batch();
    for (const doc of pending.docs) {
        batch.update(doc.ref, { status: 'superseded', tokenHash: null, updatedAt: now });
    }
    batch.set(consentRef, {
        uid,
        guardianEmailHash: (0, guardianToken_1.hashGuardianEmail)(secret, email),
        status: 'pending',
        version: policy_1.GUARDIAN_CONSENT_VERSION,
        requestedScopes: policy_1.YOUTH_SCOPES,
        scopes: [],
        tokenHash: (0, guardianToken_1.hashToken)(token),
        revokeTokenHash: null,
        linkExpiresAt: new Date(Date.now() + guardianToken_1.GUARDIAN_LINK_TTL_MS).toISOString(),
        grantedAt: null,
        revokedAt: null,
        expiresAt: null,
        createdAt: now,
        updatedAt: now,
        audit: [{ event: 'requested', at: now }],
    });
    batch.set(contactRef, {
        email,
        emailHash: (0, guardianToken_1.hashGuardianEmail)(secret, email),
        firstName,
        requestTimes: [...recent, Date.now()],
        updatedAt: now,
    });
    batch.set(db.collection('userSafety').doc(uid), { guardianStatus: 'pending', consentId: consentRef.id, guardianEmailMasked: (0, guardianToken_1.maskEmail)(email), updatedAt: now }, { merge: true });
    await batch.commit();
    await (0, userSafety_1.queueMail)(db, { to: email, uid, purpose: 'guardian_consent', ...(0, userSafety_1.guardianEmail)('consent', { firstName, link: guardianLink(token) }) });
    return { status: 'pending', guardianEmailMasked: (0, guardianToken_1.maskEmail)(email) };
});
async function resolveToken(db, token) {
    const payload = (0, guardianToken_1.verifyGuardianToken)(linkSecret(), token, ['consent', 'revoke', 'trial']);
    if (!payload || typeof token !== 'string') {
        throw new https_1.HttpsError('permission-denied', 'This link is invalid or has expired.');
    }
    const tokenHash = (0, guardianToken_1.hashToken)(token);
    if (payload.purpose === 'trial') {
        const trial = await db.collection('trialInvitations').doc(payload.ref).get();
        if (!trial.exists || trial.get('guardianTokenHash') !== tokenHash) {
            throw new https_1.HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
        }
        return { kind: 'trial', payload, trial };
    }
    const consent = await db.collection('youthConsents').doc(payload.ref).get();
    const field = payload.purpose === 'consent' ? 'tokenHash' : 'revokeTokenHash';
    if (!consent.exists || consent.get(field) !== tokenHash) {
        throw new https_1.HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
    }
    return { kind: payload.purpose, payload, consent };
}
/** Hosting page calls this without an account; the signed token is the only credential. */
const publicGuardianOptions = (0, callableOptions_1.createCallableOptions)({ secrets: [guardianLinkSecret], enforceAppCheck: false });
exports.getGuardianConsentRequest = (0, https_1.onCall)(publicGuardianOptions, async (request) => {
    const db = (0, firestore_1.getFirestore)();
    const resolved = await resolveToken(db, request.data?.token);
    if (resolved.kind === 'trial') {
        const trial = resolved.trial.data() ?? {};
        const contact = (await db.collection('guardianContacts').doc(String(trial.playerId)).get()).data() ?? {};
        return {
            purpose: 'trial',
            playerFirstName: typeof contact.firstName === 'string' ? contact.firstName : 'Your child',
            trial: {
                club: typeof trial.club === 'string' ? trial.club : '',
                date: typeof trial.scheduledDate === 'string' ? trial.scheduledDate : '',
                location: typeof trial.location === 'string' ? trial.location : '',
                scoutName: typeof trial.scoutName === 'string' ? trial.scoutName : '',
            },
            guardianApproval: trial.guardianApproval ?? 'pending',
        };
    }
    const consent = resolved.consent.data() ?? {};
    const contact = (await db.collection('guardianContacts').doc(String(consent.uid)).get()).data() ?? {};
    return {
        purpose: resolved.kind,
        playerFirstName: typeof contact.firstName === 'string' ? contact.firstName : 'Your child',
        status: consent.status,
        version: consent.version,
        scopes: policy_1.YOUTH_SCOPES,
        grantedScopes: Array.isArray(consent.scopes) ? consent.scopes : [],
    };
});
exports.respondGuardianConsent = (0, https_1.onCall)(publicGuardianOptions, async (request) => {
    const db = (0, firestore_1.getFirestore)();
    const data = (request.data ?? {});
    const resolved = await resolveToken(db, data.token);
    const decision = data.decision;
    const now = new Date().toISOString();
    if (resolved.kind === 'trial') {
        if (decision !== 'approve' && decision !== 'decline') {
            throw new https_1.HttpsError('invalid-argument', 'Choose approve or decline.');
        }
        const trial = resolved.trial.data() ?? {};
        const update = {
            guardianApproval: decision === 'approve' ? 'approved' : 'declined',
            guardianDecidedAt: now,
            guardianTokenHash: null,
        };
        if (decision === 'decline' && trial.status === 'pending') {
            update.status = 'declined';
            update.history = firestore_1.FieldValue.arrayUnion({
                id: `guardian-${now}`,
                action: 'declined',
                actorId: 'guardian',
                actorName: 'Guardian',
                actorRole: 'player',
                timestamp: now,
                note: 'Declined by parent or guardian',
            });
            update.updatedAt = now;
        }
        await resolved.trial.ref.update(update);
        return { ok: true, guardianApproval: update.guardianApproval };
    }
    const consent = resolved.consent.data() ?? {};
    const uid = String(consent.uid);
    const safetyRef = db.collection('userSafety').doc(uid);
    if (decision === 'revoke') {
        if (resolved.kind !== 'revoke')
            throw new https_1.HttpsError('invalid-argument', 'Use the link from your confirmation email.');
        await resolved.consent.ref.update({
            status: 'revoked',
            scopes: [],
            revokedAt: now,
            revokeTokenHash: null,
            updatedAt: now,
            audit: firestore_1.FieldValue.arrayUnion({ event: 'revoked_by_guardian', at: now }),
        });
        await safetyRef.set({ guardianStatus: 'revoked', scopes: [], consentExpiresAt: null, updatedAt: now }, { merge: true });
        return { ok: true, status: 'revoked' };
    }
    if (decision === 'decline') {
        if (resolved.kind !== 'consent')
            throw new https_1.HttpsError('invalid-argument', 'Use revoke to withdraw consent.');
        await resolved.consent.ref.update({
            status: 'declined',
            tokenHash: null,
            updatedAt: now,
            audit: firestore_1.FieldValue.arrayUnion({ event: 'declined', at: now }),
        });
        await safetyRef.set({ guardianStatus: 'declined', scopes: [], updatedAt: now }, { merge: true });
        return { ok: true, status: 'declined' };
    }
    if (decision !== 'approve')
        throw new https_1.HttpsError('invalid-argument', 'Unknown decision.');
    if (data.confirmGuardian !== true) {
        throw new https_1.HttpsError('invalid-argument', 'Confirm that you are the parent or legal guardian.');
    }
    const scopes = Array.isArray(data.scopes) ? [...new Set(data.scopes.filter(policy_1.isYouthScope))] : [];
    const expiresAt = new Date(Date.now() + CONSENT_VALIDITY_MS).toISOString();
    const revokeToken = (0, guardianToken_1.createGuardianToken)(linkSecret(), {
        ref: resolved.consent.id,
        purpose: 'revoke',
        exp: Date.now() + guardianToken_1.GUARDIAN_REVOKE_TTL_MS,
    });
    await resolved.consent.ref.update({
        status: 'approved',
        scopes,
        tokenHash: null,
        revokeTokenHash: (0, guardianToken_1.hashToken)(revokeToken),
        grantedAt: consent.grantedAt ?? now,
        expiresAt,
        updatedAt: now,
        audit: firestore_1.FieldValue.arrayUnion({ event: resolved.kind === 'consent' ? 'approved' : 'scopes_updated', at: now, scopes }),
    });
    await safetyRef.set({
        guardianStatus: 'approved',
        scopes,
        consentId: resolved.consent.id,
        consentVersion: consent.version ?? policy_1.GUARDIAN_CONSENT_VERSION,
        consentExpiresAt: expiresAt,
        updatedAt: now,
    }, { merge: true });
    const contact = (await db.collection('guardianContacts').doc(uid).get()).data() ?? {};
    if (typeof contact.email === 'string') {
        await (0, userSafety_1.queueMail)(db, {
            to: contact.email,
            uid,
            purpose: 'guardian_confirmation',
            ...(0, userSafety_1.guardianEmail)('confirmation', {
                firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child',
                link: guardianLink(revokeToken),
            }),
        });
    }
    return { ok: true, status: 'approved', scopes };
});
/** The player can withdraw guardian consent themselves; youth features stop immediately. */
exports.revokeGuardianConsent = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = requireUid(request.auth?.uid);
    const db = (0, firestore_1.getFirestore)();
    const now = new Date().toISOString();
    const consents = await db.collection('youthConsents').where('uid', '==', uid).where('status', 'in', ['approved', 'pending']).get();
    const batch = db.batch();
    for (const doc of consents.docs) {
        batch.update(doc.ref, {
            status: 'revoked',
            scopes: [],
            tokenHash: null,
            revokeTokenHash: null,
            revokedAt: now,
            updatedAt: now,
            audit: firestore_1.FieldValue.arrayUnion({ event: 'revoked_by_player', at: now }),
        });
    }
    batch.set(db.collection('userSafety').doc(uid), { guardianStatus: 'revoked', scopes: [], consentExpiresAt: null, updatedAt: now }, { merge: true });
    await batch.commit();
    return { status: 'revoked' };
});
/** Trials for minors wait for guardian co-approval before the player can accept. */
exports.onTrialInvitationCreatedGuardian = (0, firestore_2.onDocumentCreated)({ document: 'trialInvitations/{trialId}', secrets: [guardianLinkSecret] }, async (event) => {
    const trial = event.data?.data();
    if (!trial || typeof trial.playerId !== 'string')
        return;
    const db = (0, firestore_1.getFirestore)();
    const state = await (0, userSafety_1.loadSafetyState)(trial.playerId, db);
    if (state?.ageBand !== '13-17')
        return;
    const token = (0, guardianToken_1.createGuardianToken)(linkSecret(), {
        ref: event.params.trialId,
        purpose: 'trial',
        exp: Date.now() + guardianToken_1.GUARDIAN_LINK_TTL_MS,
    });
    await event.data?.ref.update({ guardianApproval: 'pending', guardianTokenHash: (0, guardianToken_1.hashToken)(token) });
    const contact = (await db.collection('guardianContacts').doc(trial.playerId).get()).data() ?? {};
    if (typeof contact.email !== 'string') {
        firebase_functions_1.logger.warn('Minor trial without guardian contact', { trialId: event.params.trialId });
        return;
    }
    await (0, userSafety_1.queueMail)(db, {
        to: contact.email,
        uid: trial.playerId,
        purpose: 'guardian_trial',
        ...(0, userSafety_1.guardianEmail)('trial', {
            firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child',
            club: typeof trial.club === 'string' ? trial.club.slice(0, 80) : undefined,
            link: guardianLink(token),
        }),
    });
});
/** Informs the guardian of a minor when a scout contacts them through ScoutX. */
async function notifyGuardianOfScoutContact(db, playerId) {
    const contact = (await db.collection('guardianContacts').doc(playerId).get()).data() ?? {};
    if (typeof contact.email !== 'string')
        return;
    await (0, userSafety_1.queueMail)(db, {
        to: contact.email,
        uid: playerId,
        purpose: 'guardian_scout_contact',
        ...(0, userSafety_1.guardianEmail)('contact', { firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child' }),
    });
}
//# sourceMappingURL=youthConsent.js.map