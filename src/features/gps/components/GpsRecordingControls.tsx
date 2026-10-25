import { View } from 'react-native';
import { Pause, Play, Square, MapPin } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { Badge } from '@/components/primitives/Badge';
import { useTheme } from '@/theme';
import { type GpsSessionStatus } from '@/features/gps/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GpsRecordingControlsProps = {
  status: GpsSessionStatus;
  matchLabel: string;
  pointCount: number;
  isSaving: boolean;
  onMatchLabelChange: (value: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDiscard: () => void;
};

const statusVariants: Record<GpsSessionStatus, 'default' | 'accent' | 'warning' | 'success'> = {
  idle: 'default',
  recording: 'accent',
  paused: 'warning',
  completed: 'success',
};

export function GpsRecordingControls({
  status,
  matchLabel,
  pointCount,
  isSaving,
  onMatchLabelChange,
  onStart,
  onPause,
  onResume,
  onStop,
  onDiscard,
}: GpsRecordingControlsProps) {
  const { colors } = useTheme();
  const { t } = useAppTranslation(['gps', 'common']);
  const isActive = status === 'recording' || status === 'paused';

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <View className="min-w-0 flex-row items-center gap-2">
          <MapPin size={18} color={colors.accent} strokeWidth={2} />
          <Text weight="semibold" className="shrink">{t('gps:controls.title')}</Text>
        </View>
        <Badge label={t(`gps:controls.status.${status}`)} variant={statusVariants[status]} />
      </View>

      <Input
        label={t('gps:controls.label')}
        value={matchLabel}
        onChangeText={onMatchLabelChange}
        placeholder={t('gps:controls.labelPlaceholder')}
        editable={!isActive && !isSaving}
      />

      <Text variant="caption" color="secondary">
        {t('gps:controls.points', { count: pointCount })}
      </Text>

      {status === 'idle' ? (
        <Button variant="accent" onPress={onStart}>
          {t('gps:startRecording')}
        </Button>
      ) : null}

      {status === 'recording' ? (
        <View className="gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<Pause size={18} color={colors.textPrimary} strokeWidth={2} />}
            onPress={onPause}
          >
            {t('gps:pauseRecording')}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            leftIcon={<Square size={18} color={colors.primaryForeground} strokeWidth={2} />}
            loading={isSaving}
            onPress={onStop}
          >
            {t('gps:controls.finish')}
          </Button>
        </View>
      ) : null}

      {status === 'paused' ? (
        <View className="gap-3">
          <Button
            variant="accent"
            leftIcon={<Play size={18} color={colors.accentForeground} strokeWidth={2} />}
            onPress={onResume}
          >
            {t('gps:resumeRecording')}
          </Button>
          <View className="gap-2">
            <Button variant="secondary" className="flex-1" onPress={onDiscard}>
              {t('gps:controls.discard')}
            </Button>
            <Button variant="primary" className="flex-1" loading={isSaving} onPress={onStop}>
              {t('gps:controls.finish')}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
