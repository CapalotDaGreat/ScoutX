import { Pressable, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { Badge } from '@/components/primitives/Badge';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { ScoutingReportRatingsGrid } from '@/features/scouting-reports/components/ScoutingReportRatingsGrid';
import { type ScoutingReport } from '@/features/scouting-reports/types';
import { CalendarDays, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type ScoutingReportCardProps = {
  report: ScoutingReport;
  index?: number;
  onPress?: (report: ScoutingReport) => void;
};

export function ScoutingReportCard({ report, index = 0, onPress }: ScoutingReportCardProps) {
  const { colors } = useTheme();
  const updatedLabel = new Date(report.updatedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const content = (
    <Card variant="outlined" padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <Text variant="overline" color="accent">
            Scouting Report
          </Text>
          <Text weight="semibold">{report.playerName}</Text>
          {report.scoutName ? (
            <Text variant="caption" color="secondary">
              by {report.scoutName}
            </Text>
          ) : null}
        </View>
        {onPress ? <ChevronRight size={18} color={colors.textSecondary} /> : null}
      </View>

      <ScoutingReportRatingsGrid ratings={report.ratings} compact />

      {report.strengths.length > 0 ? (
        <View className="gap-1">
          <Text variant="caption" color="secondary">
            Strengths
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {report.strengths.slice(0, 3).map((strength) => (
              <Badge key={strength} label={strength} variant="success" size="sm" />
            ))}
          </View>
        </View>
      ) : null}

      {report.recommendations ? (
        <Text variant="body-sm" color="secondary" numberOfLines={2}>
          {report.recommendations}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap items-center gap-2">
        {report.suggestedFormation ? (
          <Badge label={report.suggestedFormation} variant="outline" size="sm" />
        ) : null}
        {report.suitablePlayingStyle ? (
          <Badge label={report.suitablePlayingStyle} variant="info" size="sm" />
        ) : null}
        <View className="ml-auto flex-row items-center gap-1">
          <CalendarDays size={12} color={colors.textSecondary} />
          <Text variant="caption" color="secondary">
            {updatedLabel}
          </Text>
        </View>
      </View>
    </Card>
  );

  if (!onPress) {
    return (
      <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(320)}>
        {content}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInUp.delay(Math.min(index, 6) * 40).duration(320)}>
      <Pressable onPress={() => onPress(report)} className="active:opacity-90">
        {content}
      </Pressable>
    </Animated.View>
  );
}
