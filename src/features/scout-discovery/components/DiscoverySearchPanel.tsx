import { Pressable, ScrollView, View } from 'react-native';
import { Button } from '@/components/primitives/Button';
import { Text } from '@/components/primitives/Text';
import { SEARCH_SUGGESTIONS } from '@/features/scout-discovery/constants';
import {
  type DiscoverySearchScope,
  type RecentSearchEntry,
} from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { Clock, Search } from 'lucide-react-native';
import { useTheme } from '@/theme';

export type DiscoverySearchPanelProps = {
  visible: boolean;
  search: string;
  searchScope: DiscoverySearchScope;
  recentSearches: RecentSearchEntry[];
  onSelectSearch: (term: string, scope?: DiscoverySearchScope) => void;
  onClearRecent: () => void;
};

function scopeLabel(
  t: ReturnType<typeof useAppTranslation>['t'],
  scope: DiscoverySearchScope,
): string {
  switch (scope) {
    case 'name':
      return t('scout:search.scopeName');
    case 'club':
      return t('scout:search.scopeClub');
    case 'position':
      return t('scout:search.scopePosition');
    case 'nationality':
      return t('scout:search.scopeNationality');
    case 'league':
      return t('scout:search.scopeLeague');
    case 'all':
    default:
      return t('scout:search.scopeAll');
  }
}

export function DiscoverySearchPanel({
  visible,
  search,
  searchScope,
  recentSearches,
  onSelectSearch,
  onClearRecent,
}: DiscoverySearchPanelProps) {
  const { t } = useAppTranslation(['scout', 'common']);
  const { colors } = useTheme();

  if (!visible || search.trim().length > 0) {
    return null;
  }

  const suggestions = SEARCH_SUGGESTIONS.filter(
    (item) =>
      !recentSearches.some((recent) => recent.term.toLowerCase() === item.toLowerCase()),
  ).slice(0, 4);

  return (
    <View className="gap-4 rounded-xl border border-border bg-surface-cool p-3">
      {recentSearches.length > 0 ? (
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Clock size={14} color={colors.textSecondary} />
              <Text variant="label" color="secondary">
                {t('scout:search.recentSearches')}
              </Text>
            </View>
            <Button variant="link" size="sm" onPress={onClearRecent}>
              {t('common:clear')}
            </Button>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2 pr-2">
              {recentSearches.map((entry) => (
                <Pressable
                  key={`${entry.scope}:${entry.term}:${entry.searchedAt}`}
                  accessibilityRole="button"
                  onPress={() => onSelectSearch(entry.term, entry.scope)}
                  className="rounded-full border border-border bg-background px-3 py-2"
                >
                  <Text variant="body-sm">{entry.term}</Text>
                  {entry.scope !== 'all' ? (
                    <Text variant="caption" color="secondary" className="mt-0.5">
                      {scopeLabel(t, entry.scope)}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <Clock size={14} color={colors.textSecondary} />
          <Text variant="body-sm" color="secondary">
            {t('scout:search.noRecentSearches')}
          </Text>
        </View>
      )}

      <View className="gap-2">
        <View className="flex-row items-center gap-2">
          <Search size={14} color={colors.textSecondary} />
          <Text variant="label" color="secondary">
            {t('scout:search.suggestions')}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {suggestions.map((term) => (
            <Pressable
              key={term}
              accessibilityRole="button"
              onPress={() => onSelectSearch(term, searchScope)}
              className="rounded-full bg-background-secondary px-3 py-2"
            >
              <Text variant="body-sm">{term}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}
