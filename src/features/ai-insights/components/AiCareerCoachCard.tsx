import { useMemo } from 'react';
import { buildPerformanceContext } from '@/features/ai-insights/services/aiContextService';
import { AiInsightPanel } from '@/features/ai-insights/components/AiInsightPanel';
import { type PlayerProfile } from '@/features/player-profile/types';

export type AiCareerCoachCardProps = {
  profile: PlayerProfile;
};

export function AiCareerCoachCard({ profile }: AiCareerCoachCardProps) {
  const context = useMemo(
    () =>
      buildPerformanceContext(
        {
          playerId: profile.id,
          playerName: profile.fullName,
          position: profile.position ? [profile.position] : undefined,
          club: profile.club,
          nationality: profile.nationality,
        },
        profile.statisticsMatches ?? [],
      ),
    [profile],
  );

  return (
    <AiInsightPanel
      insightType="improvement_suggestions"
      context={context}
      enabled={Boolean(context)}
      autoGenerate={false}
    />
  );
}
