import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { EmptyState } from '@/components/feedback/EmptyState';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import { searchOwnedRecords, type SearchHit } from '@/features/global-search/services/searchIndex';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type GlobalSearchScreenProps = {
  records: SearchHit[];
  onBack: () => void;
  onOpenHit: (hit: SearchHit) => void;
};

export function GlobalSearchScreen({ records, onBack, onOpenHit }: GlobalSearchScreenProps) {
  const { t } = useAppTranslation(['common']);
  const [queryText, setQueryText] = useState('');
  const hits = useMemo(() => searchOwnedRecords(queryText, records), [queryText, records]);

  return (
    <Screen
      title={t('common:search')}
      subtitle={t('common:searchOwnedHint')}
      safeArea
      footer={
        <Button variant="secondary" onPress={onBack} fullWidth>
          {t('common:back')}
        </Button>
      }
    >
      <Input
        value={queryText}
        onChangeText={setQueryText}
        placeholder={t('common:searchOwnedPlaceholder')}
        autoCapitalize="none"
        autoFocus
        accessibilityLabel={t('common:search')}
      />
      {queryText.trim() && hits.length === 0 ? (
        <EmptyState title={t('common:searchEmpty')} description={t('common:searchEmptyHint')} />
      ) : (
        <View className="mt-4 gap-2">
          {hits.map((hit) => (
            <Pressable
              key={hit.id}
              accessibilityRole="button"
              accessibilityLabel={hit.title}
              onPress={() => onOpenHit(hit)}
              className="min-h-11 rounded-xl border border-border bg-surface px-4 py-3"
            >
              <Text variant="body" className="font-sans-semibold">
                {hit.title}
              </Text>
              {hit.subtitle ? (
                <Text variant="caption" color="secondary">
                  {hit.kind} · {hit.subtitle}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
