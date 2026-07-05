import { View } from 'react-native';
import { Switch } from 'react-native';
import { Card } from '@/components/primitives/Card';
import { Text } from '@/components/primitives/Text';
import { type PrivacySettings } from '@/features/player-profile/types/privacySettings';

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
  return (
    <View className="flex-row items-center justify-between gap-4 py-3">
      <View className="flex-1">
        <Text weight="semibold">{label}</Text>
        <Text variant="caption" color="secondary">
          {description}
        </Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} />
    </View>
  );
}

export function PortfolioPrivacySettings({
  settings,
  onChange,
  disabled = false,
}: PortfolioPrivacySettingsProps) {
  const update = (patch: Partial<PrivacySettings>) => onChange({ ...settings, ...patch });

  return (
    <Card variant="outlined" padding="md" className="gap-1">
      <Text weight="semibold">Portfolio & feed privacy</Text>
      <Text variant="body-sm" color="secondary" className="mb-2">
        Control what appears on your public portfolio and in the social feed.
      </Text>

      <ToggleRow
        label="Public portfolio"
        description="Allow anyone with the link to view your football résumé."
        value={settings.publicPortfolioEnabled}
        onValueChange={(value) => update({ publicPortfolioEnabled: value })}
        disabled={disabled}
      />
      <ToggleRow
        label="Career timeline"
        description="Show journey and club history on your portfolio."
        value={settings.showCareerTimeline}
        onValueChange={(value) => update({ showCareerTimeline: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="Statistics"
        description="Show match stats and performance snapshot."
        value={settings.showStatistics}
        onValueChange={(value) => update({ showStatistics: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="Videos"
        description="Show highlight reels on your portfolio."
        value={settings.showVideos}
        onValueChange={(value) => update({ showVideos: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="Achievements"
        description="Show honours and milestone entries."
        value={settings.showAchievements}
        onValueChange={(value) => update({ showAchievements: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="Recommendations"
        description="Show scout endorsements on your portfolio."
        value={settings.showRecommendations}
        onValueChange={(value) => update({ showRecommendations: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="GPS highlights"
        description="Show movement heatmaps from recorded sessions."
        value={settings.showGpsHighlights}
        onValueChange={(value) => update({ showGpsHighlights: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="Performance charts"
        description="Show radar and progress charts."
        value={settings.showPerformanceCharts}
        onValueChange={(value) => update({ showPerformanceCharts: value })}
        disabled={disabled || !settings.publicPortfolioEnabled}
      />
      <ToggleRow
        label="Social feed visibility"
        description="Allow your posts to appear in the public For You feed."
        value={settings.allowSocialPostsInFeed}
        onValueChange={(value) => update({ allowSocialPostsInFeed: value })}
        disabled={disabled}
      />
    </Card>
  );
}
