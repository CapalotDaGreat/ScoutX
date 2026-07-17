import { View } from 'react-native';
import { Route } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { useTheme } from '@/theme';
import { FootballJourneyTimeline } from '@/features/football-journey/components/FootballJourneyTimeline';
import { JourneyTimelineSkeleton } from '@/features/football-journey/components/JourneyTimelineSkeleton';
import { ProfileSection } from '@/features/player-profile/components/identity/ProfileSection';
import { type JourneyEntry } from '@/features/football-journey/types';

export type FootballJourneySectionProps = {
  entries: JourneyEntry[];
  loading?: boolean;
  editable?: boolean;
  onEditPress?: () => void;
};

export function FootballJourneySection({
  entries,
  loading = false,
  editable = false,
  onEditPress,
}: FootballJourneySectionProps) {
  const { colors } = useTheme();

  const action =
    editable && onEditPress ? (
      <Button variant="secondary" size="sm" onPress={onEditPress}>
        Manage
      </Button>
    ) : undefined;

  return (
    <ProfileSection
      title="Football Journey"
      subtitle="The story of your career — academies, transfers, milestones, and moments scouts remember"
      action={action}
      variant="outlined"
      className="border-accent/20"
    >
      <View className="mb-2 flex-row items-center gap-2 rounded-lg bg-accent-muted/50 px-3 py-2">
        <Route size={16} color={colors.accent} />
        <Text variant="caption" color="accent" className="flex-1">
          {entries.length} milestone{entries.length === 1 ? '' : 's'} on your timeline
        </Text>
      </View>

      {loading ? <JourneyTimelineSkeleton /> : <FootballJourneyTimeline entries={entries} />}
    </ProfileSection>
  );
}
