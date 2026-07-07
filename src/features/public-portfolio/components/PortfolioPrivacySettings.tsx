import { View } from 'react-native';
import { Switch } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type PrivacySettings } from '@/features/player-profile/types/privacySettings';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type PortfolioPrivacySettingsProps = {
  settings: PrivacySettings;
  onChange: (next: PrivacySettings) => void;
  disabled?: boolean;
};

type ToggleRowProps = {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
};

function ToggleRow({ label, description, value, onValueChange, disabled }: ToggleRowProps) {
  const { colors } = useTheme();

  return (
    <View className="flex-row items-center justify-between gap-4 py-3">
      <View className="flex-1">
        <Text weight="semibold">{label}</Text>
        <Text variant="caption" color="secondary">
          {description}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.accent }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

export function PortfolioPrivacySettings({
  settings,
  onChange,
  disabled = false,
}: PortfolioPrivacySettingsProps) {
  const { t } = useAppTranslation('portfolio');
  const update = (patch: Partial<PrivacySettings>) => onChange({ ...settings, ...patch });

  return (
    <Card variant="outlined" padding="md" className="gap-1">
      <Text weight="semibold">{t('privacy.title')}</Text>
      <Text variant="body-sm" color="secondary" className="mb-2">
        {t('privacy.description')}
      </Text>

      <ToggleRow
        label={t('privacy.publicPortfolio')}
        description={t('privacy.publicPortfolioDescription')}
        value={settings.publicPortfolioEnabled}
        onValueChange={(value) => update({ publicPortfolioEnabled: value })}
        disabled={disabled}
      />
      <ToggleRow
        label={t('privacy.discoverable')}
        description={t('privacy.discoverableDescription')}
        value={settings.discoverableByScouts}
        onValueChange={(value) => update({ discoverableByScouts: value })}
        disabled={disabled}
      />
      <ToggleRow
        label={t('privacy.careerTimeline')}
        description={t('privacy.careerTimelineDescription')}
        value={settings.showCareerTimeline}
        onValueChange={(value) => update({ showCareerTimeline: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.statistics')}
        description={t('privacy.statisticsDescription')}
        value={settings.showStatistics}
        onValueChange={(value) => update({ showStatistics: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.videos')}
        description={t('privacy.videosDescription')}
        value={settings.showVideos}
        onValueChange={(value) => update({ showVideos: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.achievements')}
        description={t('privacy.achievementsDescription')}
        value={settings.showAchievements}
        onValueChange={(value) => update({ showAchievements: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.recommendations')}
        description={t('privacy.recommendationsDescription')}
        value={settings.showRecommendations}
        onValueChange={(value) => update({ showRecommendations: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.gpsHighlights')}
        description={t('privacy.gpsHighlightsDescription')}
        value={settings.showGpsHighlights}
        onValueChange={(value) => update({ showGpsHighlights: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.performanceCharts')}
        description={t('privacy.performanceChartsDescription')}
        value={settings.showPerformanceCharts}
        onValueChange={(value) => update({ showPerformanceCharts: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label={t('privacy.socialFeed')}
        description={t('privacy.socialFeedDescription')}
        value={settings.allowSocialPostsInFeed}
        onValueChange={(value) => update({ allowSocialPostsInFeed: value })}
        disabled={disabled}
      />
    </Card>
  );
}
