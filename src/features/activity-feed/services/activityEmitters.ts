import { type ActivityDraft } from '@/features/activity-feed/types';

export function buildProfileUpdatedActivity(
  playerId: string,
  playerName: string,
): ActivityDraft {
  return {
    recipientId: playerId,
    recipientRole: 'player',
    type: 'profile_updated',
    category: 'profile',
    title: 'Profile Updated',
    body: `${playerName} updated their football profile.`,
    actorId: playerId,
    actorName: playerName,
    actorRole: 'player',
    reference: { entityType: 'player', entityId: playerId, label: playerName },
  };
}

export function buildTrialInvitationActivity(input: {
  playerId: string;
  playerName: string;
  scoutId: string;
  scoutName: string;
  trialId: string;
  club: string;
}): ActivityDraft {
  return {
    recipientId: input.playerId,
    recipientRole: 'player',
    type: 'trial_invitation',
    category: 'trial',
    title: 'Trial Invitation',
    body: `${input.scoutName} invited you to a trial at ${input.club}.`,
    actorId: input.scoutId,
    actorName: input.scoutName,
    actorRole: 'scout',
    reference: { entityType: 'trial', entityId: input.trialId, label: input.club },
  };
}

export function buildScoutingReportActivity(input: {
  recipientId: string;
  recipientRole: 'player' | 'scout';
  scoutId: string;
  scoutName: string;
  playerId: string;
  playerName: string;
  reportId: string;
}): ActivityDraft {
  const isPlayerRecipient = input.recipientRole === 'player';

  return {
    recipientId: input.recipientId,
    recipientRole: input.recipientRole,
    type: 'scouting_report_created',
    category: 'scouting',
    title: 'New Scouting Report',
    body: isPlayerRecipient
      ? `${input.scoutName} published a new scouting report on your profile.`
      : `You published a scouting report on ${input.playerName}.`,
    actorId: input.scoutId,
    actorName: input.scoutName,
    actorRole: 'scout',
    reference: {
      entityType: 'report',
      entityId: input.reportId,
      label: input.playerName,
    },
  };
}

export function buildVideoUploadedActivity(input: {
  playerId: string;
  playerName: string;
  videoId: string;
  videoTitle: string;
}): ActivityDraft {
  return {
    recipientId: input.playerId,
    recipientRole: 'player',
    type: 'video_uploaded',
    category: 'media',
    title: 'Video Uploaded',
    body: `Highlight video "${input.videoTitle}" is now live on your profile.`,
    actorId: input.playerId,
    actorName: input.playerName,
    actorRole: 'player',
    reference: { entityType: 'video', entityId: input.videoId, label: input.videoTitle },
  };
}

export function buildPlayerSavedActivity(input: {
  scoutId: string;
  scoutName: string;
  playerId: string;
  playerName: string;
}): ActivityDraft {
  return {
    recipientId: input.scoutId,
    recipientRole: 'scout',
    type: 'player_saved',
    category: 'recruitment',
    title: 'Player Saved',
    body: `${input.playerName} was added to your recruitment pipeline.`,
    actorId: input.scoutId,
    actorName: input.scoutName,
    actorRole: 'scout',
    reference: { entityType: 'recruitment', entityId: input.playerId, label: input.playerName },
  };
}

export function buildRecommendationReceivedActivity(input: {
  playerId: string;
  playerName: string;
  authorId: string;
  authorName: string;
  recommendationId: string;
  headline: string;
}): ActivityDraft {
  return {
    recipientId: input.playerId,
    recipientRole: 'player',
    type: 'recommendation_received',
    category: 'trust',
    title: 'Recommendation Received',
    body: `${input.authorName} endorsed ${input.playerName}: ${input.headline}`,
    actorId: input.authorId,
    actorName: input.authorName,
    actorRole: 'scout',
    reference: {
      entityType: 'recommendation',
      entityId: input.recommendationId,
      label: input.headline,
    },
  };
}

export function buildPortfolioViewedActivity(input: {
  playerId: string;
  playerName: string;
  viewerId: string;
  viewerName: string;
  viewerRole: 'player' | 'scout' | 'coach';
  isScoutView: boolean;
}): ActivityDraft {
  const actorRole = input.viewerRole === 'coach' ? 'scout' : input.viewerRole;

  return {
    recipientId: input.playerId,
    recipientRole: 'player',
    type: 'portfolio_viewed',
    category: 'profile',
    title: input.isScoutView ? 'Scout viewed your passport' : 'Portfolio viewed',
    body: input.isScoutView
      ? `${input.viewerName} viewed your Football Passport.`
      : `${input.viewerName} opened your public Football Passport.`,
    actorId: input.viewerId,
    actorName: input.viewerName,
    actorRole,
    reference: { entityType: 'player', entityId: input.playerId, label: input.playerName },
  };
}

export function buildMilestoneEarnedActivity(input: {
  playerId: string;
  playerName: string;
  milestoneId: string;
  milestoneTitle: string;
  milestoneDescription: string;
}): ActivityDraft {
  return {
    recipientId: input.playerId,
    recipientRole: 'player',
    type: 'milestone_earned',
    category: 'system',
    title: 'Milestone unlocked',
    body: `${input.milestoneTitle}: ${input.milestoneDescription}`,
    actorId: 'system',
    actorName: 'PitchProof',
    actorRole: 'system',
    reference: { entityType: 'player', entityId: input.playerId, label: input.milestoneTitle },
  };
}

export function buildWeeklyReportReadyActivity(input: {
  playerId: string;
  playerName: string;
  summary: string;
}): ActivityDraft {
  return {
    recipientId: input.playerId,
    recipientRole: 'player',
    type: 'weekly_report_ready',
    category: 'system',
    title: 'Weekly Football Report ready',
    body: input.summary,
    actorId: 'system',
    actorName: 'PitchProof',
    actorRole: 'system',
    reference: { entityType: 'player', entityId: input.playerId, label: input.playerName },
  };
}
