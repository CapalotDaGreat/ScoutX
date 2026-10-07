import { HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { hasCurrentConsent } from '../legal/consent';

/**
 * AI processing needs a current `ai_analysis` consent from the requester and, when someone
 * else's data is analysed, from that person too. Withdrawn consent stops new AI runs.
 */
export async function assertAiConsent(uids: string[], db: Firestore = getFirestore()): Promise<void> {
  const [requester, ...subjects] = [...new Set(uids)];
  if (requester && !(await hasCurrentConsent(requester, 'ai_analysis', db))) {
    throw new HttpsError('failed-precondition', 'Turn on AI analysis in the Privacy Center to use this feature.', {
      reason: 'ai_consent_required',
    });
  }
  for (const subject of subjects) {
    if (!(await hasCurrentConsent(subject, 'ai_analysis', db))) {
      throw new HttpsError('failed-precondition', 'This player has not enabled AI analysis.', {
        reason: 'subject_ai_consent_missing',
      });
    }
  }
}
