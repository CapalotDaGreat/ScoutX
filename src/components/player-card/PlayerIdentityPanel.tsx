import { View } from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Text } from '@/components/primitives/Text';
import { PlayerCardImage } from './PlayerCardImage';
import { playerInitials } from './playerCardPresentation';
import { useTheme } from '@/theme';

type Props = {
  playerId: string;
  name: string;
  portrait: string;
  position: string | null;
  context: string;
  facts?: string;
  verified?: boolean;
  expanded?: boolean;
};

/** Explicit identity fields only; the caller controls the public/private boundary. */
export function PlayerIdentityPanel({ playerId, name, portrait, position, context, facts, verified = false, expanded = false }: Props) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-4">
      <PlayerCardImage playerId={playerId} uri={portrait}
        className={expanded ? 'h-36 w-28 shrink-0 overflow-hidden rounded-md bg-background-secondary' : 'h-28 w-20 shrink-0 overflow-hidden rounded-md bg-background-secondary'}
        fallback={<View className="h-full w-full items-center justify-center border-b-4 border-accent">
          <Text weight="bold" color="secondary" style={{ fontSize: expanded ? 32 : 26, lineHeight: expanded ? 40 : 34 }}>{playerInitials(name)}</Text>
        </View>} />
      <View className="min-w-0 flex-1 gap-1.5">
        {position ? <Text variant="caption" color="accent" weight="bold">{position}</Text> : null}
        <View className="flex-row items-center gap-2">
          <Text accessibilityRole={expanded ? 'header' : undefined} weight="bold" numberOfLines={expanded ? 3 : 2} className="min-w-0 flex-1" style={{ fontSize: expanded ? 26 : 20, lineHeight: expanded ? 32 : 26 }}>
            {name.trim() || playerInitials(name)}
          </Text>
          {verified ? <CheckCircle2 size={18} color={colors.verification} accessibilityElementsHidden /> : null}
        </View>
        {context ? <Text variant="body-sm" color="secondary" numberOfLines={2}>{context}</Text> : null}
        {facts ? <Text variant="caption" color="tertiary" numberOfLines={2}>{facts}</Text> : null}
      </View>
    </View>
  );
}
