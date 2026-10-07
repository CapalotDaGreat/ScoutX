import { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Modal } from '@/components/feedback/Modal';
import { SearchBar } from '@/components/primitives/SearchBar';
import { Text } from '@/components/primitives/Text';
import { formatRating, joinKnown } from '@/features/scout-discovery/models/DiscoverablePlayerModel';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ComparisonPlayerPickerModalProps = {
  visible: boolean;
  title: string;
  players: DiscoverablePlayer[];
  excludedIds: string[];
  onClose: () => void;
  onSelect: (player: DiscoverablePlayer) => void;
};

export function ComparisonPlayerPickerModal({
  visible,
  title,
  players,
  excludedIds,
  onClose,
  onSelect,
}: ComparisonPlayerPickerModalProps) {
  const { t } = useAppTranslation('scout');
  const [search, setSearch] = useState('');

  const availablePlayers = useMemo(() => {
    const excluded = new Set(excludedIds);
    const pool = players.filter((player) => !excluded.has(player.id));
    if (!search.trim()) {
      return pool;
    }
    const query = search.trim().toLowerCase();
    return pool.filter((player) =>
      player.searchKeywords.some((keyword) => keyword.includes(query)),
    );
  }, [excludedIds, players, search]);

  return (
    <Modal visible={visible} onClose={onClose} title={title} size="lg">
      <View className="gap-4">
        <SearchBar
          value={search}
          onChangeText={setSearch}
          onClear={() => setSearch('')}
          placeholder={t('comparisonUi.searchPlayers')}
        />

        <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
          {availablePlayers.length === 0 ? (
            <Text variant="body-sm" color="secondary" className="py-6 text-center">
              {t('comparisonUi.noPlayersToAdd')}
            </Text>
          ) : (
            availablePlayers.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={t('comparisonUi.addNamed', { name: item.fullName })}
                onPress={() => {
                  onSelect(item);
                  setSearch('');
                }}
                className="mb-2 flex-row items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <Image source={{ uri: item.avatarUrl }} className="h-11 w-11 rounded-full" />
                <View className="flex-1">
                  <Text weight="semibold">{item.fullName}</Text>
                  <Text variant="caption" color="secondary">
                    {joinKnown([
                      item.club,
                      item.overallRating !== null
                        ? t('comparisonUi.overallShort', { value: formatRating(item.overallRating) })
                        : null,
                    ])}
                  </Text>
                </View>
              </Pressable>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}
