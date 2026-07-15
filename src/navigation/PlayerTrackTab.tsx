import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabSegmentControl } from '@/components/navigation/TabSegmentControl';
import { GpsTrackingScreen } from '@/features/gps';
import { PlayerTrialsScreen } from '@/features/trial-invitations';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type TrackSegment = 'gps' | 'trials';

export function PlayerTrackTab() {
  const { t } = useAppTranslation('navigation');
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [segment, setSegment] = useState<TrackSegment>('gps');

  const segments = useMemo(
    () => [
      { id: 'gps' as const, label: t('segments.gps') },
      { id: 'trials' as const, label: t('segments.trials') },
    ],
    [t],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabSegmentControl
        segments={segments}
        activeSegment={segment}
        onSegmentChange={setSegment}
        testID="player-track-segments"
      />
      {segment === 'gps' ? (
        <GpsTrackingScreen playerId={user?.id ?? null} embeddedInTabShell nestedUnderSegment />
      ) : (
        <PlayerTrialsScreen embeddedInTabShell nestedUnderSegment />
      )}
    </View>
  );
}
