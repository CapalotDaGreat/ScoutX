import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ProgressBar } from '@/components/primitives/ProgressBar';
import { Text } from '@/components/primitives/Text';
import { DataRightsRepository } from '@/features/data-rights/repositories/DataRightsRepository';
import { deletionFraction, type DeletionProgress } from '@/features/data-rights/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

/** Live progress of a running account deletion (the server owns every step). */
export function DeletionProgressCard({ uid }: { uid: string }) {
  const { t } = useAppTranslation(['legal']);
  const [progress, setProgress] = useState<DeletionProgress | null>(null);

  useEffect(() => DataRightsRepository.subscribeDeletion(uid, setProgress), [uid]);

  const step = progress?.step ?? 'requested';
  const percent = Math.round(deletionFraction(step) * 100);
  return (
    <View className="gap-2" testID="deletion-progress">
      <Text variant="label">{t(`legal:dataRights.deletion.steps.${step}`)}</Text>
      <ProgressBar value={percent} accessibilityLabel={t('legal:dataRights.deletion.progressLabel', { percent })} />
      <Text variant="caption" color="secondary">
        {progress?.status === 'failed' ? t('legal:dataRights.deletion.retry') : t('legal:dataRights.deletion.keepOpen')}
      </Text>
    </View>
  );
}
