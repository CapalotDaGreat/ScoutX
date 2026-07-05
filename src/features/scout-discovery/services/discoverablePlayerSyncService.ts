import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { type PlayerProfile } from '@/features/player-profile/types';
import {
  buildDiscoverablePlayerFromProfile,
  serializeDiscoverablePlayer,
} from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { fetchPlayerVerificationState } from '@/features/verification-system/services/verificationService';

const COLLECTION = 'discoverablePlayers';

export async function syncDiscoverablePlayer(
  profile: PlayerProfile,
  coachRecommendations = 0,
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) {
    return;
  }

  const discoverable = profile.privacy?.discoverableByScouts ?? false;
  const docRef = doc(db, COLLECTION, profile.id);

  if (!discoverable) {
    try {
      await deleteDoc(docRef);
    } catch {
      // Document may not exist yet.
    }
    return;
  }

  const verification = await fetchPlayerVerificationState(profile.id);
  const payload = buildDiscoverablePlayerFromProfile(profile);
  payload.verified =
    verification.level === 'verified' ||
    (verification.level === 'basic' && (profile.privacy?.publicPortfolioEnabled ?? false)) ||
    coachRecommendations > 0;

  await setDoc(docRef, serializeDiscoverablePlayer(payload), { merge: true });
}
