import { useMemo } from 'react';
import { View } from 'react-native';
import { ComparisonPlayerSlot } from '@/features/player-comparison/components/ComparisonPlayerSlot';
import { MAX_COMPARISON_PLAYERS } from '@/features/player-comparison/constants';
import { type DiscoverablePlayer } from '@/features/scout-discovery/types';

export type ComparisonPlayerStripProps = {
  players: DiscoverablePlayer[];
  onAddPlayer: () => void;
  onRemovePlayer: (playerId: string) => void;
  onReplacePlayer: (playerId: string) => void;
};

export function ComparisonPlayerStrip({
  players,
  onAddPlayer,
  onRemovePlayer,
  onReplacePlayer,
}: ComparisonPlayerStripProps) {
  const slots = useMemo(() => {
    return Array.from({ length: MAX_COMPARISON_PLAYERS }, (_, index) => players[index]);
  }, [players]);

  return (
    <View className="gap-2">
      <View className="flex-row gap-2">
        {slots.slice(0, 2).map((player, index) => (
          <ComparisonPlayerSlot
            key={player?.id ?? `empty-${index}`}
            player={player}
            slotIndex={index}
            onAdd={players.length < MAX_COMPARISON_PLAYERS ? onAddPlayer : undefined}
            onRemove={player ? () => onRemovePlayer(player.id) : undefined}
            onReplace={player ? () => onReplacePlayer(player.id) : undefined}
          />
        ))}
      </View>
      <View className="flex-row gap-2">
        {slots.slice(2, 4).map((player, index) => (
          <ComparisonPlayerSlot
            key={player?.id ?? `empty-${index + 2}`}
            player={player}
            slotIndex={index + 2}
            onAdd={players.length < MAX_COMPARISON_PLAYERS ? onAddPlayer : undefined}
            onRemove={player ? () => onRemovePlayer(player.id) : undefined}
            onReplace={player ? () => onReplacePlayer(player.id) : undefined}
          />
        ))}
      </View>
    </View>
  );
}
