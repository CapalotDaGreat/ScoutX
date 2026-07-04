import { View } from 'react-native';
import { Pause, Play, Square, MapPin } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { Badge } from '@/components/primitives/Badge';
import { useTheme } from '@/theme';
import { type GpsSessionStatus } from '@/features/gps/types';

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

const statusLabels: Record<GpsSessionStatus, string> = {
  idle: 'Ready',
  recording: 'Recording',
  paused: 'Paused',
  completed: 'Completed',
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
  const isActive = status === 'recording' || status === 'paused';

  return (
    <View className="gap-4">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <MapPin size={18} color={colors.accent} strokeWidth={2} />
          <Text weight="semibold">Match Recording</Text>
        </View>
        <Badge label={statusLabels[status]} variant={statusVariants[status]} />
      </View>

      <Input
        label="Session Label"
        value={matchLabel}
        onChangeText={onMatchLabelChange}
        placeholder="League Match, Training, Trial..."
        editable={!isActive && !isSaving}
      />

      <Text variant="caption" color="secondary">
        {pointCount} GPS points captured · battery-optimized sampling every 5s / 5m
      </Text>

      {status === 'idle' ? (
        <Button variant="accent" onPress={onStart}>
          Start Recording
        </Button>
      ) : null}

      {status === 'recording' ? (
        <View className="flex-row gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            leftIcon={<Pause size={18} color={colors.textPrimary} strokeWidth={2} />}
            onPress={onPause}
          >
            Pause
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            leftIcon={<Square size={18} color={colors.primaryForeground} strokeWidth={2} />}
            loading={isSaving}
            onPress={onStop}
          >
            Finish
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
            Resume Recording
          </Button>
          <View className="flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={onDiscard}>
              Discard
            </Button>
            <Button variant="primary" className="flex-1" loading={isSaving} onPress={onStop}>
              Finish
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}
