import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { createCallableFunction } from '@/firebase/callableFunctions';
import { parseModerationNotice, type ModerationNotice } from '@/features/trust-safety/moderationNotice';

export const ModerationNoticeRepository = {
  subscribe(uid: string, onData: (notices: ModerationNotice[]) => void, onError: (error: Error) => void): () => void {
    const db = getFirestoreDb();
    if (!db) {
      onData([]);
      return () => undefined;
    }
    return onSnapshot(
      query(collection(db, 'moderationNotices', uid, 'items'), orderBy('at', 'desc'), limit(20)),
      (snapshot) =>
        onData(
          snapshot.docs.flatMap((item) => {
            const notice = parseModerationNotice(item.id, item.data());
            return notice ? [notice] : [];
          }),
        ),
      onError,
    );
  },

  async appeal(caseId: string, text: string): Promise<void> {
    const fn = createCallableFunction<{ caseId: string; text: string }>('submitAppeal');
    if (!fn) throw new Error('ScoutX needs a connection to the server to send an appeal.');
    await fn({ caseId, text });
  },
};
