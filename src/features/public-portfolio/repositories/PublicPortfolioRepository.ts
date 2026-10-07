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
    const isOwner = getFirebaseAuth()?.currentUser?.uid === playerId;
    if (!isOwner) {
      return this.fetchStrangerView(playerId);
    }
    let profile: PlayerProfile | null;
    try {
      profile = await PlayerProfileRepository.getInstance().fetchProfile(playerId);
    } catch {
      return null;
    }
    if (!profile?.privacy?.publicPortfolioEnabled) {
      return null;
    }
    const recommendations = await this.loadRecommendations(TrustRepository.getInstance(), playerId);
    // GPS movement is owner-only and never part of the public passport.
    return buildPublicPortfolioData(profile, recommendations, []);
  }

  /**
   * What a stranger sees: the server-built `publicPassports` projection, never the owner's
   * private profile. Null means strangers see nothing.
   */
  public async fetchStrangerView(playerId: string): Promise<PublicPortfolioData | null> {
    const projection = await this.loadProjection(playerId);
    if (!projection?.profile.privacy?.publicPortfolioEnabled) {
      return null;
    }
    const recommendations = await this.loadRecommendations(TrustRepository.getInstance(), playerId);
    return {
      ...buildPublicPortfolioData(projection.profile, recommendations, []),
      ageGroupLabel: projection.ageGroupLabel,
    };
  }

  private async loadProjection(
    playerId: string,
  ): Promise<{ profile: PlayerProfile; ageGroupLabel: 'youth' | null } | null> {
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
      return {
        profile: ProfileModel.fromFirestore(playerId, data),
        ageGroupLabel: data.ageGroupLabel === 'youth' ? 'youth' : null,
      };
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
