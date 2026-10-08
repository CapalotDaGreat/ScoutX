import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from '../callableOptions';
import { reprojectOwner } from '../moderation/reproject';
import { FOOTBALL_SOURCES_COLLECTION, footballSourceLogContext } from './core';
import { addFootballSource, removeFootballSource, updateFootballSource } from './service';

function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in required.');
  return uid;
}

function payload(request: CallableRequest): Record<string, unknown> {
  return request.data && typeof request.data === 'object' ? (request.data as Record<string, unknown>) : {};
}

export const addExternalFootballSource = onCall(createCallableOptions(), async (request) => {
  const uid = requireUid(request);
  const source = await addFootballSource(getFirestore(), uid, payload(request));
  logger.info('Football source added', footballSourceLogContext(source));
  return { source };
});

export const updateExternalFootballSource = onCall(createCallableOptions(), async (request) => {
  const uid = requireUid(request);
  return { source: await updateFootballSource(getFirestore(), uid, payload(request)) };
});

export const removeExternalFootballSource = onCall(createCallableOptions(), async (request) => {
  const uid = requireUid(request);
  await removeFootballSource(getFirestore(), uid, payload(request));
  return { removed: true };
});

const PUBLIC_FIELDS = ['visibility', 'status', 'url', 'providerId', 'sourceType'] as const;

/** Passport and scout copies are rebuilt whenever a link is added, removed, hidden or reshared. */
export const onFootballSourceWrittenReproject = onDocumentWritten(
  `players/{uid}/${FOOTBALL_SOURCES_COLLECTION}/{sourceId}`,
  async (event) => {
    const before = event.data?.before.data() ?? {};
    const after = event.data?.after.data() ?? {};
    if (PUBLIC_FIELDS.every((field) => before[field] === after[field])) return;
    try {
      await reprojectOwner(event.params.uid);
    } catch (error) {
      logger.error('Football source reprojection failed', { message: error instanceof Error ? error.message : 'unknown' });
      throw error;
    }
  },
);
