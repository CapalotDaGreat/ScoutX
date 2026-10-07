import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { createCallableOptions } from './callableOptions';
import type { SafetyPolicy } from './safety/policy';
import { loadSafetyPolicy } from './safety/userSafety';

/**
 * Public Football Passport projection.
 *
 * The private `profiles/{uid}` document is owner-only. Everything another user (scout,
 * guest, public link) may see is projected into `publicPassports/{uid}` by this module,
 * filtered by the player's privacy settings. Nothing is added that the profile does not
 * contain, and fields the player hid are omitted rather than blanked with placeholders.
 */

type Privacy = {
  publicPortfolioEnabled?: boolean;
  discoverableByScouts?: boolean;
  showCareerTimeline?: boolean;
  showStatistics?: boolean;
  showVideos?: boolean;
  showAchievements?: boolean;
  showRecommendations?: boolean;
  showGpsHighlights?: boolean;
  showPerformanceCharts?: boolean;
};

type ProfileDoc = Record<string, unknown> & {
  privacy?: Privacy;
  identity?: Record<string, unknown>;
};

const PUBLIC_IDENTITY_KEYS = [
  'currentClub',
  'clubHistory',
  'careerTimeline',
  'preferredPositions',
  'secondaryPositions',
  'preferredFormation',
  'strongFoot',
  'weakFootRating',
  'skillMovesRating',
  'hasCaptainExperience',
  'jerseyNumber',
  'languagesSpoken',
  'contractStatus',
  'availability',
  'preferredLeagues',
  'preferredPlayingStyle',
  'transferStatus',
  'biographyHeadline',
] as const;

const PUBLIC_PRIVACY_KEYS: ReadonlyArray<keyof Privacy> = [
  'publicPortfolioEnabled',
  'showCareerTimeline',
  'showStatistics',
  'showVideos',
  'showAchievements',
  'showRecommendations',
  'showGpsHighlights',
  'showPerformanceCharts',
];

function flag(privacy: Privacy | undefined, key: keyof Privacy, fallback: boolean): boolean {
  const value = privacy?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function buildPublicPassport(
  playerId: string,
  profile: ProfileDoc,
): Record<string, unknown> | null {
  const privacy = profile.privacy;
  if (!flag(privacy, 'publicPortfolioEnabled', false)) {
    return null;
  }

  const identitySource = profile.identity ?? {};
  const identity: Record<string, unknown> = {};
  for (const key of PUBLIC_IDENTITY_KEYS) {
    if (key === 'careerTimeline' && !flag(privacy, 'showCareerTimeline', true)) {
      continue;
    }
    if (identitySource[key] !== undefined) {
      identity[key] = identitySource[key];
    }
  }

  const publicPrivacy: Record<string, boolean> = {};
  for (const key of PUBLIC_PRIVACY_KEYS) {
    publicPrivacy[key] = flag(privacy, key, key === 'publicPortfolioEnabled' ? false : true);
  }

  const showStatistics = flag(privacy, 'showStatistics', true);
  const showVideos = flag(privacy, 'showVideos', true);
  const showCareer = flag(privacy, 'showCareerTimeline', true);
  const showAchievements = flag(privacy, 'showAchievements', true);
  const showCharts = flag(privacy, 'showPerformanceCharts', true);

  const passport: Record<string, unknown> = {
    playerId,
    isPublic: true,
    fullName: profile.fullName ?? '',
    position: profile.position ?? '',
    club: profile.club ?? '',
    nationality: profile.nationality ?? '',
    preferredFoot: profile.preferredFoot ?? '',
    height: profile.height ?? '',
    weight: profile.weight ?? '',
    biography: profile.biography ?? '',
    coverImageUrl: profile.coverImageUrl ?? '',
    avatarUrl: profile.avatarUrl ?? '',
    identity,
    privacy: publicPrivacy,
    hiddenEndorsementIds: Array.isArray(profile.hiddenEndorsementIds)
      ? profile.hiddenEndorsementIds
      : [],
    projectedAt: new Date().toISOString(),
  };

  if (typeof profile.username === 'string') {
    passport.username = profile.username;
  }
  if (showStatistics) {
    passport.statisticsMatches = Array.isArray(profile.statisticsMatches)
      ? profile.statisticsMatches
      : [];
    passport.stats = Array.isArray(profile.stats) ? profile.stats : [];
  }
  if (showCharts) {
    passport.performanceSummary = Array.isArray(profile.performanceSummary)
      ? profile.performanceSummary
      : [];
  }
  if (showVideos && profile.highlightVideos !== undefined) {
    passport.highlightVideos = profile.highlightVideos;
  }
  if (showCareer && profile.footballJourney !== undefined) {
    passport.footballJourney = profile.footballJourney;
  }
  if (showAchievements) {
    passport.earnedMilestones = Array.isArray(profile.earnedMilestones)
      ? profile.earnedMilestones
      : [];
  }

  return passport;
}

/** Minors are shown by first name, last initial and an age group only. */
export function applyYouthDisplay(passport: Record<string, unknown>, policy: SafetyPolicy): Record<string, unknown> {
  if (!policy.isMinor) return passport;
  const parts = String(passport.fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : (parts[0] ?? '');
  return { ...passport, fullName: displayName, ageGroupLabel: policy.ageGroupLabel };
}

export async function projectPassport(playerId: string, profile: ProfileDoc | undefined): Promise<void> {
  const db = getFirestore();
  const ref = db.collection('publicPassports').doc(playerId);
  const summaryRef = db.collection('passportSummaries').doc(playerId);
  const policy = await loadSafetyPolicy(playerId, db);
  const built = profile && policy.canUsePublicPassport ? buildPublicPassport(playerId, profile) : null;
  const passport = built ? applyYouthDisplay(built, policy) : null;
  if (!passport) {
    await Promise.all([ref.delete().catch(() => undefined), summaryRef.delete().catch(() => undefined)]);
    return;
  }
  const matches = Array.isArray(profile?.statisticsMatches) ? profile.statisticsMatches : [];
  const videos = profile && typeof profile.highlightVideos === 'object' && profile.highlightVideos !== null
    ? (profile.highlightVideos as { videos?: unknown }).videos
    : [];
  const videoCount = Array.isArray(videos) ? videos.length : 0;
  await Promise.all([
    ref.set(passport),
    summaryRef.set({
      playerId,
      isPublic: true,
      matchCount: matches.length,
      videoCount,
      lastEvidenceAt: matches
        .map((item) => (item && typeof item === 'object' && typeof (item as { date?: unknown }).date === 'string'
          ? (item as { date: string }).date
          : null))
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null,
      projectedAt: new Date().toISOString(),
    }),
  ]);
}

/** Keeps the public projection in sync whenever the private profile changes. */
export const onProfileWrittenProjectPassport = onDocumentWritten(
  'profiles/{playerId}',
  async (event) => {
    const playerId = event.params.playerId;
    const after = event.data?.after;
    try {
      await projectPassport(playerId, after?.exists ? (after.data() as ProfileDoc) : undefined);
    } catch (error) {
      logger.error('Failed to project public passport', { playerId, error });
      throw error;
    }
  },
);

/**
 * Owner-triggered refresh. Used to backfill existing profiles the first time the app runs
 * after deployment, and as a manual "republish" from settings.
 */
export const refreshPublicPassport = onCall(createCallableOptions(), async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in required.');
  }
  const snapshot = await getFirestore().collection('profiles').doc(uid).get();
  await projectPassport(uid, snapshot.exists ? (snapshot.data() as ProfileDoc) : undefined);
  return { published: snapshot.exists && Boolean(buildPublicPassport(uid, snapshot.data() as ProfileDoc)) };
});
