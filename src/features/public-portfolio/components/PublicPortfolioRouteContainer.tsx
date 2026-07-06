import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { PublicPortfolioScreen } from '@/features/public-portfolio/components/PublicPortfolioScreen';
import { useResolvedPlayerId } from '@/features/public-portfolio/hooks/useResolvedPlayerId';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';

export type PublicPortfolioRouteContainerProps = {
  playerId?: string;
  slug?: string;
  previewMode?: boolean;
  previewData?: PublicPortfolioData;
  previewLoading?: boolean;
  endorseMode?: boolean;
  onSignInForEndorsement?: () => void;
  onRegisterForEndorsement?: () => void;
  onBack?: () => void;
};

export function PublicPortfolioRouteContainer({
  playerId,
  slug,
  previewMode = false,
  previewData,
  previewLoading = false,
  endorseMode = false,
  onSignInForEndorsement,
  onRegisterForEndorsement,
  onBack,
}: PublicPortfolioRouteContainerProps) {
  const { resolvedPlayerId, isResolving, resolveError } = useResolvedPlayerId(playerId, slug);

  if (isResolving) {
    return (
      <Screen title="Football Passport" subtitle="Loading profile" safeArea>
        <SkeletonLoader variant="profile" />
      </Screen>
    );
  }

  if (!resolvedPlayerId) {
    return (
      <Screen title="Football Passport" subtitle="Not found" safeArea>
        <EmptyState
          title="Passport not found"
          description={resolveError ?? 'This Football Passport does not exist or is private.'}
          actionLabel={onBack ? 'Go back' : undefined}
          onAction={onBack}
        />
      </Screen>
    );
  }

  return (
    <PublicPortfolioScreen
      playerId={resolvedPlayerId}
      slug={slug}
      previewMode={previewMode}
      previewData={previewData}
      previewLoading={previewLoading}
      endorseMode={endorseMode}
      onSignInForEndorsement={onSignInForEndorsement}
      onRegisterForEndorsement={onRegisterForEndorsement}
      onBack={onBack}
    />
  );
}
