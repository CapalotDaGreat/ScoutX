#!/usr/bin/env node
/**
 * Seeds the local Firebase emulators for authenticated E2E runs.
 * Refuses to run unless every Admin SDK target points at a local emulator.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const accounts = JSON.parse(fs.readFileSync(new URL('../e2e/fixtures/accounts.json', import.meta.url), 'utf8'));
const PROJECT_ID = accounts.projectId;

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';

for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  const host = process.env[key] ?? '';
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    throw new Error(`${key} must point at a local emulator, got "${host}"`);
  }
}
if (!PROJECT_ID.startsWith('demo-')) {
  throw new Error('Seeding is only allowed for demo-* projects');
}

const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp({ projectId: PROJECT_ID });
}
const auth = getAuth();
const db = getFirestore();

async function clearEmulators() {
  const firestore = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  const authReset = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
    { method: 'DELETE' },
  );
  if (!firestore.ok || !authReset.ok) {
    throw new Error(`Emulator reset failed (firestore ${firestore.status}, auth ${authReset.status})`);
  }
}

async function createAccount({ email, name, role }) {
  const user = await auth.createUser({ email, password: accounts.password, displayName: name, emailVerified: true });
  await auth.setCustomUserClaims(user.uid, { role });
  const now = new Date().toISOString();
  await db.collection('users').doc(user.uid).set({
    uid: user.uid,
    name,
    email,
    role,
    isAnonymous: false,
    createdAt: now,
    updatedAt: now,
  });
  // Seeded test accounts are adults so flows start past the age gate.
  await db.collection('userSafety').doc(user.uid).set({
    ageBand: '18plus',
    guardianStatus: 'not_required',
    scopes: [],
    consentExpiresAt: null,
    updatedAt: now,
  });
  return user.uid;
}

async function waitFor(label, check, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function main() {
  await clearEmulators();

  const seeded = accounts.seededPlayer;
  const playerId = await createAccount({ email: seeded.email, name: seeded.name, role: 'player' });
  const now = new Date().toISOString();
  await db.collection('profiles').doc(playerId).set({
    fullName: seeded.name,
    position: 'CM',
    club: seeded.club,
    nationality: 'Switzerland',
    preferredFoot: 'right',
    biography: 'Box-to-box midfielder.',
    username: seeded.username,
    identity: {
      currentClub: seeded.club,
      preferredPositions: ['CM'],
      secondaryPositions: [],
      strongFoot: 'right',
      // Not a public identity key: must never reach the public Passport.
      privateNotes: seeded.privateBiographyMarker,
      phone: seeded.phone,
    },
    privacy: {
      publicPortfolioEnabled: true,
      discoverableByScouts: true,
      showCareerTimeline: true,
      showStatistics: true,
      showVideos: true,
      showAchievements: true,
      showRecommendations: true,
      showGpsHighlights: false,
      showPerformanceCharts: true,
      allowSocialPostsInFeed: false,
    },
    statisticsMatches: [
      {
        id: 'seed-match-1',
        date: '2026-09-27',
        opponent: 'FC Seedorf',
        competition: 'League',
        result: 'W',
        position: 'CM',
        minutes: 90,
        goals: 1,
        assists: 1,
        cleanSheet: false,
        passAccuracy: null,
        shots: null,
        tackles: null,
        yellowCards: 0,
        redCards: 0,
        matchRating: null,
        notes: '',
      },
    ],
    createdAt: now,
    updatedAt: now,
  });
  await db.collection('portfolioSlugs').doc(seeded.username).set({ playerId, createdAt: now });

  const scoutId = await createAccount({ email: accounts.scout.email, name: accounts.scout.name, role: 'scout' });

  await waitFor('public passport projection', async () =>
    (await db.collection('publicPassports').doc(playerId).get()).exists,
  );

  fs.writeFileSync(
    new URL('../e2e/.seed-state.json', import.meta.url),
    JSON.stringify({ playerId, scoutId }, null, 2),
  );
  console.log(`Seeded emulators: player ${playerId}, scout ${scoutId}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
