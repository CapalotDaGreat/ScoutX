import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Award } from 'lucide-react-native';
import { Button } from '@/components/primitives/Button';
import { SkeletonLoader } from '@/components/feedback/SkeletonLoader';
import { Text } from '@/components/primitives/Text';
import { Section } from '@/components/layout/Section';
import { ClubTenureStrip } from '@/features/trust-system/components/ClubTenureStrip';
import { RecommendationCard } from '@/features/trust-system/components/RecommendationCard';
import { ScoutEndorsementModal } from '@/features/trust-system/components/ScoutEndorsementModal';
import { VerificationBadgeStrip } from '@/features/trust-system/components/VerificationBadgeStrip';
import { FreshnessLabel } from '@/components/evidence/FreshnessLabel';
import {
  usePlayerTrust,
  type UsePlayerTrustResult,
} from '@/features/trust-system/hooks/usePlayerTrust';
import { groupRecommendationsByType } from '@/features/trust-system/models/TrustModel';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';
import { useTheme } from '@/theme';

export type TrustProfileSectionProps = {
  playerId: string;
  playerName: string;
  currentClub: string;
  clubHistory: ClubHistoryEntry[];
  allowScoutEndorsement?: boolean;
  onInviteCoachPress?: () => void;
  /** Pass shared trust state to avoid duplicate Firestore subscriptions on the same screen. */
  trustState?: UsePlayerTrustResult;
};

function RecommendationGroup({
  title,
  recommendations,
}: {
  title: string;
  recommendations: TrustRecommendation[];
}) {
  if (recommendations.length === 0) {
    return null;
  }

  return (
    <View className="gap-3">
      <Text variant="overline" color="secondary">
        {title}
      </Text>
      {recommendations.map((recommendation, index) => (
        <RecommendationCard key={recommendation.id} recommendation={recommendation} index={index} />
      ))}
    </View>
  );
}

type TrustProfileSectionContentProps = Omit<TrustProfileSectionProps, 'trustState'> & {
  trust: UsePlayerTrustResult;
};

function TrustProfileSectionContent({
  playerName,
  allowScoutEndorsement = false,
  onInviteCoachPress,
  trust,
}: TrustProfileSectionContentProps) {
  const { t } = useAppTranslation(['trust']);
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    trustProfile,
    recommendations,
    clubTenures,
    isLoading,
    isSaving,
    saveRecommendation,
    deleteRecommendation,
  } = trust;

  const [editorVisible, setEditorVisible] = useState(false);
  const [activeEndorsement, setActiveEndorsement] = useState<TrustRecommendation | null>(null);

  const grouped = useMemo(() => groupRecommendationsByType(recommendations), [recommendations]);

  const scoutEndorsements = grouped.scout;
  const ownEndorsement = scoutEndorsements.find((item) => item.authorId === user?.id);

  const openCreateEndorsement = () => {
    setActiveEndorsement(null);
    setEditorVisible(true);
  };

  const openEditEndorsement = (endorsement: TrustRecommendation) => {
    setActiveEndorsement(endorsement);
    setEditorVisible(true);
  };

  const handleSaveEndorsement = async (draft: Parameters<typeof saveRecommendation>[3]) => {
    if (!user?.id) {
      throw new Error('Scout is not authenticated.');
    }

    await saveRecommendation(
      user.id,
      user.name ?? 'Scout',
      '',
      draft,
      activeEndorsement ?? ownEndorsement,
    );
  };

  const hasTrustSignals =
    trustProfile.player.verified ||
    trustProfile.scout.verified ||
    trustProfile.club.verified ||
    Boolean(trustProfile.coach?.verified) ||
    clubTenures.length > 0 ||
    recommendations.length > 0;

  if (!isLoading && !hasTrustSignals && !allowScoutEndorsement && !onInviteCoachPress) {
    return null;
  }

  return (
    <>
      <Section
        title={t('trust:title')}
        subtitle={t('trust:professionalSubtitle')}
        action={
          allowScoutEndorsement ? (
            <Button variant="accent" size="sm" onPress={openCreateEndorsement}>
              {ownEndorsement ? t('editEndorsement') : t('endorse')}
            </Button>
          ) : onInviteCoachPress ? (
            <Button variant="secondary" size="sm" onPress={onInviteCoachPress}>
              {t('inviteCoach')}
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <SkeletonLoader variant="card" count={2} />
        ) : (
          <View className="gap-4">
            <View className="flex-row items-center gap-2 rounded-lg bg-accent-muted/40 px-3 py-2">
              <Award size={16} color={colors.accent} />
              <Text variant="caption" color="accent" className="flex-1">
                {t('recommendationsCount', { count: recommendations.length })}
              </Text>
            </View>

            <VerificationBadgeStrip profile={trustProfile} />
            <FreshnessLabel updatedAt={trustProfile.updatedAt} sampleSize={recommendations.length} />
            <ClubTenureStrip tenures={clubTenures} />

            {recommendations.length === 0 ? (
              <View className="rounded-xl border border-dashed border-border px-4 py-8">
                <Text variant="body-sm" color="secondary" className="text-center">
                  {t('emptyRecommendations')}
                </Text>
                {onInviteCoachPress ? (
                  <Button variant="accent" size="sm" className="mt-4 self-center" onPress={onInviteCoachPress}>
                    {t('inviteYourCoach')}
                  </Button>
                ) : null}
              </View>
            ) : (
              <View className="gap-5">
                <RecommendationGroup
                  title={t('recommendationSection.coach_recommendation')}
                  recommendations={grouped.coach}
                />
                <RecommendationGroup
                  title={t('recommendationSection.scout_endorsement')}
                  recommendations={grouped.scout}
                />
              </View>
            )}

            {allowScoutEndorsement && ownEndorsement ? (
              <Button variant="secondary" size="sm" onPress={() => openEditEndorsement(ownEndorsement)}>
                {t('editYourEndorsement')}
              </Button>
            ) : null}
          </View>
        )}
      </Section>

      {allowScoutEndorsement ? (
        <ScoutEndorsementModal
          visible={editorVisible}
          playerName={playerName}
          endorsement={activeEndorsement ?? ownEndorsement}
          saving={isSaving}
          onClose={() => setEditorVisible(false)}
          onSave={handleSaveEndorsement}
          onDelete={deleteRecommendation}
        />
      ) : null}
    </>
  );
}

function TrustProfileSectionWithHook(props: TrustProfileSectionProps) {
  const { playerId, playerName, currentClub, clubHistory, trustState: _ignored, ...rest } = props;
  const trust = usePlayerTrust(playerId, { currentClub, clubHistory, playerName });
  return (
    <TrustProfileSectionContent
      {...rest}
      playerId={playerId}
      playerName={playerName}
      currentClub={currentClub}
      clubHistory={clubHistory}
      trust={trust}
    />
  );
}

export function TrustProfileSection(props: TrustProfileSectionProps) {
  if (props.trustState) {
    const { trustState, ...rest } = props;
    return <TrustProfileSectionContent {...rest} trust={trustState} />;
  }

  return <TrustProfileSectionWithHook {...props} />;
}
