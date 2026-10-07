import { View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { Button } from '@/components/primitives/Button';
import { type MilestoneDefinition } from '@/features/career-milestones/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useState } from 'react';

const MILESTONE_IDS = [
  'first_match',
  'ten_matches',
  'first_highlight',
  'passport_live',
  'username_claimed',
  'discoverable',
  'first_endorsement',
  'first_scout_view',
  'portfolio_strong',
] as const;

type MilestoneId = (typeof MILESTONE_IDS)[number];

function isMilestoneId(value: string): value is MilestoneId {
  return (MILESTONE_IDS as readonly string[]).includes(value);
}

function useMilestoneCopy() {
  const { t } = useAppTranslation('career');
  return (milestone: MilestoneDefinition) =>
    isMilestoneId(milestone.id)
      ? {
          title: t(`milestone.${milestone.id}.title`),
          description: t(`milestone.${milestone.id}.description`),
        }
      : { title: milestone.title, description: milestone.description };
}

export type MilestonesSectionProps = {
  earned: MilestoneDefinition[];
  recentlyEarned?: MilestoneDefinition[];
  previewCount?: number;
};

function MilestoneBadge({ milestone, prestige }: { milestone: MilestoneDefinition; prestige?: boolean }) {
  const copy = useMilestoneCopy()(milestone);
  return (
    <View
      className={`min-w-[46%] flex-1 rounded-xl border p-3 ${
        prestige
          ? 'border-gold/40 bg-gold-muted'
          : 'border-border bg-background-secondary'
      }`}
    >
      <Text className="text-xl" accessibilityElementsHidden importantForAccessibility="no">
        {milestone.icon}
      </Text>
      <Text weight="medium" className="mt-1 text-sm">
        {copy.title}
      </Text>
      <Text variant="caption" color="secondary">
        {copy.description}
      </Text>
    </View>
  );
}

export function MilestonesSection({
  earned,
  recentlyEarned = [],
  previewCount = 4,
}: MilestonesSectionProps) {
  const { t } = useAppTranslation(['career', 'common']);
  const milestoneCopy = useMilestoneCopy();
  const [expanded, setExpanded] = useState(false);
  const recentIds = new Set(recentlyEarned.map((item) => item.id));
  const visible = expanded ? earned : earned.slice(0, previewCount);
  const remaining = earned.length - previewCount;

  return (
    <Card variant="outlined" padding="md" className="gap-4">
      <View>
        <Text variant="overline" color="secondary">
          {t('career:milestoneUi.overline')}
        </Text>
        <Text weight="semibold">{t('career:milestoneUi.title')}</Text>
        <Text variant="caption" color="secondary">
          {t('career:milestoneUi.earned', { count: earned.length })}
        </Text>
      </View>

      {recentlyEarned.length > 0 ? (
        <View className="rounded-xl border border-gold/40 bg-gold-muted p-3">
          <Text weight="semibold" color="prestige">
            {t('career:milestoneUi.new', { count: recentlyEarned.length })}
          </Text>
          {recentlyEarned.map((milestone) => (
            <Text key={milestone.id} variant="body-sm" color="prestige">
              {milestone.icon} {milestoneCopy(milestone).title}
            </Text>
          ))}
        </View>
      ) : null}

      {earned.length === 0 ? (
        <Text variant="body-sm" color="secondary">
          {t('career:milestoneUi.empty')}
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
              {expanded ? t('common:showLess') : t('career:milestoneUi.seeMore', { count: remaining })}
            </Button>
          ) : null}
        </>
      )}
    </Card>
  );
}
