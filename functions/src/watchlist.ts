import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

const PIPELINE = [
  'discovered',
  'shortlisted',
  'contacted',
  'invited',
  'trial',
  'evaluated',
  'follow_up',
] as const;

type PipelineStage = (typeof PIPELINE)[number];

function asStage(value: unknown): PipelineStage | null {
  return typeof value === 'string' && (PIPELINE as readonly string[]).includes(value)
    ? (value as PipelineStage)
    : null;
}

export const onRecruitmentEntryWritten = onDocumentWritten(
  'recruitmentWorkspaces/{scoutId}/entries/{playerId}',
  async (event) => {
    const { scoutId, playerId } = event.params;
    const before = event.data?.before.exists ? event.data.before.data() : null;
    const after = event.data?.after.exists ? event.data.after.data() : null;
    const db = getFirestore();
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
    } catch (error) {
      logger.error('Failed to write watchlist event', { scoutId, playerId, error });
      throw error;
    }
  },
);

export const onPassportSummaryWrittenNotifyWatchers = onDocumentWritten(
  'passportSummaries/{playerId}',
  async (event) => {
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
    const db = getFirestore();
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
  },
);
