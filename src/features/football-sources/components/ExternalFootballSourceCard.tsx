import { useState } from 'react';
import { Alert, View } from 'react-native';
import { ExternalLink, Link2, Trash2 } from 'lucide-react-native';
import { Badge } from '@/components/primitives/Badge';
import { Button } from '@/components/primitives/Button';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import {
  FOOTBALL_SOURCE_VISIBILITIES,
  parseFootballSourceUrl,
  type ExternalFootballSource,
  type FootballSourceVisibility,
  type PublicFootballSource,
} from '@/features/football-sources/core';
import { openExternalFootballSource } from '@/features/football-sources/services/footballSourceService';
import { ReportContentButton } from '@/features/trust-safety/components/ReportContentButton';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

type OwnerProps = {
  mode: 'owner';
  source: ExternalFootballSource;
  busy?: boolean;
  onChangeVisibility: (visibility: FootballSourceVisibility) => void;
  onLinkMatches?: () => void;
  onRemove: () => void;
};

type ViewerProps = {
  mode: 'viewer';
  source: PublicFootballSource;
  ownerId: string;
  /** False for the owner's own preview: people cannot report themselves. */
  canReport: boolean;
};

export type ExternalFootballSourceCardProps = (OwnerProps | ViewerProps) & { testID?: string };

function displayAddress(url: string): string {
  const parsed = parseFootballSourceUrl(url);
  return parsed.ok ? parsed.url.replace(/^https:\/\//, '') : url;
}

export function ExternalFootballSourceCard(props: ExternalFootballSourceCardProps) {
  const { t } = useAppTranslation(['passport', 'trust']);
  const { colors } = useTheme();
  const { source } = props;
  const owner = props.mode === 'owner' ? props : null;
  const status = owner ? owner.source.status : 'active';
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const handleOpen = () => {
    void openExternalFootballSource(source.url)
      .then((opened) => {
        if (!opened) Alert.alert(t('passport:footballSources.openFailedTitle'), t('passport:footballSources.openFailedBody'));
      })
      .catch(() => Alert.alert(t('passport:footballSources.openFailedTitle'), t('passport:footballSources.openFailedBody')));
  };

  return (
    <Card variant="default" padding="sm" className="gap-3" testID={props.testID}>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text weight="semibold">{source.providerName}</Text>
        <Badge size="sm" label={t(`passport:footballSources.types.${source.sourceType}`)} />
        <Badge size="sm" variant="outline" label={t('passport:footballSources.selfReported')} />
      </View>
      <Text variant="caption" color="secondary" numberOfLines={2} selectable>
        {displayAddress(source.url)}
      </Text>
      <Text variant="caption" color="tertiary">
        {t('passport:footballSources.disclaimer')}
      </Text>

      {owner && status !== 'active' ? (
        <Text variant="caption" color="warning" testID="football-source-status">
          {t(`passport:footballSources.status.${status}`)}
        </Text>
      ) : null}

      {owner && status === 'active' ? (
        <View className="gap-2">
          <Text variant="caption" weight="semibold">
            {t('passport:footballSources.visibility.label')}
          </Text>
          <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
            {FOOTBALL_SOURCE_VISIBILITIES.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={owner.source.visibility === option ? 'accent' : 'secondary'}
                disabled={owner.busy}
                accessibilityRole="radio"
                aria-checked={owner.source.visibility === option}
                onPress={() => {
                  if (option !== owner.source.visibility) owner.onChangeVisibility(option);
                }}
                testID={`football-source-visibility-${option}`}
              >
                {t(`passport:footballSources.visibility.${option}`)}
              </Button>
            ))}
          </View>
          <Text variant="caption" color="secondary">
            {t(`passport:footballSources.visibilityHint.${owner.source.visibility}`)}
          </Text>
        </View>
      ) : null}

      {owner && owner.source.matchIds.length > 0 ? (
        <Text variant="caption" color="secondary">
          {t('passport:footballSources.matches.linkedCount', { count: owner.source.matchIds.length })}
        </Text>
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {status === 'active' ? (
          <Button
            size="sm"
            variant="secondary"
            leftIcon={<ExternalLink size={14} color={colors.textPrimary} />}
            onPress={handleOpen}
            testID="football-source-open"
          >
            {t('passport:footballSources.open')}
          </Button>
        ) : null}
        {owner?.onLinkMatches && status === 'active' ? (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Link2 size={14} color={colors.textSecondary} />}
            disabled={owner.busy}
            onPress={owner.onLinkMatches}
          >
            {t('passport:footballSources.matches.link')}
          </Button>
        ) : null}
        {owner && !confirmingRemove ? (
          <Button
            size="sm"
            variant="ghost"
            leftIcon={<Trash2 size={14} color={colors.textSecondary} />}
            disabled={owner.busy}
            onPress={() => setConfirmingRemove(true)}
            testID="football-source-remove"
          >
            {t('passport:footballSources.remove')}
          </Button>
        ) : null}
        {props.mode === 'viewer' && props.canReport ? (
          <ReportContentButton
            targetType="external_football_source"
            targetId={source.id}
            targetOwnerId={props.ownerId}
            label={t('trust:report.sourceButton')}
            testID="football-source-report"
          />
        ) : null}
      </View>

      {owner && confirmingRemove ? (
        <View className="gap-2" testID="football-source-remove-prompt">
          <Text variant="body-sm" weight="semibold">
            {t('passport:footballSources.removeConfirmTitle')}
          </Text>
          <Text variant="caption" color="secondary">
            {t('passport:footballSources.removeConfirmBody')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={owner.busy} onPress={() => setConfirmingRemove(false)}>
              {t('passport:footballSources.cancel')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={owner.busy}
              onPress={owner.onRemove}
              testID="football-source-remove-confirm"
            >
              {t('passport:footballSources.remove')}
            </Button>
          </View>
        </View>
      ) : null}
    </Card>
  );
}
