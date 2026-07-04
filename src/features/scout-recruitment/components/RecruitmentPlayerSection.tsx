import { View } from 'react-native';
import { Section } from '@/components/layout/Section';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { RecruitmentStageBadge } from '@/features/scout-recruitment/components/RecruitmentStageBadge';
import { RecruitmentEntryActionsModal } from '@/features/scout-recruitment/components/RecruitmentEntryActionsModal';
import { useRecruitment } from '@/features/scout-recruitment/context/RecruitmentProvider';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { useState } from 'react';
import { useTheme } from '@/theme';
import { Kanban } from 'lucide-react-native';

export type RecruitmentPlayerSectionProps = {
  player: DiscoverablePlayer;
};

export function RecruitmentPlayerSection({ player }: RecruitmentPlayerSectionProps) {
  const { colors } = useTheme();
  const { getEntry, isPlayerTracked } = useRecruitment();
  const [actionsVisible, setActionsVisible] = useState(false);

  if (!isPlayerTracked(player.id)) {
    return null;
  }

  const entry = getEntry(player.id);
  if (!entry) {
    return null;
  }

  return (
    <>
      <Section title="Recruitment Pipeline" subtitle="Track this player through your scouting workflow">
        <Card variant="outlined" padding="md" className="gap-3">
          <View className="flex-row items-center gap-2">
            <Kanban size={18} color={colors.accent} />
            <Text weight="semibold">In your pipeline</Text>
          </View>
          <RecruitmentStageBadge stage={entry.stage} />
          <Text variant="body-sm" color="secondary">
            Manage folder placement, shortlists, and stage progression from one place.
          </Text>
          <Button variant="secondary" size="sm" onPress={() => setActionsVisible(true)}>
            Manage recruitment
          </Button>
        </Card>
      </Section>

      <RecruitmentEntryActionsModal
        visible={actionsVisible}
        entry={entry}
        onClose={() => setActionsVisible(false)}
      />
    </>
  );
}
