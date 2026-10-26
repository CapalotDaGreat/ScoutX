import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { createCallableOptions } from '../callableOptions';
import { planFor } from '../entitlements/quotaService';
import { assertCallableRateLimit, VIDEO_SOURCE_INSPECT_LIMIT } from '../security/rateLimit';
import { inspectSource, type SourceInspection } from './videoProviders';

/**
 * "Import from link" step 1: recognise and validate a video link for the signed-in user.
 * The validated media URL never leaves the server; the app receives provider, status,
 * permitted metadata and (for Veo) actionable export steps.
 */
export const inspectVideoSource = onCall(createCallableOptions({ timeoutSeconds: 30 }), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to import a video.');
  const url = (request.data as { url?: unknown } | undefined)?.url;
  if (typeof url !== 'string' || url.length > 2048) throw new HttpsError('invalid-argument', 'Provide a video link.');
  await assertCallableRateLimit(uid, VIDEO_SOURCE_INSPECT_LIMIT);
  const plan = await planFor(getFirestore(), uid);
  const result: SourceInspection = await inspectSource(url, { maxBytes: plan.maxVideoBytes });
  const { mediaUrl: _hidden, ...safe } = result;
  return { ...safe, maxVideoBytes: plan.maxVideoBytes, maxVideoDurationSec: plan.maxVideoDurationSec };
});
