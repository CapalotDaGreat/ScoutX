"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onTrialInvitationUpdatedGuardian = exports.GUARDIAN_APPROVED_TRIAL_FIELDS = exports.onTrialInvitationCreatedGuardian = exports.revokeGuardianConsent = exports.respondGuardianConsent = exports.getGuardianConsentRequest = exports.requestGuardianConsent = exports.setAgeBand = void 0;
exports.trialDetailsChanged = trialDetailsChanged;
exports.notifyGuardianOfScoutContact = notifyGuardianOfScoutContact;
const firestore_1 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const params_1 = require("firebase-functions/params");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const appleAuth_1 = require("../appleAuth");
const deletion_1 = require("../dataRights/deletion");
const callableOptions_1 = require("../callableOptions");
const childAccounts_1 = require("./childAccounts");
const policy_1 = require("./policy");
const guardianToken_1 = require("./guardianToken");
const userSafety_1 = require("./userSafety");
const guardianLinkSecret = (0, params_1.defineSecret)('GUARDIAN_LINK_SECRET');
const CONSENT_VALIDITY_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_REQUESTS_PER_DAY = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** HMAC key for guardian links; anything shorter than 32 characters is treated as not configured. */
const MIN_LINK_SECRET_LENGTH = 32;
function linkSecret() {
    const value = guardianLinkSecret.value();
    if (value && value.length >= MIN_LINK_SECRET_LENGTH)
        return value;
    if (process.env.FUNCTIONS_EMULATOR === 'true')
        return 'scoutx-emulator-only-guardian-secret';
    if (value)
        firebase_functions_1.logger.error('GUARDIAN_LINK_SECRET is too short; guardian links are disabled');
    throw new https_1.HttpsError('failed-precondition', 'Guardian links are not configured.');
}
/**
 * Applies `update` only if `field` still holds this link's hash, inside a transaction, so two
 * simultaneous uses of one link cannot both succeed.
 */
async function updateIfLinkUnused(db, ref, field, tokenHash, update) {
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.get(field) !== tokenHash) {
            throw new https_1.HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
        }
        tx.update(ref, update);
    });
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
const NON_PLAYER_ROLES = ['scout', 'coach', 'club', 'admin'];
/**
 * Records the caller's age band. Bands can only become stricter; loosening goes through
 * support. Under-13 accounts become private and stay locked until a parent consents; without
 * consent they are deleted after CHILD_CONSENT_WAIT_DAYS.
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
        throw new https_1.HttpsError('failed-precondition', 'Your age group can only be changed by PitchProof support.');
    }
    if (existing?.ageBand === ageBand) {
        return { ageBand };
    }
    if (ageBand === 'under13') {
        const role = (await db.collection('users').doc(uid).get()).get('role');
        if (typeof role === 'string' && NON_PLAYER_ROLES.includes(role)) {
            throw new https_1.HttpsError('failed-precondition', 'Accounts for children under 13 can only use the player role.', {
                reason: 'child_player_only',
            });
        }
        // Choosing a band for the first time is part of sign-up. Moving an established account to
        // under-13 locks it and leads to deletion without parental consent, so it needs the same
        // recent sign-in as deleting the account.
        if (existing?.ageBand)
            await (0, deletion_1.assertDeletionAuthorized)(db, uid, request.auth?.token);
    }
    const now = new Date();
    await db.collection('userSafety').doc(uid).set({
        ageBand,
        guardianStatus: ageBand === '18plus' ? 'not_required' : 'required',
        scopes: [],
        consentId: null,
        consentExpiresAt: null,
        consentVersion: null,
        guardianEmailMasked: null,
        childDeleteAfter: ageBand === 'under13' ? (0, childAccounts_1.childConsentDeadline)(now) : null,
        ageBandSetAt: now.toISOString(),
        updatedAt: now.toISOString(),
    });
    return { ageBand };
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
    if (state?.ageBand !== '13-17' && state?.ageBand !== 'under13') {
        throw new https_1.HttpsError('failed-precondition', 'Guardian approval is only needed for players under 18.');
    }
    const child = state.ageBand === 'under13';
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
    const pending = await db.collection('youthConsents').where('uid', '==', uid).where('status', 'in', ['pending', 'confirming']).get();
    const batch = db.batch();
    for (const doc of pending.docs) {
        batch.update(doc.ref, { status: 'superseded', tokenHash: null, confirmTokenHash: null, updatedAt: now });
    }
    batch.set(consentRef, {
        uid,
        ageBand: state.ageBand,
        guardianEmailHash: (0, guardianToken_1.hashGuardianEmail)(secret, email),
        status: 'pending',
        version: child ? policy_1.CHILD_CONSENT_VERSION : policy_1.GUARDIAN_CONSENT_VERSION,
        method: child ? 'email_plus_signed_form' : 'email',
        requestedScopes: (0, policy_1.grantableScopes)(state.ageBand),
        scopes: [],
        tokenHash: (0, guardianToken_1.hashToken)(token),
        confirmTokenHash: null,
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
    await (0, userSafety_1.queueMail)(db, {
        to: email,
        uid,
        purpose: 'guardian_consent',
        ...(0, userSafety_1.guardianEmail)(child ? 'child_consent' : 'consent', { firstName, link: guardianLink(token) }),
    });
    return { status: 'pending', guardianEmailMasked: (0, guardianToken_1.maskEmail)(email) };
});
const LINK_FIELDS = {
    consent: 'tokenHash',
    confirm: 'confirmTokenHash',
    revoke: 'revokeTokenHash',
};
async function resolveToken(db, token) {
    const payload = (0, guardianToken_1.verifyGuardianToken)(linkSecret(), token, ['consent', 'confirm', 'revoke', 'trial']);
    if (!payload || typeof token !== 'string') {
        throw new https_1.HttpsError('permission-denied', 'This link is invalid or has expired.');
    }
    const tokenHash = (0, guardianToken_1.hashToken)(token);
    if (payload.purpose === 'trial') {
        const trial = await db.collection('trialInvitations').doc(payload.ref).get();
        if (!trial.exists || trial.get('guardianTokenHash') !== tokenHash) {
            throw new https_1.HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
        }
        return { kind: 'trial', payload, tokenHash, trial };
    }
    const consent = await db.collection('youthConsents').doc(payload.ref).get();
    if (!consent.exists || consent.get(LINK_FIELDS[payload.purpose]) !== tokenHash) {
        throw new https_1.HttpsError('permission-denied', 'This link has already been used or is no longer valid.');
    }
    return { kind: payload.purpose, payload, tokenHash, consent };
}
function isChildConsent(consent) {
    return consent.ageBand === 'under13';
}
/** A typed full name as the parent's signature: two to 100 characters, letters and name punctuation. */
function sanitizeSignature(value) {
    if (typeof value !== 'string')
        return null;
    const cleaned = value.trim().replace(/\s+/g, ' ');
    if (cleaned.length < 2 || cleaned.length > 100 || !/^[\p{L}\p{M}' .-]+$/u.test(cleaned))
        return null;
    return cleaned;
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
    const child = isChildConsent(consent);
    return {
        purpose: resolved.kind,
        child,
        playerFirstName: typeof contact.firstName === 'string' ? contact.firstName : 'Your child',
        status: consent.status,
        version: consent.version,
        scopes: (0, policy_1.grantableScopes)(child ? 'under13' : '13-17'),
        grantedScopes: Array.isArray(consent.scopes) ? consent.scopes : [],
        pendingScopes: Array.isArray(consent.pendingScopes) ? consent.pendingScopes : [],
    };
});
async function mailGuardian(db, uid, purpose, kind, link) {
    const contact = (await db.collection('guardianContacts').doc(uid).get()).data() ?? {};
    if (typeof contact.email !== 'string')
        return;
    await (0, userSafety_1.queueMail)(db, {
        to: contact.email,
        uid,
        purpose,
        ...(0, userSafety_1.guardianEmail)(kind, { firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child', link }),
    });
}
/**
 * A parent declined or withdrew consent for a child: the guardian gets a closing email and the
 * account is deleted. If deletion stops part-way, `childDeleteAfter` makes the daily cleanup
 * finish it.
 */
async function closeChildAccount(db, uid, status, now) {
    await db.collection('userSafety').doc(uid).set({ guardianStatus: status, scopes: [], consentExpiresAt: null, childDeleteAfter: now, updatedAt: now }, { merge: true });
    await mailGuardian(db, uid, 'guardian_child_closed', 'child_closed');
    await (0, childAccounts_1.deleteChildAccount)(db, uid, `parent_${status}`);
}
exports.respondGuardianConsent = (0, https_1.onCall)({ ...publicGuardianOptions, secrets: [guardianLinkSecret, ...appleAuth_1.accountDeletionSecrets], timeoutSeconds: 300 }, async (request) => {
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
        await updateIfLinkUnused(db, resolved.trial.ref, 'guardianTokenHash', resolved.tokenHash, update);
        return { ok: true, guardianApproval: update.guardianApproval };
    }
    const consent = resolved.consent.data() ?? {};
    const uid = String(consent.uid);
    const child = isChildConsent(consent);
    const safetyRef = db.collection('userSafety').doc(uid);
    const linkField = LINK_FIELDS[resolved.kind];
    if (decision === 'revoke') {
        if (resolved.kind !== 'revoke')
            throw new https_1.HttpsError('invalid-argument', 'Use the link from your confirmation email.');
        await updateIfLinkUnused(db, resolved.consent.ref, linkField, resolved.tokenHash, {
            status: 'revoked',
            scopes: [],
            revokedAt: now,
            revokeTokenHash: null,
            updatedAt: now,
            audit: firestore_1.FieldValue.arrayUnion({ event: 'revoked_by_guardian', at: now }),
        });
        if (child) {
            await closeChildAccount(db, uid, 'revoked', now);
            return { ok: true, status: 'revoked', accountDeleted: true };
        }
        await safetyRef.set({ guardianStatus: 'revoked', scopes: [], consentExpiresAt: null, updatedAt: now }, { merge: true });
        return { ok: true, status: 'revoked' };
    }
    if (decision === 'decline') {
        if (resolved.kind === 'revoke')
            throw new https_1.HttpsError('invalid-argument', 'Use revoke to withdraw consent.');
        await updateIfLinkUnused(db, resolved.consent.ref, linkField, resolved.tokenHash, {
            status: 'declined',
            tokenHash: null,
            confirmTokenHash: null,
            pendingScopes: [],
            updatedAt: now,
            audit: firestore_1.FieldValue.arrayUnion({ event: resolved.kind === 'confirm' ? 'confirmation_declined' : 'declined', at: now }),
        });
        if (child) {
            await closeChildAccount(db, uid, 'declined', now);
            return { ok: true, status: 'declined', accountDeleted: true };
        }
        await safetyRef.set({ guardianStatus: 'declined', scopes: [], updatedAt: now }, { merge: true });
        return { ok: true, status: 'declined' };
    }
    const allowed = (0, policy_1.grantableScopes)(child ? 'under13' : '13-17');
    const secret = linkSecret();
    // Under 13, step two: the parent confirms from the second email and consent takes effect.
    if (decision === 'confirm') {
        if (resolved.kind !== 'confirm')
            throw new https_1.HttpsError('invalid-argument', 'Use the link from the confirmation email.');
        const scopes = (Array.isArray(consent.pendingScopes) ? consent.pendingScopes : []).filter((scope) => (0, policy_1.isYouthScope)(scope) && allowed.includes(scope));
        return activateConsent(db, resolved, uid, scopes, consent, now, secret, 'confirmed');
    }
    if (decision !== 'approve')
        throw new https_1.HttpsError('invalid-argument', 'Unknown decision.');
    if (resolved.kind === 'confirm')
        throw new https_1.HttpsError('invalid-argument', 'Choose confirm or decline.');
    if (data.confirmGuardian !== true) {
        throw new https_1.HttpsError('invalid-argument', 'Confirm that you are the parent or legal guardian.');
    }
    const scopes = Array.isArray(data.scopes)
        ? [...new Set(data.scopes.filter((scope) => (0, policy_1.isYouthScope)(scope) && allowed.includes(scope)))]
        : [];
    // Under 13, step one: signed form, then a second email before anything takes effect.
    if (child && resolved.kind === 'consent') {
        const signature = sanitizeSignature(data.signature);
        if (!signature)
            throw new https_1.HttpsError('invalid-argument', 'Type your full name to sign.');
        if (data.acknowledged !== true) {
            throw new https_1.HttpsError('invalid-argument', 'Confirm that you have read the notice to parents.');
        }
        const confirmToken = (0, guardianToken_1.createGuardianToken)(secret, {
            ref: resolved.consent.id,
            purpose: 'confirm',
            exp: Date.now() + guardianToken_1.GUARDIAN_LINK_TTL_MS,
        });
        await updateIfLinkUnused(db, resolved.consent.ref, linkField, resolved.tokenHash, {
            status: 'confirming',
            pendingScopes: scopes,
            tokenHash: null,
            confirmTokenHash: (0, guardianToken_1.hashToken)(confirmToken),
            signature: { name: signature, at: now, guardianDeclaredAdult: true, noticeAcknowledged: true },
            updatedAt: now,
            audit: firestore_1.FieldValue.arrayUnion({ event: 'signed', at: now, scopes }),
        });
        await safetyRef.set({ guardianStatus: 'confirming', updatedAt: now }, { merge: true });
        await mailGuardian(db, uid, 'guardian_child_confirm', 'child_confirm', guardianLink(confirmToken));
        return { ok: true, status: 'confirming' };
    }
    return activateConsent(db, resolved, uid, scopes, consent, now, secret, resolved.kind === 'consent' ? 'approved' : 'scopes_updated');
});
async function activateConsent(db, resolved, uid, scopes, consent, now, secret, event) {
    const child = isChildConsent(consent);
    const expiresAt = new Date(Date.now() + CONSENT_VALIDITY_MS).toISOString();
    const revokeToken = (0, guardianToken_1.createGuardianToken)(secret, {
        ref: resolved.consent.id,
        purpose: 'revoke',
        exp: Date.now() + guardianToken_1.GUARDIAN_REVOKE_TTL_MS,
    });
    await updateIfLinkUnused(db, resolved.consent.ref, LINK_FIELDS[resolved.kind], resolved.tokenHash, {
        status: 'approved',
        scopes,
        pendingScopes: [],
        tokenHash: null,
        confirmTokenHash: null,
        revokeTokenHash: (0, guardianToken_1.hashToken)(revokeToken),
        grantedAt: consent.grantedAt ?? now,
        expiresAt,
        updatedAt: now,
        audit: firestore_1.FieldValue.arrayUnion({ event, at: now, scopes }),
    });
    await db.collection('userSafety').doc(uid).set({
        guardianStatus: 'approved',
        scopes,
        consentId: resolved.consent.id,
        consentVersion: consent.version ?? policy_1.GUARDIAN_CONSENT_VERSION,
        consentExpiresAt: expiresAt,
        childDeleteAfter: child ? (0, childAccounts_1.childDeleteAfterApproval)(expiresAt) : null,
        updatedAt: now,
    }, { merge: true });
    await mailGuardian(db, uid, 'guardian_confirmation', child ? 'child_confirmation' : 'confirmation', guardianLink(revokeToken));
    return { ok: true, status: 'approved', scopes };
}
/**
 * The player can withdraw guardian consent themselves; youth features stop immediately. A
 * child's account then waits for a new parental consent and is deleted without one.
 */
exports.revokeGuardianConsent = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = requireUid(request.auth?.uid);
    const db = (0, firestore_1.getFirestore)();
    const now = new Date();
    const nowIso = now.toISOString();
    const state = await (0, userSafety_1.loadSafetyState)(uid, db);
    const consents = await db
        .collection('youthConsents')
        .where('uid', '==', uid)
        .where('status', 'in', ['approved', 'pending', 'confirming'])
        .get();
    const batch = db.batch();
    for (const doc of consents.docs) {
        batch.update(doc.ref, {
            status: 'revoked',
            scopes: [],
            pendingScopes: [],
            tokenHash: null,
            confirmTokenHash: null,
            revokeTokenHash: null,
            revokedAt: nowIso,
            updatedAt: nowIso,
            audit: firestore_1.FieldValue.arrayUnion({ event: 'revoked_by_player', at: nowIso }),
        });
    }
    batch.set(db.collection('userSafety').doc(uid), {
        guardianStatus: 'revoked',
        scopes: [],
        consentExpiresAt: null,
        ...(state?.ageBand === 'under13' ? { childDeleteAfter: (0, childAccounts_1.childConsentDeadline)(now) } : {}),
        updatedAt: nowIso,
    }, { merge: true });
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
    if (state?.ageBand !== '13-17' || !event.data)
        return;
    await requestTrialGuardianApproval(db, event.data.ref, trial, {});
});
/** What a guardian approved; changing any of these needs a new approval. */
exports.GUARDIAN_APPROVED_TRIAL_FIELDS = ['club', 'coach', 'location', 'scheduledDate', 'scoutId'];
function trialDetailsChanged(before, after) {
    return exports.GUARDIAN_APPROVED_TRIAL_FIELDS.some((field) => before[field] !== after[field]);
}
async function requestTrialGuardianApproval(db, ref, trial, extra) {
    const token = (0, guardianToken_1.createGuardianToken)(linkSecret(), { ref: ref.id, purpose: 'trial', exp: Date.now() + guardianToken_1.GUARDIAN_LINK_TTL_MS });
    await ref.update({ guardianApproval: 'pending', guardianTokenHash: (0, guardianToken_1.hashToken)(token), guardianDecidedAt: null, ...extra });
    const contact = (await db.collection('guardianContacts').doc(String(trial.playerId)).get()).data() ?? {};
    if (typeof contact.email !== 'string') {
        firebase_functions_1.logger.warn('Minor trial without guardian contact', { trialId: ref.id });
        return;
    }
    await (0, userSafety_1.queueMail)(db, {
        to: contact.email,
        uid: String(trial.playerId),
        purpose: 'guardian_trial',
        ...(0, userSafety_1.guardianEmail)('trial', {
            firstName: typeof contact.firstName === 'string' ? contact.firstName : 'your child',
            club: typeof trial.club === 'string' ? trial.club.slice(0, 80) : undefined,
            link: guardianLink(token),
        }),
    });
}
/**
 * A guardian approves a specific trial (club, coach, place, date, scout). If the scout changes
 * any of that afterwards, the approval no longer applies: it goes back to pending, an accepted
 * trial returns to pending, and the guardian gets a new link.
 */
exports.onTrialInvitationUpdatedGuardian = (0, firestore_2.onDocumentUpdated)({ document: 'trialInvitations/{trialId}', secrets: [guardianLinkSecret] }, async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || !event.data)
        return;
    if (before.guardianApproval == null || !trialDetailsChanged(before, after))
        return;
    if (after.status === 'declined' || after.status === 'cancelled')
        return;
    const now = new Date().toISOString();
    await requestTrialGuardianApproval((0, firestore_1.getFirestore)(), event.data.after.ref, after, {
        ...(after.status === 'accepted' ? { status: 'pending' } : {}),
        history: firestore_1.FieldValue.arrayUnion({
            id: `guardian-reapproval-${now}`,
            action: 'note_added',
            actorId: 'system',
            actorName: 'PitchProof',
            actorRole: 'system',
            timestamp: now,
            note: 'Trial details changed; waiting for parent or guardian approval again',
        }),
        updatedAt: now,
    });
});
/** Informs the guardian of a minor when a scout contacts them through PitchProof. */
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