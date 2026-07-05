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
import {
  usePlayerTrust,
  type UsePlayerTrustResult,
} from '@/features/trust-system/hooks/usePlayerTrust';
import { groupRecommendationsByType } from '@/features/trust-system/models/TrustModel';
import { TRUST_RECOMMENDATION_SECTION_LABELS } from '@/features/trust-system/constants';
import { type ClubHistoryEntry } from '@/features/player-profile/types/footballIdentity';
import { type TrustRecommendation } from '@/features/trust-system/types';
import { useAuth } from '@/features/auth/store/AuthProvider';
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
    clubTenures.length > 0 ||
    recommendations.length > 0;

  if (!isLoading && !hasTrustSignals && !allowScoutEndorsement && !onInviteCoachPress) {
    return null;
  }

  return (
    <>
      <Section
        title="Professional Trust"
        subtitle="Verified credentials, club tenure, and recommendations"
        action={
          allowScoutEndorsement ? (
            <Button variant="accent" size="sm" onPress={openCreateEndorsement}>
              {ownEndorsement ? 'Edit Endorsement' : 'Endorse'}
            </Button>
          ) : onInviteCoachPress ? (
            <Button variant="secondary" size="sm" onPress={onInviteCoachPress}>
              Invite coach
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <SkeletonLoader variant="card" count={2} />
        ) : (
          <View className="gap-4">
            <View className="flex-row items-center gap-2 rounded-lg bg-accent-muted/40 px-3 py-2 dark:bg-green-950/30">
              <Award size={16} color={colors.accent} />
              <Text variant="caption" color="accent" className="flex-1">
                {recommendations.length} recommendation
                {recommendations.length === 1 ? '' : 's'} on profile
              </Text>
            </View>

            <VerificationBadgeStrip profile={trustProfile} />
            <ClubTenureStrip tenures={clubTenures} />

            {recommendations.length === 0 ? (
              <View className="rounded-xl border border-dashed border-border px-4 py-8 dark:border-neutral-800">
                <Text variant="body-sm" color="secondary" className="text-center">
                  No coach recommendations or scout endorsements yet.
                </Text>
                {onInviteCoachPress ? (
                  <Button variant="accent" size="sm" className="mt-4 self-center" onPress={onInviteCoachPress}>
                    Invite your coach
                  </Button>
                ) : null}
              </View>
            ) : (
              <View className="gap-5">
                <RecommendationGroup
                  title={TRUST_RECOMMENDATION_SECTION_LABELS.coach_recommendation}
                  recommendations={grouped.coach}
                />
                <RecommendationGroup
                  title={TRUST_RECOMMENDATION_SECTION_LABELS.scout_endorsement}
                  recommendations={grouped.scout}
                />
              </View>
            )}

            {allowScoutEndorsement && ownEndorsement ? (
              <Button variant="secondary" size="sm" onPress={() => openEditEndorsement(ownEndorsement)}>
                Edit your endorsement
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
