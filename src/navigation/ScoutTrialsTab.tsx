import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabSegmentControl } from '@/components/navigation/TabSegmentControl';
import { ScoutTrialsInboxScreen } from '@/features/trial-invitations/components/ScoutTrialsInboxScreen';
import { ScoutReportsInboxScreen } from '@/features/scouting-reports/components/ScoutReportsInboxScreen';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type TrialsSegment = 'trials' | 'reports';

export type ScoutTrialsTabProps = {
  onPlayerPress: (playerId: string) => void;
  onSettingsPress?: () => void;
  focusTrialId?: string;
};

export function ScoutTrialsTab({ onPlayerPress, onSettingsPress, focusTrialId }: ScoutTrialsTabProps) {
  const { t } = useAppTranslation('navigation');
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<TrialsSegment>('trials');

  const segments = useMemo(
    () => [
      { id: 'trials' as const, label: t('segments.trials') },
      { id: 'reports' as const, label: t('segments.reports') },
    ],
    [t],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabSegmentControl
        segments={segments}
        activeSegment={segment}
        onSegmentChange={setSegment}
        testID="scout-trials-segments"
      />
      {segment === 'trials' ? (
        <ScoutTrialsInboxScreen
          onPlayerPress={onPlayerPress}
          onSettingsPress={onSettingsPress}
          focusTrialId={focusTrialId}
          nestedUnderSegment
        />
      ) : (
        <ScoutReportsInboxScreen
          onPlayerPress={onPlayerPress}
          onSettingsPress={onSettingsPress}
          nestedUnderSegment
        />
      )}
    </View>
  );
}
