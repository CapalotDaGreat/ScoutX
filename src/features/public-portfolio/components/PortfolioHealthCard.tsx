import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { Badge } from '@/components/primitives/Badge';
import {
  type PortfolioHealthReport,
  type ScoutReadinessReport,
} from '@/features/public-portfolio/services/portfolioHealthService';

function ProgressBar({ value }: { value: number }) {
  return (
    <View className="h-2 overflow-hidden rounded-full bg-background-secondary dark:bg-neutral-800">
      <View className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value)}%` }} />
    </View>
  );
}

export function PortfolioHealthCard({ report }: { report: PortfolioHealthReport }) {
  const incomplete = report.items.filter((item) => !item.complete).slice(0, 4);

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="overline" color="secondary">
            Portfolio strength
          </Text>
          <Text weight="semibold" className="text-xl">
            {report.score} / 100
          </Text>
          <Text variant="caption" color="secondary">
            Grade {report.grade} · {report.completionPercent}% complete
          </Text>
        </View>
        <Badge variant="accent" label={`Grade ${report.grade}`} />
      </View>
      <ProgressBar value={report.score} />
      {incomplete.length > 0 ? (
        <View className="gap-2">
          <Text variant="caption" color="secondary">
            Improve next
          </Text>
          {incomplete.map((item) => (
            <Text key={item.id} variant="body-sm">
              • {item.hint}
            </Text>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function ScoutReadinessCard({ report }: { report: ScoutReadinessReport }) {
  const incomplete = report.items.filter((item) => !item.complete);

  return (
    <Card variant="default" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          Scout readiness
        </Text>
        <Text weight="semibold" className="text-xl">
          {report.score}%
        </Text>
        <Text variant="caption" color="secondary">
          Actionable checklist before scouts evaluate you
        </Text>
      </View>
      <ProgressBar value={report.score} />
      <View className="gap-2">
        {report.items.map((item) => (
          <View key={item.id} className="flex-row items-start gap-2">
            <Text variant="body-sm">{item.complete ? '✔' : '○'}</Text>
            <View className="flex-1">
              <Text variant="body-sm" weight={item.complete ? 'regular' : 'semibold'}>
                {item.label}
              </Text>
              {!item.complete ? (
                <Text variant="caption" color="secondary">
                  {item.hint}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      {incomplete.length === 0 ? (
        <Text variant="body-sm" color="accent">
          Your passport is scout-ready.
        </Text>
      ) : null}
    </Card>
  );
}
