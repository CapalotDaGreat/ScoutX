"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.refreshPublicPassport = exports.onProfileWrittenProjectPassport = void 0;
exports.buildPublicPassport = buildPublicPassport;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-functions/v2/firestore");
const firestore_2 = require("firebase-admin/firestore");
const firebase_functions_1 = require("firebase-functions");
const callableOptions_1 = require("./callableOptions");
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
];
const PUBLIC_PRIVACY_KEYS = [
    'publicPortfolioEnabled',
    'showCareerTimeline',
    'showStatistics',
    'showVideos',
    'showAchievements',
    'showRecommendations',
    'showGpsHighlights',
    'showPerformanceCharts',
];
function flag(privacy, key, fallback) {
    const value = privacy?.[key];
    return typeof value === 'boolean' ? value : fallback;
}
function buildPublicPassport(playerId, profile) {
    const privacy = profile.privacy;
    if (!flag(privacy, 'publicPortfolioEnabled', false)) {
        return null;
    }
    const identitySource = profile.identity ?? {};
    const identity = {};
    for (const key of PUBLIC_IDENTITY_KEYS) {
        if (key === 'careerTimeline' && !flag(privacy, 'showCareerTimeline', true)) {
            continue;
        }
        if (identitySource[key] !== undefined) {
            identity[key] = identitySource[key];
        }
    }
    const publicPrivacy = {};
    for (const key of PUBLIC_PRIVACY_KEYS) {
        publicPrivacy[key] = flag(privacy, key, key === 'publicPortfolioEnabled' ? false : true);
    }
    const showStatistics = flag(privacy, 'showStatistics', true);
    const showVideos = flag(privacy, 'showVideos', true);
    const showCareer = flag(privacy, 'showCareerTimeline', true);
    const showAchievements = flag(privacy, 'showAchievements', true);
    const showCharts = flag(privacy, 'showPerformanceCharts', true);
    const passport = {
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
async function projectPassport(playerId, profile) {
    const db = (0, firestore_2.getFirestore)();
    const ref = db.collection('publicPassports').doc(playerId);
    const summaryRef = db.collection('passportSummaries').doc(playerId);
    const passport = profile ? buildPublicPassport(playerId, profile) : null;
    if (!passport) {
        await Promise.all([ref.delete().catch(() => undefined), summaryRef.delete().catch(() => undefined)]);
        return;
    }
    const matches = Array.isArray(profile?.statisticsMatches) ? profile.statisticsMatches : [];
    const videos = profile && typeof profile.highlightVideos === 'object' && profile.highlightVideos !== null
        ? profile.highlightVideos.videos
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
                .map((item) => (item && typeof item === 'object' && typeof item.date === 'string'
                ? item.date
                : null))
                .filter((value) => Boolean(value))
                .sort()
                .at(-1) ?? null,
            projectedAt: new Date().toISOString(),
        }),
    ]);
}
/** Keeps the public projection in sync whenever the private profile changes. */
exports.onProfileWrittenProjectPassport = (0, firestore_1.onDocumentWritten)('profiles/{playerId}', async (event) => {
    const playerId = event.params.playerId;
    const after = event.data?.after;
    try {
        await projectPassport(playerId, after?.exists ? after.data() : undefined);
    }
    catch (error) {
        firebase_functions_1.logger.error('Failed to project public passport', { playerId, error });
        throw error;
    }
});
/**
 * Owner-triggered refresh. Used to backfill existing profiles the first time the app runs
 * after deployment, and as a manual "republish" from settings.
 */
exports.refreshPublicPassport = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Sign in required.');
    }
    const snapshot = await (0, firestore_2.getFirestore)().collection('profiles').doc(uid).get();
    await projectPassport(uid, snapshot.exists ? snapshot.data() : undefined);
    return { published: snapshot.exists && Boolean(buildPublicPassport(uid, snapshot.data())) };
});
//# sourceMappingURL=publicPassport.js.map