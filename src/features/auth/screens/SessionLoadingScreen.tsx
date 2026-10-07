import { Screen } from '@/components/layout/Screen';
import { LoadingScreen } from '@/components/feedback/LoadingScreen';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export function SessionLoadingScreen() {
  const { t } = useAppTranslation('common');
  return (
    <Screen safeArea={false} scrollable={false}>
      <LoadingScreen message={t('preparingSession')} />
    </Screen>
  );
}
