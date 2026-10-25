"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onDiscoverableSearchIndexWritten = void 0;
exports.refreshDiscoverySearchIndex = refreshDiscoverySearchIndex;
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const discoverySearchIndex_1 = require("./discoverySearchIndex");
async function refreshDiscoverySearchIndex(playerId, db = (0, firestore_2.getFirestore)()) {
    const ref = db.collection('discoverablePlayers').doc(playerId);
    await db.runTransaction(async (tx) => {
        const current = await tx.get(ref);
        if (!current.exists)
            return;
        const next = (0, discoverySearchIndex_1.buildDiscoverySearchIndex)(current.data());
        if (!(0, discoverySearchIndex_1.sameDiscoverySearchIndex)(current.get('_search'), next))
            tx.update(ref, { _search: next });
    });
}
// Re-read current data, not a delayed event's body. Never resurrect an unlisted player.
exports.onDiscoverableSearchIndexWritten = (0, firestore_1.onDocumentWritten)('discoverablePlayers/{playerId}', async (event) => refreshDiscoverySearchIndex(event.params.playerId));
//# sourceMappingURL=discoverySearchMaintenance.js.map