import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/primitives/Button';
import { Input } from '@/components/primitives/Input';
import { Text } from '@/components/primitives/Text';
import {
  answerMemoryQuestion,
  parseMemoryQuery,
  type MemoryAnswer,
  type MemoryKind,
  type MemoryLink,
  type MemoryRecord,
} from '@/features/football-memory/services/footballMemory';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type FootballMemoryScreenProps = {
  index: readonly MemoryRecord[];
  onBack: () => void;
  onOpenLink: (link: MemoryLink) => void;
};

const EXAMPLES = ['bestDefensive', 'goalsSeason', 'latestAnalysis'] as const;

export function FootballMemoryScreen({ index, onBack, onOpenLink }: FootballMemoryScreenProps) {
  const { t, i18n } = useAppTranslation(['common']);
  const [queryText, setQueryText] = useState('');
  const answer = useMemo<MemoryAnswer | null>(
    () => (queryText.trim() ? answerMemoryQuestion(parseMemoryQuery(queryText), index) : null),
    [index, queryText],
  );

  const formatDate = (iso: string | null): string =>
    iso && !Number.isNaN(Date.parse(iso))
      ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
      : '—';

  const describe = (value: MemoryAnswer): string => {
    if (value.status === 'insufficient') return t('common:memory.insufficient');
    switch (value.kind) {
      case 'best_defensive':
        return t('common:memory.answer.bestDefensive', {
          count: value.tackles,
          opponent: value.record.title,
          date: formatDate(value.record.date),
          sample: value.sample,
        });
      case 'best_attacking':
        return t('common:memory.answer.bestAttacking', {
          goals: value.goals,
          assists: value.assists,
          opponent: value.record.title,
          date: formatDate(value.record.date),
        });
      case 'count_stat':
        return value.stat === 'goals'
          ? t('common:memory.answer.countGoals', { count: value.total, matches: value.matches })
          : t('common:memory.answer.countAssists', { count: value.total, matches: value.matches });
      case 'count_records':
      case 'list':
        return t('common:memory.answer.records', { count: value.total });
      case 'latest':
        return t('common:memory.answer.latest', { title: value.record.title, date: formatDate(value.record.date) });
    }
  };

  return (
    <Screen
      title={t('common:memory.title')}
      subtitle={t('common:memory.subtitle')}
      safeArea
      scrollable
      footer={
        <Button variant="secondary" onPress={onBack} fullWidth>
          {t('common:back')}
        </Button>
      }
    >
      <Input
        value={queryText}
        onChangeText={setQueryText}
        placeholder={t('common:memory.placeholder')}
        autoCapitalize="none"
        autoFocus
        accessibilityLabel={t('common:memory.title')}
        returnKeyType="search"
      />
      {!answer ? (
        <View className="mt-4 gap-2">
          <Text variant="label" color="secondary">
            {t('common:memory.examplesTitle')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {EXAMPLES.map((key) => (
              <Button key={key} size="sm" variant="secondary" onPress={() => setQueryText(t(`common:memory.examples.${key}`))}>
                {t(`common:memory.examples.${key}`)}
              </Button>
            ))}
          </View>
          {index.length === 0 ? (
            <Text variant="body-sm" color="secondary">
              {t('common:memory.emptyIndex')}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="mt-4 gap-3">
          <View className="gap-2 border-l-2 border-accent bg-surface px-3 py-3" testID="memory-answer">
            <Text variant="body" weight="semibold" accessibilityLiveRegion="polite">
              {describe(answer)}
            </Text>
            {answer.status === 'answered' ? (
              <Text variant="caption" color="secondary">
                {t('common:memory.groundedNote')}
              </Text>
            ) : null}
          </View>
          {answer.links.map((record) => (
            <Pressable
              key={record.id}
              accessibilityRole="link"
              accessibilityLabel={`${t(`common:memory.kind.${record.kind as MemoryKind}`)}: ${record.title}`}
              onPress={() => onOpenLink(record.link)}
              className="min-h-11 gap-1 border-b border-border py-3 active:opacity-80"
            >
              <Text variant="body" className="font-sans-semibold">
                {record.title}
              </Text>
              <Text variant="caption" color="secondary">
                {t(`common:memory.kind.${record.kind as MemoryKind}`)} · {formatDate(record.date)}
                {record.match
                  ? ` · ${t('common:memory.matchLine', {
                      goals: record.match.goals,
                      assists: record.match.assists,
                      minutes: record.match.minutes,
                    })}`
                  : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
