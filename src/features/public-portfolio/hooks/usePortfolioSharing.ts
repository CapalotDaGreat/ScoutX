import { useMemo } from 'react';
import {
  buildPublicPortfolioDeepLink,
  buildPublicPortfolioUrl,
} from '@/features/public-portfolio/constants';

export function usePortfolioSharing(playerId: string | null) {
  return useMemo(() => {
    if (!playerId) {
      return { shareUrl: '', deepLink: '' };
    }

    return {
      shareUrl: buildPublicPortfolioUrl(playerId),
      deepLink: buildPublicPortfolioDeepLink(playerId),
    };
  }, [playerId]);
}
