import { doc, getDoc } from 'firebase/firestore';
import { getFirebaseAuth, getFirestoreDb } from '@/config/firebase';
import { type PlayerProfile } from '@/features/player-profile/types';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import { TrustRepository } from '@/features/trust-system/repositories/TrustRepository';
import { buildPublicPortfolioData } from '@/features/public-portfolio/models/PortfolioModel';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { type TrustRecommendation } from '@/features/trust-system/types';

export class PublicPortfolioRepository {
  private static instance: PublicPortfolioRepository | null = null;

  private constructor() {}

  public static getInstance(): PublicPortfolioRepository {
    if (!this.instance) {
      this.instance = new PublicPortfolioRepository();
    }
    return this.instance;
  }

  /**
   * Loads the passport as other users see it. Non-owners read the server-projected
   * `publicPassports/{playerId}` document (private profiles are owner-only); the owner reads
   * their own profile so the preview reflects unsaved privacy changes immediately.
   */
  public async fetchPublicPortfolio(playerId: string): Promise<PublicPortfolioData | null> {
    const trustRepository = TrustRepository.getInstance();

    const profile = await this.loadVisibleProfile(playerId);
    if (!profile) {
      return null;
    }

    if (!profile.privacy?.publicPortfolioEnabled) {
      return null;
    }

    const recommendations = await this.loadRecommendations(trustRepository, playerId);
    // GPS movement is owner-only and never part of the public passport, so the owner's
    // preview matches what visitors see.
    return buildPublicPortfolioData(profile, recommendations, []);
  }

  private async loadVisibleProfile(playerId: string): Promise<PlayerProfile | null> {
    const isOwner = getFirebaseAuth()?.currentUser?.uid === playerId;
    if (isOwner) {
      try {
        return await PlayerProfileRepository.getInstance().fetchProfile(playerId);
      } catch {
        return null;
      }
    }

    const db = getFirestoreDb();
    if (!db) {
      return null;
    }
    try {
      const snapshot = await getDoc(doc(db, 'publicPassports', playerId));
      if (!snapshot.exists()) {
        return null;
      }
      const data = snapshot.data();
      if (data.isPublic !== true) {
        return null;
      }
      return ProfileModel.fromFirestore(playerId, data);
    } catch {
      return null;
    }
  }

  private loadRecommendations(
    trustRepository: TrustRepository,
    playerId: string,
  ): Promise<TrustRecommendation[]> {
    return new Promise((resolve) => {
      let settled = false;
      const unsubscribe = trustRepository.subscribeToPlayerRecommendations(
        playerId,
        (items) => {
          if (!settled) {
            settled = true;
            unsubscribe();
            resolve(items);
          }
        },
        () => {
          if (!settled) {
            settled = true;
            unsubscribe();
            resolve([]);
          }
        },
      );
    });
  }
}
