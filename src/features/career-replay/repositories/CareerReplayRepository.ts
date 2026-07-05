import { doc, setDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { type CareerReplayData } from '@/features/career-replay/types';

const COLLECTION = 'careerReplays';

export class CareerReplayRepository {
  private static instance: CareerReplayRepository | null = null;

  private constructor() {}

  public static getInstance(): CareerReplayRepository {
    if (!this.instance) {
      this.instance = new CareerReplayRepository();
    }
    return this.instance;
  }

  public async saveReplay(playerId: string, replay: CareerReplayData): Promise<void> {
    const db = getFirestoreDb();
    if (!db) {
      return;
    }

    await setDoc(
      doc(db, COLLECTION, `${playerId}-${replay.seasonLabel.replace(/\//g, '-')}`),
      {
        playerId,
        seasonLabel: replay.seasonLabel,
        matchCount: replay.matchCount,
        totalGoals: replay.totalGoals,
        totalAssists: replay.totalAssists,
        milestonesEarned: replay.milestonesEarned,
        portfolioViews: replay.portfolioViews,
        scoutViews: replay.scoutViews,
        narrative: replay.narrative,
        sharedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  }
}
