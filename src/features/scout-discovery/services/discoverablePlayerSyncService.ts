import { getFirestoreDb } from '@/config/firebase';

/**
 * Discovery listings are projected server-side from the private profile, passport
 * summary, and verification state. The client must not write stats, ratings, or
 * a verified badge onto `discoverablePlayers`.
 */
export async function syncDiscoverablePlayer(_profile: { id: string }): Promise<void> {
  void getFirestoreDb();
}
