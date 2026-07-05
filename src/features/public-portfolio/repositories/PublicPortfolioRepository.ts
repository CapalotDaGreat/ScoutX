import { doc, getDoc } from 'firebase/firestore';
import { getFirestoreDb } from '@/config/firebase';
import { type PlayerProfile } from '@/features/player-profile/types';
import { ProfileModel } from '@/features/player-profile/models/ProfileModel';
import { PlayerProfileRepository } from '@/features/player-profile/repositories/PlayerProfileRepository';
import { TrustRepository } from '@/features/trust-system/repositories/TrustRepository';
import { GpsSessionRepository } from '@/features/gps/repositories/GpsSessionRepository';
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

  public async fetchPublicPortfolio(playerId: string): Promise<PublicPortfolioData | null> {
    const profileRepository = PlayerProfileRepository.getInstance();
    const trustRepository = TrustRepository.getInstance();
    const gpsRepository = GpsSessionRepository.getInstance();

    let profile: PlayerProfile | null = null;
    const db = getFirestoreDb();

    if (db) {
      try {
        const snapshot = await getDoc(doc(db, 'profiles', playerId));
        if (snapshot.exists()) {
          profile = ProfileModel.fromFirestore(playerId, snapshot.data());
        }
      } catch {
        // fall through
      }
    }

    if (!profile) {
      try {
        profile = await profileRepository.fetchProfile(playerId);
      } catch {
        profile = null;
      }
    }

    if (!profile) {
      return null;
    }

    if (!profile.privacy?.publicPortfolioEnabled) {
      return null;
    }

    const recommendations = await this.loadRecommendations(trustRepository, playerId);
    const gpsSessions = await gpsRepository.fetchSessions(playerId);
    const gpsHighlights = gpsSessions.slice(0, 3);

    return buildPublicPortfolioData(profile, recommendations, gpsHighlights);
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
