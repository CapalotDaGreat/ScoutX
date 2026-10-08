import { View } from 'react-native';
import { ExternalLink } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { type ExternalFootballSource } from '@/features/football-sources/core';
import { openExternalFootballSource } from '@/features/football-sources/services/footballSourceService';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

/** Sources the player linked to one match. Opening one leaves the app; nothing is loaded in it. */
export function MatchSourceChips({ sources, matchId }: { sources: ExternalFootballSource[]; matchId: string }) {
  const { t } = useAppTranslation('passport');
  const { colors } = useTheme();
  const linked = sources.filter((source) => source.status === 'active' && source.matchIds.includes(matchId));
  if (linked.length === 0) return null;
  return (
    <View className="mt-3 flex-row flex-wrap gap-2">
      {linked.map((source) => (
        <Button
          key={source.id}
          size="sm"
          variant="ghost"
          leftIcon={<ExternalLink size={12} color={colors.textSecondary} />}
          onPress={() => void openExternalFootballSource(source.url)}
        >
          {t('footballSources.matches.chip', { provider: source.providerName })}
        </Button>
      ))}
    </View>
  );
}
