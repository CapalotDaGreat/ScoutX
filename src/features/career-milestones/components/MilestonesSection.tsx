import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type MilestoneDefinition } from '@/features/career-milestones/types';

export type MilestonesSectionProps = {
  earned: MilestoneDefinition[];
  recentlyEarned?: MilestoneDefinition[];
};

function MilestoneBadge({ milestone }: { milestone: MilestoneDefinition }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-xl border border-border bg-neutral-50 p-3">
      <Text className="text-xl">{milestone.icon}</Text>
      <Text weight="semibold" className="mt-1 text-sm">
        {milestone.title}
      </Text>
      <Text variant="caption" color="secondary">
        {milestone.description}
      </Text>
    </View>
  );
}

export function MilestonesSection({ earned, recentlyEarned = [] }: MilestonesSectionProps) {
  const recentIds = new Set(recentlyEarned.map((item) => item.id));

  return (
    <Card variant="outlined" padding="md" className="gap-3">
      <View>
        <Text variant="overline" color="secondary">
          Professional milestones
        </Text>
        <Text weight="semibold">Career achievements unlocked</Text>
        <Text variant="caption" color="secondary">
          {earned.length} milestone{earned.length === 1 ? '' : 's'} earned
        </Text>
      </View>

      {recentlyEarned.length > 0 ? (
        <View className="rounded-xl border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
          <Text weight="semibold" className="text-green-800">
            New milestone{recentlyEarned.length === 1 ? '' : 's'} unlocked
          </Text>
          {recentlyEarned.map((milestone) => (
            <Text key={milestone.id} variant="body-sm" className="text-green-700">
              {milestone.icon} {milestone.title}
            </Text>
          ))}
        </View>
      ) : null}

      {earned.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          Log matches, publish your Football Passport, and collect coach endorsements to unlock
          milestones automatically.
        </Text>
      ) : (
        <View className="flex-row flex-wrap gap-3">
          {earned.map((milestone) => (
            <View
              key={milestone.id}
              className={recentIds.has(milestone.id) ? 'opacity-100' : 'opacity-90'}
            >
              <MilestoneBadge milestone={milestone} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
