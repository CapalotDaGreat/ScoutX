import { Pressable, View } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { EvidenceStateBadge } from '@/components/evidence/EvidenceStateBadge';
import { ProvenanceBadge } from '@/components/evidence/ProvenanceBadge';
import { type EvidenceItem, type EvidenceKind } from '@/features/evidence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type EvidenceCardProps = {
  item: EvidenceItem;
  onPress?: (item: EvidenceItem) => void;
  className?: string;
};

export function useEvidenceKindLabel(): (kind: EvidenceKind) => string {
  const { t } = useAppTranslation(['evidence']);
  return (kind) => {
    switch (kind) {
      case 'match_log':
        return t('evidence:kind.match_log');
      case 'match_analysis':
        return t('evidence:kind.match_analysis');
      case 'video':
        return t('evidence:kind.video');
      case 'reel':
        return t('evidence:kind.reel');
      case 'gps_session':
        return t('evidence:kind.gps_session');
      case 'coach_observation':
        return t('evidence:kind.coach_observation');
      case 'club_record':
        return t('evidence:kind.club_record');
      case 'verification':
        return t('evidence:kind.verification');
      case 'training_session':
        return t('evidence:kind.training_session');
      case 'goal':
        return t('evidence:kind.goal');
      case 'milestone':
        return t('evidence:kind.milestone');
      case 'document':
        return t('evidence:kind.document');
      case 'other':
      default:
        return t('evidence:kind.other');
    }
  };
}

/**
 * Displays one evidence item with its kind, provenance, state and date. When the date is
 * unknown the card says so instead of showing today's date.
 */
export function EvidenceCard({ item, onPress, className }: EvidenceCardProps) {
  const { t, i18n } = useAppTranslation(['evidence']);
  const kindLabel = useEvidenceKindLabel();

  const occurred = item.occurredAt
    ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(item.occurredAt))
    : t('evidence:dateUnknown');

  const content = (
    <Card variant="outlined" padding="md" className={className}>
      <View className="gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text variant="overline" color="secondary">
            {kindLabel(item.kind)}
          </Text>
          <ProvenanceBadge provenance={item.provenance} />
          <EvidenceStateBadge state={item.state} confidence={item.confidence} />
        </View>
        <Text weight="semibold" numberOfLines={2}>
          {item.title || t('evidence:untitled')}
        </Text>
        {item.summary ? (
          <Text variant="body-sm" color="secondary" numberOfLines={3}>
            {item.summary}
          </Text>
        ) : null}
        <Text variant="caption" color="secondary">
          {occurred}
          {item.refs.length > 0
            ? ` · ${t('evidence:sourcesCount', { count: item.refs.length })}`
            : ''}
        </Text>
      </View>
    </Card>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.title || t('evidence:untitled')}
      onPress={() => onPress(item)}
    >
      {content}
    </Pressable>
  );
}
