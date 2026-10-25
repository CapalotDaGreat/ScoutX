import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { buildDiscoverySearchIndex, sameDiscoverySearchIndex } from './discoverySearchIndex';

export async function refreshDiscoverySearchIndex(playerId: string, db: Firestore = getFirestore()): Promise<void> {
  const ref = db.collection('discoverablePlayers').doc(playerId);
  await db.runTransaction(async (tx) => {
    const current = await tx.get(ref);
    if (!current.exists) return;
    const next = buildDiscoverySearchIndex(current.data()!);
    if (!sameDiscoverySearchIndex(current.get('_search'), next)) tx.update(ref, { _search: next });
  });
}

// Re-read current data, not a delayed event's body. Never resurrect an unlisted player.
export const onDiscoverableSearchIndexWritten = onDocumentWritten('discoverablePlayers/{playerId}',
  async (event) => refreshDiscoverySearchIndex(event.params.playerId));
