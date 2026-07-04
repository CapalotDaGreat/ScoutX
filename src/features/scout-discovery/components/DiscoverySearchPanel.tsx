import { Pressable, ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SEARCH_SUGGESTIONS } from '@/features/scout-discovery/constants';
import { Clock, Search } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type DiscoverySearchPanelProps = {
  visible: boolean;
  search: string;
  recentSearches: string[];
  onSelectSearch: (term: string) => void;
  onClearRecent: () => void;
};

export function DiscoverySearchPanel({
  visible,
  search,
  recentSearches,
  onSelectSearch,
  onClearRecent,
}: DiscoverySearchPanelProps) {
  const { colors } = useTheme();

  if (!visible || search.trim().length > 0) {
    return null;
  }

  const suggestions = SEARCH_SUGGESTIONS.filter(
    (item) => !recentSearches.some((recent) => recent.toLowerCase() === item.toLowerCase()),
  ).slice(0, 4);

  return (
    <View className="gap-4 rounded-xl border border-border bg-surface p-3 dark:border-neutral-800 dark:bg-neutral-900">
      {recentSearches.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Clock size={14} color={colors.textSecondary} />
              <Text variant="label" color="secondary">
                Recent searches
              </Text>
            </View>
            <Button variant="link" size="sm" onPress={onClearRecent}>
              Clear
            </Button>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {recentSearches.map((term) => (
                <Button
                  key={term}
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  onPress={() => onSelectSearch(term)}
                >
                  {term}
                </Button>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : null}

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Search size={14} color={colors.textSecondary} />
          <Text variant="label" color="secondary">
            Suggestions
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {suggestions.map((term) => (
            <Pressable
              key={term}
              accessibilityRole="button"
              onPress={() => onSelectSearch(term)}
              className="rounded-full bg-background-secondary px-3 py-2 dark:bg-neutral-950"
            >
              <Text variant="body-sm">{term}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
