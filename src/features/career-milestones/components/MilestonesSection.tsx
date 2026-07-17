import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { type MilestoneDefinition } from '@/features/career-milestones/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useState } from 'react';

export type MilestonesSectionProps = {
  earned: MilestoneDefinition[];
  recentlyEarned?: MilestoneDefinition[];
  previewCount?: number;
};

function MilestoneBadge({ milestone, prestige }: { milestone: MilestoneDefinition; prestige?: boolean }) {
  return (
    <View
      className={`min-w-[46%] flex-1 rounded-xl border p-3 ${
        prestige
          ? 'border-gold/40 bg-gold-muted'
          : 'border-border bg-background-secondary'
      }`}
    >
      <Text className="text-xl">{milestone.icon}</Text>
      <Text weight="medium" className="mt-1 text-sm">
        {milestone.title}
      </Text>
      <Text variant="caption" color="secondary">
        {milestone.description}
      </Text>
    </View>
  );
}

export function MilestonesSection({
  earned,
  recentlyEarned = [],
  previewCount = 4,
}: MilestonesSectionProps) {
  const { t } = useAppTranslation('common');
  const [expanded, setExpanded] = useState(false);
  const recentIds = new Set(recentlyEarned.map((item) => item.id));
  const visible = expanded ? earned : earned.slice(0, previewCount);
  const remaining = earned.length - previewCount;

  return (
    <Card variant="outlined" padding="md" className="gap-4">
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
        <View className="rounded-xl border border-gold/40 bg-gold-muted p-3">
          <Text weight="semibold" color="prestige">
            New milestone{recentlyEarned.length === 1 ? '' : 's'} unlocked
          </Text>
          {recentlyEarned.map((milestone) => (
            <Text key={milestone.id} variant="body-sm" color="prestige">
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
        <>
          <View className="flex-row flex-wrap gap-3">
            {visible.map((milestone) => (
              <View
                key={milestone.id}
                className={recentIds.has(milestone.id) ? 'opacity-100' : 'opacity-90'}
              >
                <MilestoneBadge milestone={milestone} prestige={recentIds.has(milestone.id)} />
              </View>
            ))}
          </View>
          {remaining > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onPress={() => setExpanded((current) => !current)}
              className="self-start"
            >
              {expanded ? 'Show less' : `${t('seeMore')} · ${remaining}`}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}
