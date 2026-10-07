import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { PublicPortfolioScreen } from '@/features/public-portfolio/components/PublicPortfolioScreen';
import { useResolvedPlayerId } from '@/features/public-portfolio/hooks/useResolvedPlayerId';
import { type PublicPortfolioData } from '@/features/public-portfolio/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

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
  const { t } = useAppTranslation('portfolio');
  const { resolvedPlayerId, isResolving, resolveError } = useResolvedPlayerId(playerId, slug);

  if (isResolving) {
    return (
      <Screen title={t('footballPassport')} subtitle={t('publicUi.loadingProfile')} safeArea>
        <SkeletonLoader variant="profile" />
      </Screen>
    );
  }

  if (!resolvedPlayerId) {
    return (
      <Screen title={t('footballPassport')} subtitle={t('publicUi.notFound')} safeArea>
        <EmptyState
          title={t('publicUi.notFoundTitle')}
          description={t(`publicUi.resolveError.${resolveError ?? 'not_found'}`)}
          actionLabel={onBack ? t('goBack') : undefined}
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
