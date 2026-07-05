import { PublicPortfolioRouteContainer } from '@/features/public-portfolio/components/PublicPortfolioRouteContainer';
import { useEndorseModeFromLinking } from '@/features/public-portfolio/hooks/useEndorseModeFromLinking';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';

export type PublicPortfolioStackScreenProps = {
  playerId?: string;
  slug?: string;
  previewMode?: boolean;
  previewData?: PublicPortfolioData;
  previewLoading?: boolean;
  onBack?: () => void;
};

export function PublicPortfolioStackScreen({
  playerId,
  slug,
  previewMode,
  previewData,
  previewLoading,
  onBack,
}: PublicPortfolioStackScreenProps) {
  const endorseMode = useEndorseModeFromLinking();

  return (
    <PublicPortfolioRouteContainer
      playerId={playerId}
      slug={slug}
      previewMode={previewMode}
      previewData={previewData}
      previewLoading={previewLoading}
      endorseMode={endorseMode}
      onBack={onBack}
    />
  );
}
