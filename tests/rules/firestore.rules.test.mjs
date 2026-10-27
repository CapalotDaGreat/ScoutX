import { beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clearFirestore,
  isAllowed,
  deleteDocument,
  getDocument,
  isDenied,
  setDocument,
  withClaims,
} from './emulator.mjs';

// Roles live in custom auth claims (set server-side by confirmRole), not in a client doc.
const PLAYER = withClaims('player-1', { role: 'player' });
const OTHER_PLAYER = withClaims('player-2', { role: 'player' });
const SCOUT = withClaims('scout-1', { role: 'scout' });
const COACH = withClaims('coach-1', { role: 'coach' });
const OUTSIDER = 'outsider-1';
/** Has a scout role in the users doc only; no claim. Must be treated as a non-recruiter. */
const FORGED_SCOUT = 'forged-scout';

async function allowed(statusPromise, message) {
  const status = await statusPromise;
  assert.ok(isAllowed(status), `${message} (expected 2xx, got ${status})`);
}

async function denied(statusPromise, message) {
  const status = await statusPromise;
  assert.ok(isDenied(status), `${message} (expected 403, got ${status})`);
}

const seed = (path, data) => allowed(setDocument('admin', path, data), `seed ${path}`);

function userDoc(uid, role) {
  return { uid, name: uid, email: `${uid}@example.com`, role, isAnonymous: false, createdAt: 'now', updatedAt: 'now' };
}

beforeEach(async () => {
  await clearFirestore();
  await seed(`users/${SCOUT}`, userDoc(SCOUT, 'scout'));
  await seed(`users/${COACH}`, userDoc(COACH, 'coach'));
  await seed(`users/${PLAYER}`, userDoc(PLAYER, 'player'));
  await seed(`users/${OTHER_PLAYER}`, userDoc(OTHER_PLAYER, 'player'));
  await seed(`users/${FORGED_SCOUT}`, { ...userDoc(FORGED_SCOUT, 'scout'), roleConfirmed: true });
});

describe('users', () => {
  test('a user can create their own user doc with a client role (including coach)', async () => {
    await allowed(setDocument('new-coach', 'users/new-coach', userDoc('new-coach', 'coach')), 'coach role');
  });
  test('privileged roles and foreign user docs are rejected', async () => {
    await denied(setDocument('new-admin', 'users/new-admin', userDoc('new-admin', 'admin')), 'admin role');
    await denied(setDocument(OUTSIDER, 'users/someone-else', userDoc('someone-else', 'player')), 'foreign uid');
  });
  test('users cannot read other users', async () => {
    await denied(getDocument(OUTSIDER, `users/${PLAYER}`), 'read other user');
  });
  test('a role can be chosen once during onboarding, then it is locked', async () => {
    await allowed(
      setDocument(PLAYER, `users/${PLAYER}`, { ...userDoc(PLAYER, 'scout'), roleConfirmed: true }),
      'onboarding role choice',
    );
    await denied(
      setDocument(PLAYER, `users/${PLAYER}`, { ...userDoc(PLAYER, 'player'), roleConfirmed: true }),
      'role change after confirmation',
    );
    await denied(
      setDocument(PLAYER, `users/${PLAYER}`, { ...userDoc(PLAYER, 'scout'), roleConfirmed: false }),
      'unlocking the role',
    );
    await denied(
      setDocument(OTHER_PLAYER, `users/${OTHER_PLAYER}`, userDoc(OTHER_PLAYER, 'club')),
      'self-assigning the club role',
    );
  });
});

describe('unauthenticated and guest access', () => {
  test('signed-out requests cannot read private data or write anything', async () => {
    await seed(`profiles/${PLAYER}`, { fullName: 'P', privacy: { publicPortfolioEnabled: false } });
    await denied(getDocument(null, `profiles/${PLAYER}`), 'private profile');
    await denied(getDocument(null, `users/${PLAYER}`), 'user doc');
    await denied(getDocument(null, `discoverablePlayers/${PLAYER}`), 'discovery index');
    await denied(
      setDocument(null, 'activities/a-anon', {
        recipientId: PLAYER, actorId: 'system', title: 't', body: 'b', read: false,
      }),
      'anonymous activity',
    );
  });
  test('guests cannot invite players to trials', async () => {
    await seed('users/guest-1', userDoc('guest-1', 'guest'));
    await denied(
      setDocument('guest-1', 'trialInvitations/t-guest', {
        scoutId: 'guest-1', playerId: PLAYER, status: 'pending',
      }),
      'guest invite',
    );
  });
});

describe('private scouting data', () => {
  test('scouting reports and analysis jobs are visible only to their owner', async () => {
    await seed('scoutingReports/r1', { scoutId: SCOUT, playerId: PLAYER, summary: 's' });
    await seed('matchAnalysisJobs/j1', { playerId: PLAYER, status: 'complete' });
    await allowed(getDocument(SCOUT, 'scoutingReports/r1'), 'author reads report');
    await denied(getDocument(PLAYER, 'scoutingReports/r1'), 'subject reads private report');
    await denied(getDocument(COACH, 'scoutingReports/r1'), 'other recruiter reads report');
    await allowed(getDocument(PLAYER, 'matchAnalysisJobs/j1'), 'owner reads job');
    await denied(getDocument(SCOUT, 'matchAnalysisJobs/j1'), 'scout reads job');
    await denied(getDocument(OTHER_PLAYER, 'matchAnalysisJobs/j1'), 'other player reads job');
  });
});

describe('profiles and GPS privacy', () => {
  beforeEach(async () => {
    await seed(`profiles/${PLAYER}`, { privacy: { publicPortfolioEnabled: true, showGpsHighlights: true } });
    await seed(`profiles/${OTHER_PLAYER}`, { privacy: { publicPortfolioEnabled: true, showGpsHighlights: false } });
    await seed('profiles/private-player', { privacy: { publicPortfolioEnabled: false } });
    await seed('gpsSessions/public-gps', { playerId: PLAYER });
    await seed('gpsSessions/hidden-gps', { playerId: OTHER_PLAYER });
    await seed('gpsSessions/private-gps', { playerId: 'private-player' });
  });

  test('private profiles are owner-only even when the passport is public', async () => {
    await denied(getDocument(null, `profiles/${PLAYER}`), 'guest reads raw profile');
    await denied(getDocument(SCOUT, `profiles/${PLAYER}`), 'scout reads raw profile');
    await denied(getDocument(OUTSIDER, 'profiles/private-player'), 'outsider reads private profile');
    await allowed(getDocument('private-player', 'profiles/private-player'), 'owner reads own profile');
  });

  test('public passports are server-projected: readable when public, never client-written', async () => {
    await seed(`publicPassports/${PLAYER}`, { playerId: PLAYER, isPublic: true, fullName: 'P' });
    await seed('publicPassports/private-player', { playerId: 'private-player', isPublic: false });
    await allowed(getDocument(null, `publicPassports/${PLAYER}`), 'guest reads public passport');
    await allowed(getDocument(SCOUT, `publicPassports/${PLAYER}`), 'scout reads public passport');
    await denied(getDocument(OUTSIDER, 'publicPassports/private-player'), 'outsider reads unpublished passport');
    await allowed(getDocument('private-player', 'publicPassports/private-player'), 'owner reads own projection');
    await denied(
      setDocument(PLAYER, `publicPassports/${PLAYER}`, { playerId: PLAYER, isPublic: true, fullName: 'Forged' }),
      'owner writes projection directly',
    );
    await seed(`passportSummaries/${PLAYER}`, { playerId: PLAYER, isPublic: true, matchCount: 2 });
    await allowed(getDocument(SCOUT, `passportSummaries/${PLAYER}`), 'scout reads public summary');
    await denied(
      setDocument(PLAYER, `passportSummaries/${PLAYER}`, { playerId: PLAYER, isPublic: true, matchCount: 99 }),
      'owner writes summary',
    );
  });

  test('GPS sessions are owner-only, even on a public passport with the legacy GPS flag on', async () => {
    await allowed(getDocument('private-player', 'gpsSessions/private-gps'), 'owner');
    await allowed(getDocument(PLAYER, 'gpsSessions/public-gps'), 'owner on public passport');
    await denied(getDocument(SCOUT, 'gpsSessions/private-gps'), 'scout on private passport');
    await denied(getDocument(SCOUT, 'gpsSessions/public-gps'), 'scout on public passport with GPS flag');
    await denied(getDocument(null, 'gpsSessions/public-gps'), 'signed-out visitor');
  });

  test('GPS sessions cannot be written for another player', async () => {
    await denied(setDocument(OUTSIDER, 'gpsSessions/forged', { playerId: PLAYER }), 'forged session');
  });

  test('GPS sessions cannot carry coordinates or uploaded point tracks', async () => {
    const summary = {
      playerId: PLAYER,
      metrics: { distanceM: 5200 },
      heatmap: { rows: 14, cols: 20, cells: [], extent: { lengthM: 80, widthM: 40 } },
    };
    await allowed(setDocument(PLAYER, 'gpsSessions/s-ok', summary), 'location-free summary');
    await denied(
      setDocument(PLAYER, 'gpsSessions/s-key', { ...summary, pointsStorageKey: `gpsSessions/${PLAYER}/s/points.json` }),
      'points file pointer',
    );
    await denied(
      setDocument(PLAYER, 'gpsSessions/s-bounds', {
        ...summary,
        heatmap: { ...summary.heatmap, bounds: { minLat: 47.3, maxLat: 47.4, minLng: 8.5, maxLng: 8.6 } },
      }),
      'coordinate bounds',
    );
    await denied(setDocument(PLAYER, 'gpsSessions/s-lat', { ...summary, latitude: 47.3 }), 'raw latitude');
  });
});

describe('callable rate limits', () => {
  test('clients cannot read or write abuse counters', async () => {
    const path = `callableRateLimits/${PLAYER}_discovery_search_2026-10-16T14`;
    await denied(setDocument(PLAYER, path, { count: 1, uid: PLAYER }), 'forge rate limit');
    await denied(getDocument(PLAYER, path), 'read rate limit');
    await denied(getDocument(null, path), 'anonymous rate limit');
  });
});

describe('trust and verification', () => {
  test('trust profiles are server-only', async () => {
    await denied(setDocument(PLAYER, `trustProfiles/${PLAYER}`, { score: 100 }), 'self trust score');
  });

  test('players cannot endorse themselves; author and subject are immutable', async () => {
    await denied(
      setDocument(PLAYER, 'trustRecommendations/self', { authorId: PLAYER, playerId: PLAYER, body: 'great' }),
      'self endorsement',
    );
    await allowed(
      setDocument(COACH, 'trustRecommendations/rec-1', { authorId: COACH, playerId: PLAYER, body: 'great' }),
      'coach endorses player',
    );
    await denied(
      setDocument(COACH, 'trustRecommendations/rec-1', { authorId: COACH, playerId: OTHER_PLAYER, body: 'moved' }),
      'retarget endorsement',
    );
  });

  test('verification states cannot be self-verified or squatted', async () => {
    await denied(
      setDocument(PLAYER, `verificationStates/player-${PLAYER}`, { entityId: PLAYER, entityType: 'player', level: 'verified' }),
      'self verified',
    );
    await allowed(
      setDocument(PLAYER, `verificationStates/player-${PLAYER}`, { entityId: PLAYER, entityType: 'player', level: 'basic' }),
      'own basic state',
    );
    await denied(
      setDocument(PLAYER, `verificationStates/player-${OTHER_PLAYER}`, { entityId: PLAYER, entityType: 'player', level: 'basic' }),
      'squat other id',
    );
  });

  test('the discovery listing is server-written', async () => {
    await denied(setDocument(PLAYER, `discoverablePlayers/${PLAYER}`, { verified: false }), 'player writes listing');
    await seed(`discoverablePlayers/${PLAYER}`, { verified: false });
    await allowed(getDocument(SCOUT, `discoverablePlayers/${PLAYER}`), 'scout reads');
    await allowed(getDocument(PLAYER, `discoverablePlayers/${PLAYER}`), 'signed-in player reads');
    await denied(getDocument(null, `discoverablePlayers/${PLAYER}`), 'guest reads');
    await denied(setDocument(SCOUT, `discoverablePlayers/${PLAYER}`, { verified: true }), 'scout writes listing');
  });
});

describe('activities', () => {
  const activity = (overrides) => ({
    recipientId: PLAYER,
    actorId: SCOUT,
    type: 'portfolio_viewed',
    title: 'Viewed',
    body: 'Someone viewed your passport',
    read: false,
    ...overrides,
  });

  test('clients can only write to their own feed; cross-user activity is server-only', async () => {
    await denied(setDocument(SCOUT, 'activities/a1', activity({})), 'genuine actor to another user');
    await denied(
      setDocument(SCOUT, 'activities/a1b', activity({ type: 'trial_invitation', title: 'Pay to get a trial', body: 'http://evil' })),
      'free text to another user',
    );
    await denied(setDocument(OUTSIDER, 'activities/a2', activity({})), 'spoofed actor');
    await denied(setDocument(OUTSIDER, 'activities/a3', activity({ actorId: 'system' })), 'system to someone else');
    await allowed(
      setDocument(PLAYER, 'activities/a4', activity({ actorId: 'system', type: 'milestone_earned' })),
      'system to self',
    );
    await allowed(
      setDocument(SCOUT, 'activities/a6', activity({ recipientId: SCOUT, actorId: SCOUT, type: 'player_saved' })),
      'own activity in own feed',
    );
  });

  test('recipients may only toggle read; others cannot read', async () => {
    await seed('activities/a5', activity({}));
    await allowed(setDocument(PLAYER, 'activities/a5', activity({ read: true })), 'mark read');
    await denied(setDocument(PLAYER, 'activities/a5', activity({ read: true, title: 'edited' })), 'edit title');
    await denied(getDocument(OUTSIDER, 'activities/a5'), 'outsider read');
  });
});

describe('trials', () => {
  const invitation = (overrides) => ({
    scoutId: SCOUT,
    playerId: PLAYER,
    status: 'pending',
    club: 'FC Example',
    history: [],
    updatedAt: 't0',
    ...overrides,
  });

  test('only recruiter roles can invite, and not themselves', async () => {
    await allowed(setDocument(SCOUT, 'trialInvitations/t1', invitation({})), 'scout invites');
    await allowed(setDocument(COACH, 'trialInvitations/t2', invitation({ scoutId: COACH })), 'coach invites');
    await denied(
      setDocument(OTHER_PLAYER, 'trialInvitations/t3', invitation({ scoutId: OTHER_PLAYER })),
      'player role invites',
    );
    await denied(setDocument(SCOUT, 'trialInvitations/t4', invitation({ status: 'accepted' })), 'pre-accepted');
  });

  test('a scout role written only to the users document is not trusted', async () => {
    await denied(
      setDocument(FORGED_SCOUT, 'trialInvitations/t-forged', invitation({ scoutId: FORGED_SCOUT })),
      'forged users-doc role invites',
    );
  });

  test('players may only accept or decline', async () => {
    await seed('trialInvitations/t5', invitation({}));
    await allowed(
      setDocument(PLAYER, 'trialInvitations/t5', invitation({ status: 'accepted', history: ['accepted'], updatedAt: 't1' })),
      'accept',
    );
    await denied(
      setDocument(PLAYER, 'trialInvitations/t5', invitation({ status: 'accepted', club: 'Other club' })),
      'player edits club',
    );
    await denied(setDocument(PLAYER, 'trialInvitations/t5', invitation({ status: 'cancelled' })), 'player cancels');
  });

  test('scouts manage details but cannot reassign participants; outsiders see nothing', async () => {
    await seed('trialInvitations/t6', invitation({}));
    await allowed(setDocument(SCOUT, 'trialInvitations/t6', invitation({ club: 'New club' })), 'reschedule');
    await denied(setDocument(SCOUT, 'trialInvitations/t6', invitation({ playerId: OTHER_PLAYER })), 'reassign');
    await denied(getDocument(OUTSIDER, 'trialInvitations/t6'), 'outsider read');
  });

  test('minor trials need the scout_contact scope and guardian co-approval', async () => {
    const minor = (patch) => ({
      ageBand: '13-17', guardianStatus: 'approved', scopes: [], consentExpiresAt: null, ...patch,
    });
    await seed(`userSafety/${PLAYER}`, minor({}));
    await denied(setDocument(SCOUT, 'trialInvitations/m1', invitation({})), 'no scout_contact scope');
    await seed(`userSafety/${PLAYER}`, minor({ scopes: ['scout_contact'] }));
    await allowed(setDocument(SCOUT, 'trialInvitations/m2', invitation({})), 'scope granted');
    await denied(
      setDocument(SCOUT, 'trialInvitations/m3', invitation({ guardianApproval: 'approved' })),
      'scout pre-approves',
    );

    await seed('trialInvitations/m4', invitation({ guardianApproval: 'pending', guardianTokenHash: 'h' }));
    await denied(
      setDocument(PLAYER, 'trialInvitations/m4', invitation({ status: 'accepted', guardianApproval: 'pending', guardianTokenHash: 'h', history: ['accepted'], updatedAt: 't1' })),
      'minor accepts before guardian',
    );
    await denied(
      setDocument(SCOUT, 'trialInvitations/m4', invitation({ guardianApproval: 'approved', guardianTokenHash: 'h' })),
      'scout flips guardian approval',
    );
    await denied(
      setDocument(SCOUT, 'trialInvitations/m4', invitation({ status: 'accepted', guardianApproval: 'pending', guardianTokenHash: 'h' })),
      'scout accepts for player',
    );

    await seed('trialInvitations/m5', invitation({ guardianApproval: 'approved', guardianTokenHash: 'h' }));
    await allowed(
      setDocument(PLAYER, 'trialInvitations/m5', invitation({ status: 'accepted', guardianApproval: 'approved', guardianTokenHash: 'h', history: ['accepted'], updatedAt: 't1' })),
      'minor accepts after guardian',
    );
  });

  test('trial notifications can only be created by trial participants', async () => {
    await seed('trialInvitations/t7', invitation({}));
    const notification = { recipientId: PLAYER, trialInvitationId: 't7', read: false, title: 'Trial', body: 'b' };
    await allowed(setDocument(SCOUT, 'trialNotifications/n1', notification), 'participant');
    await denied(setDocument(OUTSIDER, 'trialNotifications/n2', notification), 'outsider');
    await denied(
      setDocument(SCOUT, 'trialNotifications/n3', { ...notification, recipientId: OTHER_PLAYER }),
      'participant notifying a non-participant',
    );
    await denied(
      setDocument(SCOUT, 'trialNotifications/n4', { ...notification, body: 'x'.repeat(501) }),
      'oversized body',
    );
    await allowed(setDocument(PLAYER, 'trialNotifications/n1', { ...notification, read: true }), 'mark read');
    await denied(setDocument(PLAYER, 'trialNotifications/n1', { ...notification, title: 'edited' }), 'edit');
  });

  test('scouts cannot message a minor through trial notifications after scout contact is withdrawn', async () => {
    await seed('trialInvitations/t8', invitation({}));
    const notification = { recipientId: PLAYER, trialInvitationId: 't8', read: false, title: 'Trial', body: 'b' };
    await seed(`userSafety/${PLAYER}`, { ageBand: '13-17', guardianStatus: 'approved', scopes: ['scout_contact'], consentExpiresAt: null });
    await allowed(setDocument(SCOUT, 'trialNotifications/w1', notification), 'scope granted');
    await seed(`userSafety/${PLAYER}`, { ageBand: '13-17', guardianStatus: 'revoked', scopes: [], consentExpiresAt: null });
    await denied(setDocument(SCOUT, 'trialNotifications/w2', notification), 'scope withdrawn');
    await allowed(
      setDocument(PLAYER, 'trialNotifications/w3', { ...notification, recipientId: SCOUT }),
      'minor can still notify the scout (e.g. decline)',
    );
    await seed(`userSafety/${PLAYER}`, { ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null });
  });
});

describe('youth safety', () => {
  test('safety state is owner-readable and server-written only', async () => {
    await seed(`userSafety/${PLAYER}`, { ageBand: '18plus', guardianStatus: 'not_required', scopes: [] });
    await allowed(getDocument(PLAYER, `userSafety/${PLAYER}`), 'owner read');
    await denied(getDocument(OUTSIDER, `userSafety/${PLAYER}`), 'outsider read');
    await denied(
      setDocument(PLAYER, `userSafety/${PLAYER}`, { ageBand: '18plus', guardianStatus: 'approved', scopes: ['discovery'] }),
      'owner self-approves',
    );
  });

  test('consent records, guardian contacts and mail are server-only', async () => {
    await seed('youthConsents/c1', { uid: PLAYER, status: 'pending' });
    await seed(`guardianContacts/${PLAYER}`, { email: 'parent@example.com' });
    await denied(getDocument(PLAYER, 'youthConsents/c1'), 'read consent');
    await denied(setDocument(PLAYER, 'youthConsents/c2', { uid: PLAYER, status: 'approved' }), 'forge consent');
    await denied(getDocument(PLAYER, `guardianContacts/${PLAYER}`), 'read guardian email');
    await denied(setDocument(PLAYER, 'mail/m1', { to: 'x@example.com', message: { subject: 's' } }), 'send mail');
  });
});

describe('under-13 private mode', () => {
  // Every social scope stored, as if the safety document had been tampered with: rules must
  // still keep the child private.
  const child = {
    ageBand: 'under13',
    guardianStatus: 'approved',
    scopes: ['public_passport', 'discovery', 'scout_contact', 'public_media', 'public_movement', 'ai_analysis'],
    consentExpiresAt: null,
  };

  beforeEach(async () => {
    await seed(`userSafety/${PLAYER}`, child);
  });

  test('nobody can invite, message or watch a child', async () => {
    await denied(
      setDocument(SCOUT, 'trialInvitations/c1', { scoutId: SCOUT, playerId: PLAYER, status: 'pending', club: 'FC', history: [], updatedAt: 't0' }),
      'trial invitation',
    );
    await seed('trialInvitations/c2', { scoutId: SCOUT, playerId: PLAYER, status: 'pending', club: 'FC', history: [], updatedAt: 't0' });
    await denied(
      setDocument(SCOUT, 'trialNotifications/c3', { recipientId: PLAYER, trialInvitationId: 'c2', read: false, title: 'Trial', body: 'b' }),
      'trial notification',
    );
    await denied(
      setDocument(SCOUT, `recruitmentWorkspaces/${SCOUT}/entries/${PLAYER}`, { scoutId: SCOUT, playerId: PLAYER, stage: 'watching' }),
      'pipeline entry',
    );
  });

  test('nobody can endorse or observe a child, and their trust data stays private', async () => {
    await denied(
      setDocument(COACH, 'trustRecommendations/c4', { authorId: COACH, playerId: PLAYER, body: 'great' }),
      'endorsement',
    );
    await denied(
      setDocument(COACH, 'coachObservations/c5', { coachId: COACH, playerId: PLAYER, body: 'note', provenance: 'coach_provided' }),
      'coach observation',
    );
    await seed(`trustProfiles/${PLAYER}`, { score: 10 });
    await seed('trustRecommendations/c6', { authorId: COACH, playerId: PLAYER, body: 'old' });
    await denied(getDocument(SCOUT, `trustProfiles/${PLAYER}`), 'scout reads trust profile');
    await denied(getDocument(SCOUT, 'trustRecommendations/c6'), 'scout reads endorsement');
    await allowed(getDocument(PLAYER, `trustProfiles/${PLAYER}`), 'child reads own trust profile');
    await allowed(getDocument(PLAYER, 'trustRecommendations/c6'), 'child reads own endorsement');
  });

  test('a child cannot publish or share media or claim a public username', async () => {
    const item = (patch) => ({
      id: 'v1', ownerId: PLAYER, type: 'highlight', storagePath: 'profiles/p/videos/v1/video.mp4',
      visibility: 'private', rightsState: 'user_confirmed', uploadState: 'ready', processingState: 'none',
      favorite: false, tags: [], goalIds: [], title: 'Clip', durationSec: 12, thumbnailPath: null,
      sourceMatchId: null, sourceJobId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', ...patch,
    });
    const path = `players/${PLAYER}/media/v1`;
    await allowed(setDocument(PLAYER, path, item({})), 'private media');
    await denied(setDocument(PLAYER, path, item({ visibility: 'passport' })), 'publish on Passport');
    await denied(setDocument(PLAYER, path, item({ visibility: 'grant' })), 'share with a scout');
    await denied(
      setDocument(PLAYER, 'mediaGrants/c7', { ownerId: PLAYER, granteeId: SCOUT, mediaId: 'v1', expiresAt: '2026-12-01T00:00:00.000Z' }),
      'media grant',
    );
    await denied(setDocument(PLAYER, 'portfolioSlugs/kid', { playerId: PLAYER }), 'username');
  });

  test('a child can still keep private records', async () => {
    await allowed(
      setDocument(PLAYER, `players/${PLAYER}/matches/m1`, { id: 'm1', date: '2026-10-01', opponent: 'FC Test', result: 'W', minutes: 60 }),
      'log a match',
    );
    await allowed(
      setDocument(PLAYER, `players/${PLAYER}/developmentGoals/g1`, { ownerId: PLAYER, id: 'g1', title: 'Weak foot', category: 'technical', status: 'active' }),
      'set a goal',
    );
  });
});

describe('consent records', () => {
  test('owners read their consent proof; nobody writes it from the client', async () => {
    await seed(`consentRecords/${PLAYER}`, { uid: PLAYER, consents: {} });
    await seed(`consentRecords/${PLAYER}/items/i1`, { type: 'privacy_policy', version: '1.0.0' });
    await allowed(getDocument(PLAYER, `consentRecords/${PLAYER}`), 'owner reads summary');
    await allowed(getDocument(PLAYER, `consentRecords/${PLAYER}/items/i1`), 'owner reads item');
    await denied(getDocument(OUTSIDER, `consentRecords/${PLAYER}`), 'outsider reads summary');
    await denied(
      setDocument(PLAYER, `consentRecords/${PLAYER}`, { uid: PLAYER, consents: { privacy_policy: { status: 'granted', version: '9.0.0' } } }),
      'owner forges summary',
    );
    await denied(setDocument(PLAYER, `consentRecords/${PLAYER}/items/i2`, { type: 'privacy_policy' }), 'owner forges item');
  });
});

describe('match analysis jobs', () => {
  const job = (overrides) => ({ playerId: PLAYER, status: 'uploading', frames: [], ...overrides });

  test('clients cannot create jobs with reports or a terminal success status', async () => {
    await allowed(setDocument(PLAYER, 'matchAnalysisJobs/j1', job({})), 'uploading job');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/j2', job({ report: { headline: 'fake' } })), 'with report');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/j3', job({ status: 'complete' })), 'complete status');
    await denied(setDocument(OUTSIDER, 'matchAnalysisJobs/j4', job({})), 'for another player');
  });

  test('clients create only uploading jobs with allowlisted fields', async () => {
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/j2q', job({ status: 'queued' })), 'queued status');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/j2p', job({ pipelineState: 'completed' })), 'pipeline state');
    await denied(
      setDocument(PLAYER, 'matchAnalysisJobs/j2s', job({ pipelineStages: [{ id: 'player-tracking', status: 'complete' }] })),
      'forged stages',
    );
    await denied(
      setDocument(PLAYER, 'matchAnalysisJobs/j2f', job({ frames: [{ id: 'frame_0', storagePath: 'x' }] })),
      'frames at create',
    );
  });

  test('status, pipeline state and results are server-owned after creation', async () => {
    await seed('matchAnalysisJobs/j5', job({ status: 'processing', pipelineState: 'extracting' }));
    for (const [label, patch] of [
      ['failed', { status: 'failed', error: 'x' }],
      ['complete', { status: 'complete' }],
      ['cancel by write', { status: 'cancelled' }],
      ['pipeline state', { pipelineState: 'completed' }],
      ['inject report', { report: { headline: 'fake' } }],
      ['error code', { errorCode: 'extraction_failed' }],
      ['reassign', { playerId: OTHER_PLAYER }],
      ['segments', { extractionSegments: [] }],
    ]) {
      await denied(setDocument(PLAYER, 'matchAnalysisJobs/j5', job({ status: 'processing', pipelineState: 'extracting', ...patch })), label);
    }
    await denied(getDocument(OUTSIDER, 'matchAnalysisJobs/j5'), 'outsider read');
  });

  test('device frames are accepted only for the short-clip fallback after extraction failed', async () => {
    const frames = [{ id: 'frame_0', index: 0, timestampSec: 0, storagePath: `profiles/${PLAYER}/matchFootage/j7/frames/frame_0.jpg`, downloadUrl: '' }];
    await seed('matchAnalysisJobs/j7', job({ status: 'processing', pipelineState: 'extracting' }));
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/j7', job({ status: 'processing', pipelineState: 'extracting', frames })), 'while extracting');
    const failed = { status: 'failed', pipelineState: 'failed', errorCode: 'extraction_failed' };
    await seed('matchAnalysisJobs/j8', job(failed));
    await allowed(setDocument(PLAYER, 'matchAnalysisJobs/j8', job({ ...failed, frames })), 'fallback frames');
    await seed('matchAnalysisJobs/j9', job({ status: 'failed', pipelineState: 'failed', errorCode: 'model_unavailable' }));
    await denied(
      setDocument(PLAYER, 'matchAnalysisJobs/j9', job({ status: 'failed', pipelineState: 'failed', errorCode: 'model_unavailable', frames })),
      'other failure',
    );
  });

  test('consented short clips accept device frames while uploading; mode and consent are server-owned', async () => {
    const frames = Array.from({ length: 32 }, (_, i) => ({ id: `frame_${i}`, index: i, timestampSec: i, storagePath: `profiles/${PLAYER}/matchFootage/c1/frames/frame_${i}.jpg`, downloadUrl: '' }));
    await seed('matchAnalysisJobs/c1', job({ processingMode: 'device_frames', consentVersion: '2026-10-video-v1' }));
    await allowed(setDocument(PLAYER, 'matchAnalysisJobs/c1', job({ processingMode: 'device_frames', consentVersion: '2026-10-video-v1', frames })), '32 device frames');
    await denied(
      setDocument(PLAYER, 'matchAnalysisJobs/c1', job({ processingMode: 'device_frames', consentVersion: '2026-10-video-v1', frames: [...frames, frames[0]] })),
      'more than 32 frames',
    );
    await seed('matchAnalysisJobs/c2', job({ processingMode: 'device_frames' }));
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/c2', job({ processingMode: 'device_frames', frames })), 'without consent');
    await seed('matchAnalysisJobs/c3', job({ processingMode: 'cloud_video', consentVersion: '2026-10-video-v1' }));
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/c3', job({ processingMode: 'cloud_video', consentVersion: '2026-10-video-v1', frames })), 'cloud job');

    await allowed(setDocument(PLAYER, 'matchAnalysisJobs/c4', job({ analysisIntent: 'training', clipContext: 'save' })), 'intent and clip context');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/c5', job({ clipContext: 'penalty_scored' })), 'unknown clip context');
    for (const [label, patch] of [
      ['processing mode', { processingMode: 'device_frames' }],
      ['analysis mode', { analysisMode: 'SHORT_CLIP' }],
      ['keep video', { retainSource: true }],
      ['consent', { consentVersion: '2026-10-video-v1' }],
      ['pending coaching', { pendingCoaching: { strengths: ['fake'] } }],
      ['cleanup state', { mediaCleanupState: 'done' }],
    ]) {
      await denied(setDocument(PLAYER, `matchAnalysisJobs/c6_${label.replace(/ /g, '_')}`, job(patch)), `create with ${label}`);
    }
    await seed('matchAnalysisJobs/c7', job({ status: 'complete', retainSource: false }));
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/c7', job({ status: 'complete', retainSource: true })), 'flip keep video later');
  });

  test('video consents and analysis subcollections are owner-read, server-written', async () => {
    await seed('videoProcessingConsents/c1', { uid: PLAYER, jobId: 'c1', revokedAt: null });
    await allowed(getDocument(PLAYER, 'videoProcessingConsents/c1'), 'owner reads consent');
    await denied(getDocument(OUTSIDER, 'videoProcessingConsents/c1'), 'outsider reads consent');
    await denied(setDocument(PLAYER, 'videoProcessingConsents/c9', { uid: PLAYER, jobId: 'c9', revokedAt: null }), 'forge consent');
    await seed('matchAnalysisJobs/s1', job({ status: 'complete' }));
    await seed('matchAnalysisJobs/s1/segmentReviews/0', { observations: [] });
    await seed('matchAnalysisJobs/s1/reports/1', { report: {} });
    await allowed(getDocument(PLAYER, 'matchAnalysisJobs/s1/segmentReviews/0'), 'owner reads review');
    await allowed(getDocument(PLAYER, 'matchAnalysisJobs/s1/reports/1'), 'owner reads archived version');
    await denied(getDocument(OUTSIDER, 'matchAnalysisJobs/s1/segmentReviews/0'), 'outsider reads review');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/s1/segmentReviews/1', { observations: [{ detail: 'fake' }] }), 'forge review');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/s1/reports/2', { report: {} }), 'forge version');
    // 4.0 progress facts: owner-readable, never client-written (no forged progress or reports).
    await seed('matchAnalysisJobs/s1/tracking/progress', { generation: 1, plan: [], segments: {} });
    await allowed(getDocument(PLAYER, 'matchAnalysisJobs/s1/tracking/progress'), 'owner reads progress');
    await denied(getDocument(OUTSIDER, 'matchAnalysisJobs/s1/tracking/progress'), 'outsider reads progress');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/s1/tracking/progress', { generation: 2, full: { parts: 99 } }), 'forge progress');
    await denied(setDocument(PLAYER, 'matchAnalysisJobs/s1/tracking/current', { report: {}, scope: 'full' }), 'forge report');
  });

  test('clients may confirm identity but cannot write events, lease, or quota', async () => {
    await seed('matchAnalysisJobs/j6', job({ status: 'processing' }));
    await allowed(
      setDocument(PLAYER, 'matchAnalysisJobs/j6', job({
        status: 'processing',
        identityConfirmation: { state: 'confirmed', frameIds: ['frame_0'], confirmedAt: '2026-10-06T00:00:00.000Z' },
        updatedAt: '2026-10-06T00:00:00.000Z',
      })),
      'identity confirmation',
    );
    await allowed(
      setDocument(PLAYER, 'matchAnalysisJobs/j6', job({
        status: 'processing',
        identityConfirmation: { state: 'confirmed', frameIds: ['frame_0'], confirmedAt: '2026-10-06T00:00:00.000Z' },
        updatedAt: '2026-10-06T00:00:00.000Z',
        videoSync: { gpsSessionId: 'g1', gpsAnchorMs: 1, videoAnchorSec: 0, setAt: '2026-10-06T00:00:00.000Z' },
      })),
      'video sync',
    );
    await denied(
      setDocument(PLAYER, 'matchAnalysisJobs/j6', job({ status: 'processing', events: [{ eventId: 'fake' }] })),
      'inject events',
    );
    await denied(
      setDocument(PLAYER, 'matchAnalysisJobs/j6', job({ status: 'processing', lease: { holder: 'x', until: '2099-01-01' } })),
      'inject lease',
    );
    await seed(`analysisQuotas/${PLAYER}`, { day: '2026-10-06', count: 1 });
    await allowed(getDocument(PLAYER, `analysisQuotas/${PLAYER}`), 'quota read owner');
    await denied(setDocument(PLAYER, `analysisQuotas/${PLAYER}`, { day: '2026-10-06', count: 9 }), 'quota write');
  });
});

describe('player match logs and evidence', () => {
  const match = (overrides) => ({
    id: 'm1',
    date: '2026-03-01',
    opponent: 'FC Example',
    result: 'win',
    minutes: 90,
    goals: 1,
    ...overrides,
  });

  test('owners write valid match logs; others cannot read or write them', async () => {
    await allowed(setDocument(PLAYER, `players/${PLAYER}/matches/m1`, match({})), 'owner logs match');
    await allowed(getDocument(PLAYER, `players/${PLAYER}/matches/m1`), 'owner reads');
    await denied(getDocument(SCOUT, `players/${PLAYER}/matches/m1`), 'scout reads raw log');
    await denied(setDocument(OUTSIDER, `players/${PLAYER}/matches/m2`, match({ id: 'm2' })), 'outsider writes');
  });

  test('match logs must be internally consistent', async () => {
    await denied(setDocument(PLAYER, `players/${PLAYER}/matches/m3`, match({ id: 'other' })), 'id mismatch');
    await denied(setDocument(PLAYER, `players/${PLAYER}/matches/m4`, match({ id: 'm4', minutes: 400 })), 'impossible minutes');
    await denied(setDocument(PLAYER, `players/${PLAYER}/matches/m5`, match({ id: 'm5', date: 20260301 })), 'non-string date');
  });

  test('evidence items are owner-scoped', async () => {
    const item = { id: 'e1', ownerId: PLAYER, kind: 'match_log', provenance: 'self_reported', state: 'available', title: 'Match' };
    await allowed(setDocument(PLAYER, `players/${PLAYER}/evidenceItems/e1`, item), 'owner writes evidence');
    await denied(setDocument(PLAYER, `players/${PLAYER}/evidenceItems/e2`, { ...item, id: 'e2', ownerId: OTHER_PLAYER }), 'wrong owner');
    await denied(getDocument(SCOUT, `players/${PLAYER}/evidenceItems/e1`), 'scout reads evidence');
  });

  test('development goals, training and identity snapshots are owner-only', async () => {
    const goal = {
      id: 'g1', ownerId: PLAYER, title: 'Pressing', category: 'tactical', status: 'active',
    };
    await allowed(setDocument(PLAYER, `players/${PLAYER}/developmentGoals/g1`, goal), 'owner writes goal');
    await denied(getDocument(SCOUT, `players/${PLAYER}/developmentGoals/g1`), 'scout reads goal');
    await denied(setDocument(PLAYER, `players/${PLAYER}/developmentGoals/g2`, { ...goal, id: 'g2', ownerId: OTHER_PLAYER }), 'wrong owner');

    const session = {
      id: 's1', ownerId: PLAYER, date: '2026-10-06', focus: 'First touch', type: 'individual',
    };
    await allowed(setDocument(PLAYER, `players/${PLAYER}/trainingSessions/s1`, session), 'owner writes training');
    await denied(getDocument(OUTSIDER, `players/${PLAYER}/trainingSessions/s1`), 'outsider reads training');

    const snapshot = {
      id: 'i1', ownerId: PLAYER, effectiveFrom: '2026-10-01', source: 'self_reported', position: 'AM',
    };
    await allowed(setDocument(PLAYER, `players/${PLAYER}/identitySnapshots/i1`, snapshot), 'owner writes identity');
    await denied(setDocument(OUTSIDER, `players/${PLAYER}/identitySnapshots/i2`, { ...snapshot, id: 'i2', ownerId: PLAYER }), 'outsider writes identity');
  });
});

describe('ownership of shared documents', () => {
  test('public usernames cannot be taken over', async () => {
    await allowed(setDocument(PLAYER, 'portfolioSlugs/striker9', { playerId: PLAYER }), 'claim');
    await denied(setDocument(OUTSIDER, 'portfolioSlugs/striker9', { playerId: OUTSIDER }), 'takeover');
    await allowed(getDocument(null, 'portfolioSlugs/striker9'), 'guest resolves username');
    await denied(deleteDocument(OUTSIDER, 'portfolioSlugs/striker9'), 'outsider release');
    await allowed(deleteDocument(PLAYER, 'portfolioSlugs/striker9'), 'owner release');
  });

  test('career replays and club profiles cannot be overwritten by others', async () => {
    await seed('careerReplays/r1', { playerId: PLAYER });
    await denied(setDocument(OUTSIDER, 'careerReplays/r1', { playerId: OUTSIDER }), 'overwrite replay');
    await seed('clubProfiles/c1', { ownerId: SCOUT, name: 'Club' });
    await denied(setDocument(OUTSIDER, 'clubProfiles/c1', { ownerId: OUTSIDER, name: 'Mine' }), 'club takeover');
    await allowed(setDocument(SCOUT, 'clubProfiles/c1', { ownerId: SCOUT, name: 'Renamed' }), 'owner update');
  });

  test('server-only and per-user secrets stay private', async () => {
    await seed(`authProviderTokens/${PLAYER}`, { appleRefreshToken: 'secret' });
    await denied(getDocument(PLAYER, `authProviderTokens/${PLAYER}`), 'own provider tokens');
    await seed(`pushTokens/${PLAYER}`, { token: 'ExponentPushToken[x]' });
    await denied(getDocument(OUTSIDER, `pushTokens/${PLAYER}`), 'other push token');
    await denied(getDocument(PLAYER, `pushThrottle/${PLAYER}`), 'push throttle state');
  });
});

describe('media library and reels', () => {
  test('media items are owner-only and must keep storage paths', async () => {
    const item = {
      id: 'm1', ownerId: PLAYER, type: 'highlight', storagePath: 'profiles/p/videos/m1/video.mp4',
      visibility: 'private', uploadState: 'ready', processingState: 'none', favorite: false,
      tags: [], goalIds: [], title: 'Clip', durationSec: 12, thumbnailPath: null,
      sourceMatchId: null, sourceJobId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01',
    };
    await allowed(setDocument(PLAYER, `players/${PLAYER}/media/m1`, item), 'owner writes media');
    await denied(getDocument(SCOUT, `players/${PLAYER}/media/m1`), 'scout reads media');
    await denied(setDocument(OUTSIDER, `players/${PLAYER}/media/m2`, { ...item, id: 'm2' }), 'outsider writes');
  });

  test('media leaves private only with confirmed rights, no hold, and guardian scope for minors', async () => {
    const item = (patch) => ({
      id: 'v1', ownerId: PLAYER, type: 'highlight', storagePath: 'profiles/p/videos/v1/video.mp4',
      visibility: 'private', rightsState: 'unconfirmed', uploadState: 'ready', processingState: 'none',
      favorite: false, tags: [], goalIds: [], title: 'Clip', durationSec: 12, thumbnailPath: null,
      sourceMatchId: null, sourceJobId: null, createdAt: '2026-10-01', updatedAt: '2026-10-01', ...patch,
    });
    const path = `players/${PLAYER}/media/v1`;
    await denied(setDocument(PLAYER, path, item({ visibility: 'passport' })), 'public without confirmation');
    await denied(setDocument(PLAYER, path, item({ visibility: 'unlisted' })), 'unsupported visibility');
    await denied(setDocument(PLAYER, path, item({ rightsState: 'restricted' })), 'client sets moderation rights');
    await denied(setDocument(PLAYER, path, item({ moderationState: 'restricted' })), 'client sets moderation');
    await allowed(setDocument(PLAYER, path, item({})), 'private upload');
    await allowed(
      setDocument(PLAYER, path, item({ visibility: 'passport', rightsState: 'user_confirmed' })),
      'confirmed adult publishes',
    );

    await seed(path, item({ visibility: 'private', rightsState: 'restricted', moderationState: 'restricted', visibilityBeforeHold: 'passport' }));
    await denied(
      setDocument(PLAYER, path, item({ visibility: 'passport', rightsState: 'user_confirmed', moderationState: 'none', visibilityBeforeHold: 'passport' })),
      'owner lifts a hold',
    );
    await denied(
      setDocument(PLAYER, path, item({ moderationState: 'restricted', rightsState: 'restricted' })),
      'owner clears hold snapshot',
    );

    await seed(`userSafety/${PLAYER}`, { ageBand: '13-17', guardianStatus: 'approved', scopes: [], consentExpiresAt: null });
    await seed(path, item({}));
    await denied(
      setDocument(PLAYER, path, item({ visibility: 'passport', rightsState: 'user_confirmed' })),
      'minor without public_media scope',
    );
    await allowed(
      setDocument(PLAYER, path, item({ visibility: 'grant', rightsState: 'user_confirmed' })),
      'minor shares with one scout',
    );
    await seed(`userSafety/${PLAYER}`, { ageBand: '13-17', guardianStatus: 'approved', scopes: ['public_media'], consentExpiresAt: null });
    await allowed(
      setDocument(PLAYER, path, item({ visibility: 'passport', rightsState: 'user_confirmed' })),
      'minor with guardian scope',
    );
  });

  test('reels are owner-managed; grants cannot be self-addressed; exports are server-only', async () => {
    const reel = {
      id: 'r1', ownerId: PLAYER, preset: 'scout', mode: 'scout', segments: [], title: 'Reel',
      coverMediaId: null, aspectRatio: '9:16', privacy: 'private', status: 'draft',
      aiSuggestions: [], quality: { notes: [] }, version: 1, createdAt: '2026-10-01', updatedAt: '2026-10-01',
    };
    await allowed(setDocument(PLAYER, 'reels/r1', reel), 'owner creates reel');
    await denied(setDocument(OUTSIDER, 'reels/r1', { ...reel, ownerId: OUTSIDER }), 'takeover reel');
    await allowed(
      setDocument(PLAYER, 'mediaGrants/g1', {
        ownerId: PLAYER, granteeId: SCOUT, mediaId: 'm1', expiresAt: '2026-12-01T00:00:00.000Z',
      }),
      'share with scout',
    );
    await denied(
      setDocument(PLAYER, 'mediaGrants/g2', {
        ownerId: PLAYER, granteeId: PLAYER, mediaId: 'm1', expiresAt: '2026-12-01T00:00:00.000Z',
      }),
      'self grant',
    );
    await denied(setDocument(PLAYER, 'reelExports/e1', { ownerId: PLAYER, reelId: 'r1', status: 'ready' }), 'client forges export');
  });
});

describe('career snapshots and coach observations', () => {
  test('year-in-review snapshots are immutable after create', async () => {
    await allowed(
      setDocument(PLAYER, `careerSnapshots/${PLAYER}-2026`, {
        playerId: PLAYER,
        year: 2026,
        narrative: { text: 'Year 2026: 1 logged match.', label: 'generated_from_records' },
      }),
      'owner creates snapshot',
    );
    await denied(
      setDocument(PLAYER, `careerSnapshots/${PLAYER}-2026`, {
        playerId: PLAYER,
        year: 2026,
        narrative: { text: 'invented', label: 'generated_from_records' },
      }),
      'mutate snapshot',
    );
  });

  test('only a coach claim can write observations with coach_provided provenance', async () => {
    await denied(
      setDocument(PLAYER, 'coachObservations/o1', {
        coachId: PLAYER, playerId: PLAYER, body: 'note', provenance: 'coach_provided',
      }),
      'player poses as coach',
    );
    await allowed(
      setDocument(COACH, 'coachObservations/o1', {
        coachId: COACH, playerId: PLAYER, body: 'Hold the line', provenance: 'coach_provided',
      }),
      'coach writes observation',
    );
    await denied(getDocument(OUTSIDER, 'coachObservations/o1'), 'outsider reads observation');
  });

  test('coach roster writes require a coach claim and stay owner-only', async () => {
    await denied(
      setDocument(SCOUT, `coachRosters/${SCOUT}`, { coachId: SCOUT, players: [] }),
      'scout writes roster',
    );
    await allowed(
      setDocument(COACH, `coachRosters/${COACH}`, { coachId: COACH, players: [] }),
      'coach writes roster',
    );
    await denied(getDocument(PLAYER, `coachRosters/${COACH}`), 'player reads roster');
    await allowed(
      setDocument(COACH, `coachRosters/${COACH}`, { coachId: COACH, players: [], playerIds: [] }),
      'coach writes roster with player index',
    );
    await denied(
      setDocument(COACH, `coachRosters/${COACH}`, { coachId: COACH, players: [], playerIds: 'p1' }),
      'player index must be a list',
    );
  });
});

describe('scout intelligence collections', () => {
  test('watchlist events and evidence requests are not client-created', async () => {
    await denied(
      setDocument(SCOUT, 'watchlistEvents/w1', { scoutId: SCOUT, playerId: PLAYER, type: 'added' }),
      'client watchlist write',
    );
    await denied(
      setDocument(SCOUT, 'evidenceRequests/e1', {
        scoutId: SCOUT, playerId: PLAYER, kinds: ['highlight'], status: 'pending',
      }),
      'client evidence request create',
    );
    await seed('watchlistEvents/w1', { scoutId: SCOUT, playerId: PLAYER, type: 'added' });
    await allowed(getDocument(SCOUT, 'watchlistEvents/w1'), 'scout reads own event');
    await denied(getDocument(PLAYER, 'watchlistEvents/w1'), 'player reads scout event');
  });

  test('a player may decline a pending evidence request; fulfilment is server-only', async () => {
    await seed('evidenceRequests/e1', {
      scoutId: SCOUT, playerId: PLAYER, kinds: ['highlight'], status: 'pending', updatedAt: 't0',
    });
    await denied(
      setDocument(PLAYER, 'evidenceRequests/e1', {
        scoutId: SCOUT, playerId: PLAYER, kinds: ['highlight'], status: 'fulfilled', updatedAt: 't1',
      }),
      'client marks fulfilled without attachments',
    );
    await denied(
      setDocument(PLAYER, 'evidenceRequests/e1', {
        scoutId: PLAYER, playerId: PLAYER, kinds: ['gps'], status: 'declined', updatedAt: 't2',
      }),
      'player rewrites scout',
    );
    await denied(
      setDocument(SCOUT, 'evidenceRequests/e1', {
        scoutId: SCOUT, playerId: PLAYER, kinds: ['highlight'], status: 'declined', updatedAt: 't2',
      }),
      'scout declines on behalf of player',
    );
    await allowed(
      setDocument(PLAYER, 'evidenceRequests/e1', {
        scoutId: SCOUT, playerId: PLAYER, kinds: ['highlight'], status: 'declined', updatedAt: 't3',
      }),
      'player declines',
    );
    await denied(
      setDocument(PLAYER, 'evidenceRequests/e1', {
        scoutId: SCOUT, playerId: PLAYER, kinds: ['highlight'], status: 'declined', updatedAt: 't4',
      }),
      'closed request cannot change again',
    );
  });

  test('trial reflections stay private to the player', async () => {
    await allowed(
      setDocument(PLAYER, `players/${PLAYER}/trialReflections/t1`, {
        ownerId: PLAYER, trialId: 't1', wentWell: 'press', improve: 'final ball',
      }),
      'owner writes reflection',
    );
    await denied(getDocument(SCOUT, `players/${PLAYER}/trialReflections/t1`), 'scout reads reflection');
  });

  test('recruitment entry subcollection is owner-only', async () => {
    await allowed(
      setDocument(SCOUT, `recruitmentWorkspaces/${SCOUT}/entries/${PLAYER}`, {
        scoutId: SCOUT, playerId: PLAYER, stage: 'discovered',
      }),
      'scout writes entry',
    );
    await denied(
      setDocument(PLAYER, `recruitmentWorkspaces/${SCOUT}/entries/${PLAYER}`, {
        scoutId: SCOUT, playerId: PLAYER, stage: 'evaluated',
      }),
      'player writes scout entry',
    );
  });
});

describe('content reports', () => {
  test('reporters can create but nobody can read client-side, including the author', async () => {
    await allowed(
      setDocument(PLAYER, 'contentReports/cr1', {
        reporterId: PLAYER,
        targetType: 'user',
        targetId: OTHER_PLAYER,
        targetOwnerId: OTHER_PLAYER,
        reason: 'spam',
        createdAt: '2026-10-06T00:00:00.000Z',
      }),
      'owner files a report',
    );
    await denied(getDocument(PLAYER, 'contentReports/cr1'), 'reporter reads own report');
    await denied(getDocument(OTHER_PLAYER, 'contentReports/cr1'), 'target reads report');
    await denied(getDocument(SCOUT, 'contentReports/cr1'), 'scout reads report');
    await denied(
      setDocument(OTHER_PLAYER, 'contentReports/cr2', {
        reporterId: PLAYER,
        targetType: 'user',
        targetId: PLAYER,
        targetOwnerId: PLAYER,
        reason: 'spam',
        createdAt: '2026-10-06T00:00:00.000Z',
      }),
      'cannot file as someone else',
    );
  });

  test('every report names the owner of the reported content', async () => {
    const base = {
      reporterId: PLAYER,
      reason: 'spam',
      createdAt: '2026-10-06T00:00:00.000Z',
    };
    await allowed(
      setDocument(PLAYER, 'contentReports/cr3', {
        ...base,
        targetType: 'post',
        targetId: 'post-123',
        targetOwnerId: OTHER_PLAYER,
      }),
      'post report with owner',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr4', { ...base, targetType: 'post', targetId: 'post-123' }),
      'post report without owner',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr5', {
        ...base,
        targetType: 'user',
        targetId: OTHER_PLAYER,
        targetOwnerId: SCOUT,
      }),
      'user report owner must equal target',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr6', {
        ...base,
        targetType: 'user',
        targetId: OTHER_PLAYER,
        targetOwnerId: OTHER_PLAYER,
        extra: 'field',
      }),
      'unknown fields rejected',
    );
  });

  test('expanded targets and reasons; no self-reports; server owns cases', async () => {
    const base = { reporterId: PLAYER, createdAt: '2026-10-06T00:00:00.000Z' };
    await allowed(
      setDocument(PLAYER, 'contentReports/cr7', {
        ...base, targetType: 'media', targetId: 'm1', targetOwnerId: OTHER_PLAYER, reason: 'appears_in_video',
      }),
      'I appear in this video',
    );
    await allowed(
      setDocument(PLAYER, 'contentReports/cr8', {
        ...base, targetType: 'trial', targetId: 't1', targetOwnerId: SCOUT, reason: 'inappropriate_contact',
      }),
      'report a trial invitation',
    );
    await allowed(
      setDocument(PLAYER, 'contentReports/cr9', {
        ...base, targetType: 'passport', targetId: OTHER_PLAYER, targetOwnerId: OTHER_PLAYER, reason: 'minor_in_video',
      }),
      'passport report targets the owner',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr10', {
        ...base, targetType: 'passport', targetId: OTHER_PLAYER, targetOwnerId: SCOUT, reason: 'privacy',
      }),
      'passport owner mismatch',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr11', {
        ...base, targetType: 'media', targetId: 'm1', targetOwnerId: OTHER_PLAYER, reason: 'made_up',
      }),
      'unknown reason',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr12', {
        ...base, targetType: 'media', targetId: 'm1', targetOwnerId: PLAYER, reason: 'spam',
      }),
      'self report',
    );
    await denied(
      setDocument(PLAYER, 'contentReports/cr13', {
        ...base, targetType: 'media', targetId: 'm1', targetOwnerId: OTHER_PLAYER, reason: 'spam', caseId: 'c1',
      }),
      'client sets caseId',
    );
  });
});

describe('moderation workflow', () => {
  test('cases, actions, holds, appeals, restrictions and audit log are server-only', async () => {
    for (const path of [
      'moderationCases/c1',
      'moderationActions/a1',
      'moderationHolds/media_m1',
      'appeals/c1',
      `accountRestrictions/${PLAYER}`,
      'adminAuditLog/l1',
      'publicReportLimits/k1',
      'publicReporterContacts/r1',
    ]) {
      await seed(path, { ownerId: PLAYER, targetOwnerId: PLAYER });
      await denied(getDocument(PLAYER, path), `read ${path}`);
      await denied(setDocument(PLAYER, path, { ownerId: PLAYER }), `write ${path}`);
    }
  });

  test('users read only their own moderation notices', async () => {
    await seed(`moderationNotices/${PLAYER}/items/c1`, { caseId: 'c1', action: 'remove', at: '2026-10-07' });
    await allowed(getDocument(PLAYER, `moderationNotices/${PLAYER}/items/c1`), 'owner reads notice');
    await denied(getDocument(OTHER_PLAYER, `moderationNotices/${PLAYER}/items/c1`), 'other reads notice');
    await denied(
      setDocument(PLAYER, `moderationNotices/${PLAYER}/items/c1`, { caseId: 'c1', action: 'dismiss', at: 'x' }),
      'owner rewrites notice',
    );
  });
});

describe('notification preferences', () => {
  const valid = {
    pushEnabled: true,
    categories: { trial: true, passport: false },
    updatedAt: '2026-10-06T00:00:00.000Z',
  };

  test('only the owner can read and write their preferences', async () => {
    await allowed(setDocument(PLAYER, 'notificationPreferences/' + PLAYER, valid), 'owner writes');
    await allowed(getDocument(PLAYER, 'notificationPreferences/' + PLAYER), 'owner reads');
    await denied(getDocument(SCOUT, 'notificationPreferences/' + PLAYER), 'other user reads');
    await denied(setDocument(SCOUT, 'notificationPreferences/' + PLAYER, valid), 'other user writes');
  });

  test('the shape is validated', async () => {
    await denied(
      setDocument(PLAYER, 'notificationPreferences/' + PLAYER, {
        ...valid,
        categories: { marketing: true },
      }),
      'unknown category',
    );
    await denied(
      setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, pushEnabled: 'yes' }),
      'non-boolean flag',
    );
    await allowed(
      setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, lockScreenPreview: 'generic' }),
      'lock-screen preview choice',
    );
    await denied(
      setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, lockScreenPreview: 'everything' }),
      'unknown lock-screen preview value',
    );
  });

  test('quiet hours are validated', async () => {
    const quietHours = { enabled: true, startMinute: 1320, endMinute: 420, utcOffsetMinutes: 60 };
    await allowed(setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, quietHours }), 'valid quiet hours');
    await denied(setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, quietHours: { ...quietHours, startMinute: 1440 } }),
      'minute out of range');
    await denied(setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, quietHours: { ...quietHours, extra: 1 } }),
      'unknown quiet-hours key');
    await denied(setDocument(PLAYER, 'notificationPreferences/' + PLAYER, { ...valid, quietHours: { ...quietHours, utcOffsetMinutes: 900 } }),
      'impossible UTC offset');
  });
});
