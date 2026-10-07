"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onPassportSummaryWrittenNotifyWatchers = exports.onRecruitmentEntryWritten = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const notificationProducers_1 = require("./notificationProducers");
const PIPELINE = [
    'discovered',
    'shortlisted',
    'contacted',
    'invited',
    'trial',
    'evaluated',
    'follow_up',
];
function asStage(value) {
    return typeof value === 'string' && PIPELINE.includes(value)
        ? value
        : null;
}
exports.onRecruitmentEntryWritten = (0, firestore_1.onDocumentWritten)('recruitmentWorkspaces/{scoutId}/entries/{playerId}', async (event) => {
    const { scoutId, playerId } = event.params;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const db = (0, firestore_2.getFirestore)();
    const watcherRef = db.collection('playerWatchers').doc(playerId).collection('scouts').doc(scoutId);
    try {
        if (!after) {
            await watcherRef.delete().catch(() => undefined);
            await db.collection('watchlistEvents').add({
                scoutId,
                playerId,
                type: 'removed',
                fromStage: asStage(before?.stage),
                toStage: null,
                lastEvidenceAt: null,
                createdAt: new Date().toISOString(),
            });
            return;
        }
        await watcherRef.set({ scoutId, playerId, updatedAt: new Date().toISOString() });
        const fromStage = asStage(before?.stage);
        const toStage = asStage(after.stage);
        const type = before ? (fromStage !== toStage ? 'stage_changed' : null) : 'added';
        if (!type) {
            return;
        }
        await db.collection('watchlistEvents').add({
            scoutId,
            playerId,
            type,
            fromStage,
            toStage,
            lastEvidenceAt: typeof after.lastEvidenceAt === 'string' ? after.lastEvidenceAt : null,
            createdAt: new Date().toISOString(),
        });
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to write watchlist event', { scoutId, playerId, error });
        throw error;
    }
});
exports.onPassportSummaryWrittenNotifyWatchers = (0, firestore_1.onDocumentWritten)('passportSummaries/{playerId}', async (event) => {
    const playerId = event.params.playerId;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    if (!after) {
        return;
    }
    const lastEvidenceAt = typeof after.lastEvidenceAt === 'string' ? after.lastEvidenceAt : null;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const previous = typeof before?.lastEvidenceAt === 'string' ? before.lastEvidenceAt : null;
    if (!lastEvidenceAt || lastEvidenceAt === previous) {
        return;
    }
    const db = (0, firestore_2.getFirestore)();
    const watchers = await db.collection('playerWatchers').doc(playerId).collection('scouts').limit(50).get();
    if (watchers.empty) {
        return;
    }
    const now = new Date().toISOString();
    const batch = db.batch();
    for (const watcher of watchers.docs) {
        const ref = db.collection('watchlistEvents').doc();
        batch.set(ref, {
            scoutId: watcher.id,
            playerId,
            type: 'new_evidence',
            fromStage: null,
            toStage: null,
            lastEvidenceAt,
            createdAt: now,
        });
    }
    await batch.commit();
    await Promise.allSettled(watchers.docs.map((watcher) => (0, notificationProducers_1.notifyWatchlistChange)(db, watcher.id, playerId)));
});
//# sourceMappingURL=watchlist.js.map