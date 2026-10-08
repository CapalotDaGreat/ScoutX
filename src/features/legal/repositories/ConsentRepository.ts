import { doc, onSnapshot } from 'firebase/firestore';
import { useMockData } from '@/config/appMode';
import { getFirestoreDb } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import { parseConsentSummary, type ConsentSummary } from '@/features/legal/consentModel';
import { REQUIRED_CONSENTS, type ConsentType } from '@/features/legal/types';

export type ConsentDecision = { type: ConsentType; decision: 'granted' | 'withdrawn' };
export type ConsentSource = 'signup' | 'reacceptance' | 'privacy_center' | 'upload' | 'analysis';

type RecordConsentRequest = { items: ConsentDecision[]; locale: string; source: ConsentSource };

const MOCK_SUMMARY: ConsentSummary = Object.fromEntries(
  REQUIRED_CONSENTS.map(({ type, documentId }) => [
    type,
    { status: 'granted', documentId, version: '1.0.0', locale: 'en', at: '2026-01-01T00:00:00.000Z' },
  ]),
);

export const ConsentRepository = {
  subscribe(uid: string, onData: (summary: ConsentSummary) => void, onError: (error: Error) => void): () => void {
    const db = getFirestoreDb();
    if (!db) {
      // Offline demo builds only: without a server there is nowhere to record consent.
      onData(useMockData() ? MOCK_SUMMARY : {});
      return () => undefined;
    }
    return onSnapshot(
      doc(db, 'consentRecords', uid),
      (snapshot) => onData(parseConsentSummary(snapshot.data())),
      onError,
    );
  },

  async record(items: ConsentDecision[], locale: string, source: ConsentSource): Promise<void> {
    const fn = createCallableFunction<RecordConsentRequest>('recordConsent');
    if (!fn) throw new Error('PitchProof needs a connection to the server to save this choice.');
    await fn({ items, locale, source });
  },
};
