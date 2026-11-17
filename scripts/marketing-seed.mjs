#!/usr/bin/env node
/**
 * Website screenshot fixture: adds fictional, adult demonstration players to the LOCAL demo emulators after
 * `scripts/seed-emulators.mjs`. Same guards as that script: refuses anything but local emulator hosts and a demo-*
 * project. No production access, no real people, no minors, no footage. Every match line is self-reported
 * demonstration data and is labelled as such wherever the captures are used.
 *
 *   node scripts/seed-emulators.mjs && node scripts/marketing-seed.mjs
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const accounts = JSON.parse(fs.readFileSync(new URL('../e2e/fixtures/accounts.json', import.meta.url), 'utf8'));
const fixture = JSON.parse(fs.readFileSync(new URL('../e2e/fixtures/marketing-demo.json', import.meta.url), 'utf8'));
const PROJECT_ID = accounts.projectId;

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env[key] ?? '')) throw new Error(`${key} must point at a local emulator`);
}
if (!PROJECT_ID.startsWith('demo-')) throw new Error('Seeding is only allowed for demo-* projects');

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { LEGAL_VERSIONS } = require('../functions/lib/legal/legalVersions.generated.js');
if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();
const now = new Date().toISOString();

async function account(p) {
  const user = await auth.createUser({ email: p.email, password: accounts.password, displayName: p.name, emailVerified: true });
  await auth.setCustomUserClaims(user.uid, { role: 'player' });
  await db.collection('users').doc(user.uid).set({ uid: user.uid, name: p.name, email: p.email, role: 'player', isAnonymous: false, createdAt: now, updatedAt: now });
  await db.collection('userSafety').doc(user.uid).set({ ageBand: '18plus', guardianStatus: 'not_required', scopes: [], consentExpiresAt: null, updatedAt: now });
  const ok = (id) => ({ status: 'granted', documentId: id, version: LEGAL_VERSIONS[id], locale: 'en', at: now });
  await db.collection('consentRecords').doc(user.uid).set({ uid: user.uid, consents: {
    terms_of_service: ok('terms-of-service'), privacy_policy: ok('privacy-policy'), community_guidelines: ok('community-guidelines') }, updatedAt: now });
  return user.uid;
}

const match = (m, i, position) => ({ id: `demo-match-${i + 1}`, date: m.date, opponent: m.opponent, competition: m.competition,
  result: m.result, position, minutes: m.minutes, goals: m.goals, assists: m.assists, cleanSheet: false, passAccuracy: null,
  shots: null, tackles: null, yellowCards: 0, redCards: 0, matchRating: null, notes: '' });

const ids = {};
for (const p of fixture.players) {
  const uid = await account(p);
  ids[p.username] = uid;
  await db.collection('profiles').doc(uid).set({
    fullName: p.name, position: p.position, club: p.club, nationality: p.nationality, preferredFoot: p.foot,
    biography: p.biography, username: p.username,
    identity: { currentClub: p.club, preferredPositions: [p.position], secondaryPositions: p.secondary ?? [], strongFoot: p.foot },
    privacy: { publicPortfolioEnabled: true, discoverableByScouts: true, showCareerTimeline: true, showStatistics: true, showVideos: true,
      showAchievements: true, showRecommendations: true, showGpsHighlights: false, showPerformanceCharts: true, allowSocialPostsInFeed: false },
    statisticsMatches: (p.matches ?? []).map((m, i) => match(m, i, p.position)),
    createdAt: now, updatedAt: now,
  });
  await db.collection('portfolioSlugs').doc(p.username).set({ playerId: uid, createdAt: now });
  for (const [i, g] of (p.goals ?? []).entries()) {
    const id = `demo-goal-${i + 1}`;
    await db.collection('players').doc(uid).collection('developmentGoals').doc(id).set({
      id, ownerId: uid, title: g.title, category: g.category, metricKey: 'none', positionRelevance: [p.position], baseline: null,
      targetValue: null, targetLabel: g.target, timeframeEnd: g.until, status: g.status, progress: [], linkedMatchIds: [],
      linkedTrainingIds: [], evidenceIds: [], practiceSuggestions: [], reflection: g.reflection ?? '', origin: 'manual',
      createdAt: now, updatedAt: now, achievedAt: null });
  }
}

async function waitFor(label, check, ms = 60_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await check()) return; await new Promise((r) => setTimeout(r, 500)); }
  throw new Error(`Timed out waiting for ${label}`);
}
for (const [username, uid] of Object.entries(ids)) {
  await waitFor(`${username} projections`, async () => (await db.collection('publicPassports').doc(uid).get()).exists
    && (await db.collection('discoverablePlayers').doc(uid).get()).get('_search.version') === 1);
}
fs.writeFileSync(new URL('../e2e/.marketing-seed-state.json', import.meta.url), JSON.stringify(ids, null, 2));
console.log(`Marketing demo players seeded: ${Object.keys(ids).join(', ')}`);
