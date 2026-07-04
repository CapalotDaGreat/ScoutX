import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/primitives/Text';
import { type RecruitmentShortlist } from '@/features/scout-recruitment/types';
import { cn } from '@/utils/cn';
import { ListPlus } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type RecruitmentShortlistBarProps = {
  shortlists: RecruitmentShortlist[];
  activeShortlistId: string | null;
  onSelectShortlist: (shortlistId: string | null) => void;
  onCreateShortlist: () => void;
};

export function RecruitmentShortlistBar({
  shortlists,
  activeShortlistId,
  onSelectShortlist,
  onCreateShortlist,
}: RecruitmentShortlistBarProps) {
  const { colors } = useTheme();

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-4">
        <Text variant="overline" color="secondary">
          Shortlists
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create shortlist"
          onPress={onCreateShortlist}
          className="flex-row items-center gap-1 rounded-full border border-border px-2.5 py-1 dark:border-neutral-700"
        >
          <ListPlus size={14} color={colors.accent} />
          <Text variant="caption" className="font-sans-semibold text-accent dark:text-green-400">
            New
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => onSelectShortlist(null)}
          className={cn(
            'rounded-full border px-3 py-2',
            activeShortlistId === null
              ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
              : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
          )}
        >
          <Text
            variant="caption"
            className={cn(
              'font-sans-semibold',
              activeShortlistId === null
                ? 'text-accent dark:text-green-400'
                : 'text-foreground-secondary',
            )}
          >
            All Shortlists
          </Text>
        </Pressable>

        {shortlists.map((shortlist) => {
          const isActive = activeShortlistId === shortlist.id;
          return (
            <Pressable
              key={shortlist.id}
              accessibilityRole="button"
              onPress={() => onSelectShortlist(shortlist.id)}
              className={cn(
                'rounded-full border px-3 py-2',
                isActive
                  ? 'border-accent bg-accent-muted dark:border-green-500 dark:bg-green-950'
                  : 'border-border bg-surface dark:border-neutral-700 dark:bg-neutral-900',
              )}
            >
              <Text
                variant="caption"
                className={cn(
                  'font-sans-semibold',
                  isActive ? 'text-accent dark:text-green-400' : 'text-foreground-secondary',
                )}
              >
                {shortlist.name} ({shortlist.playerIds.length})
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
