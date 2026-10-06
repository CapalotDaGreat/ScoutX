import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import type { YearInReviewSnapshot } from '@/features/career-story/types';

/**
 * Year-in-review snapshots are create-once. Existing documents stay immutable.
 * Empty or invented narratives are never written.
 */
export async function persistCareerSnapshot(snapshot: YearInReviewSnapshot): Promise<void> {
  if (!snapshot.playerId || snapshot.narrative.label !== 'generated_from_records') {
    return;
  }
  const db = getFirestoreDb();
  if (!db) {
    return;
  }
  const ref = doc(db, 'careerSnapshots', snapshot.id);
  try {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      return;
    }
    await setDoc(ref, {
      playerId: snapshot.playerId,
      year: snapshot.year,
      matchCount: snapshot.matchCount,
      goals: snapshot.goals,
      assists: snapshot.assists,
      trialCount: snapshot.trialCount,
      momentCount: snapshot.momentCount,
      generatedAt: snapshot.generatedAt,
      narrative: snapshot.narrative,
    });
  } catch {
    // Create-only collisions and offline writes are non-fatal.
  }
}
