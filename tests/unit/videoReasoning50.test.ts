import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_CLIP_SEC, buildReasoningMessages, clipWindow, frameTimes, reasoningGate, validateReasoning, type ReasoningContext,
} from '../../functions/src/analysis/videoReasoning.ts';
import { explainMoment } from '../../functions/src/analysis/trackingReasoning.ts';

type Firestore = Parameters<typeof explainMoment>[4]['db'];
import { parseOffballSequences } from '../../functions/src/analysis/trackingV3.ts';

const moment = { id: 'd_360', kind: 'sighting', kinds: ['sighting'], start: 36, end: 36, clipStart: 31, clipEnd: 40,
  identityState: 'CONFIRMED_VISIBLE', candidate: false, evidence: 'number_read', indicator: [[36, 0.4, 0.3, 0.05, 0.2]] } as never;
const ON = { VIDEO_REASONING_ENABLED: 'true' };
const consent = { providers: ['openrouter_zdr'], revokedAt: null, current: true };

test('5.0 reasoning gate: every condition is required, in order, and nothing is sent when one fails', () => {
  const ok = { env: ON, footageApproved: true, aiConsent: true, videoConsent: consent, moment };
  assert.deepEqual(reasoningGate(ok), { ok: true });
  assert.equal((reasoningGate({ ...ok, env: {} }) as { reason: string }).reason, 'disabled');
  assert.equal((reasoningGate({ ...ok, footageApproved: false }) as { reason: string }).reason, 'footage_not_approved');
  assert.equal((reasoningGate({ ...ok, aiConsent: false }) as { reason: string }).reason, 'ai_consent_required');
  assert.equal((reasoningGate({ ...ok, videoConsent: { ...consent, providers: ['pitchproof_cloud'] } }) as { reason: string }).reason, 'provider_not_consented');
  assert.equal((reasoningGate({ ...ok, videoConsent: { ...consent, revokedAt: '2026-10-27' } }) as { reason: string }).reason, 'provider_not_consented');
  assert.equal((reasoningGate({ ...ok, moment: { ...(moment as object), identityState: 'LIKELY_VISIBLE' } as never }) as { reason: string }).reason,
    'moment_not_confirmed');
});

test('5.0 clip window is bounded and frames are spread inside it', () => {
  const w = clipWindow({ clipStart: 100, clipEnd: 160, start: 130, end: 131 });
  assert.equal(w.end - w.start, MAX_CLIP_SEC);
  assert.ok(w.start <= 130 && w.end >= 131);
  const ts = frameTimes({ start: 31, end: 40 }, 6);
  assert.equal(ts.length, 6);
  assert.ok(ts.every((t) => t > 31 && t < 40));
});

const ctx: ReasoningContext = { number: '20', kit: 'orange', position: 'winger', kind: 'explain', clip: { start: 31, end: 40 },
  frames: [{ id: 'f0', t: 32 }, { id: 'f1', t: 35 }, { id: 'f2', t: 38 }], facts: ['x'] };

test('5.0 reasoning output validation rejects invented numbers, unsupported claims and unknown frames', () => {
  const good = JSON.stringify({ observation: 'You move towards the touchline as the defender steps in at 0:35.',
    interpretation: 'Staying wider may keep a passing line open.', evidenceFrames: ['f1', 'f2'], confidence: 'partial',
    limitations: ['The ball is not visible in f2.'], suggestion: 'Check your shoulder before moving.' });
  const v = validateReasoning(good, ctx);
  assert.ok(v.ok);
  if (v.ok) assert.deepEqual(v.answer.evidence.map((e) => e.t), [35, 38]);
  const bad = (o: Record<string, unknown>) => validateReasoning(JSON.stringify({ observation: 'You run.', evidenceFrames: ['f0'], ...o }), ctx);
  assert.equal((bad({ observation: 'You ran 12 metres.' }) as { reason: string }).reason, 'unsupported_claim');
  assert.equal((bad({ observation: 'You beat 3 players.' }) as { reason: string }).reason, 'unsupported_number');
  assert.equal((bad({ observation: 'Number 17 passes to you.' }) as { reason: string }).reason, 'unsupported_number');
  assert.equal((bad({ interpretation: 'This led to the goal.' }) as { reason: string }).reason, 'unsupported_claim');
  assert.equal((bad({ evidenceFrames: ['f9'] }) as { reason: string }).reason, 'unknown_frame');
  assert.equal((validateReasoning('not json', ctx) as { reason: string }).reason, 'not_json');
  const noEvidence = validateReasoning(JSON.stringify({ observation: '#20 is outlined.', confidence: 'clear' }), ctx);
  assert.ok(noEvidence.ok && noEvidence.answer.confidence === 'unclear', 'no cited frame -> never "clear"');
  const msgs = buildReasoningMessages(ctx, ['AAAA']);
  assert.match(String(msgs[0].content), /Never state numbers/);
});

function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const data = new Map<string, Record<string, unknown>>(Object.entries(structuredClone(seed)));
  const snap = (path: string) => ({ exists: data.has(path), data: () => structuredClone(data.get(path)), get: (k: string) => data.get(path)?.[k] });
  const docRef = (path: string): unknown => ({ path, collection: (n: string) => collectionRef(`${path}/${n}`), get: async () => snap(path),
    set: async (v: Record<string, unknown>) => { data.set(path, structuredClone(v)); } });
  const collectionRef = (path: string) => ({ doc: (id: string) => docRef(`${path}/${id}`) });
  return { db: { collection: collectionRef } as unknown as Firestore, data };
}

test('5.0 explainMoment: gated, cached per report version, rejected answers never returned', async () => {
  const { VIDEO_CONSENT_VERSION } = await import('../../functions/src/analysis/videoConsent.ts');
  const report = { target: { number: '20', kit: 'orange', position: 'winger', kit2: '' }, moments: [moment], offball: null };
  const seed = {
    'matchAnalysisJobs/job_1': { playerId: 'u1', videoStoragePath: 'profiles/u1/matchFootage/job_1/v.mov' },
    'matchAnalysisJobs/job_1/tracking/current': { report, version: 4, stale: false },
    'videoProcessingConsents/job_1': { uid: 'u1', providers: ['openrouter_zdr'], revokedAt: null, policyVersion: VIDEO_CONSENT_VERSION },
  };
  let chats = 0;
  let framesAsked = 0;
  const deps = (db: Firestore, content: string, env: NodeJS.ProcessEnv = { ...ON, FUNCTIONS_EMULATOR: 'true' }) => ({
    db, env, aiConsent: async () => true, now: () => '2026-10-27T12:00:00Z', sourceUrl: async () => 'https://signed/v.mov',
    frames: async () => { framesAsked += 1; return { frames: [{ id: 'f0', t: 32, jpegBase64: 'AAAA' }, { id: 'f1', t: 35, jpegBase64: 'BBBB' }] }; },
    chat: async () => { chats += 1; return { ok: true as const, content }; },
  });
  const good = JSON.stringify({ observation: 'You hold your width near the touchline.', interpretation: 'That can stretch the defence.',
    evidenceFrames: ['f0'], confidence: 'partial', limitations: [], suggestion: 'Scan before receiving.' });
  const a = fakeDb(seed);
  const off = await explainMoment('u1', 'job_1', 'd_360', 'explain', deps(a.db, good, { FUNCTIONS_EMULATOR: 'true' }));
  assert.deepEqual(off, { status: 'unavailable', reason: 'disabled' });
  assert.equal(framesAsked + chats, 0, 'a closed gate sends nothing anywhere');
  await assert.rejects(explainMoment('intruder', 'job_1', 'd_360', 'explain', deps(a.db, good)), /owner/);
  const r1 = await explainMoment('u1', 'job_1', 'd_360', 'explain', deps(a.db, good));
  assert.equal(r1.status, 'answered');
  const r2 = await explainMoment('u1', 'job_1', 'd_360', 'explain', deps(a.db, good));
  assert.ok(r2.status === 'answered' && r2.cached);
  assert.equal(chats, 1, 'second ask served from cache');
  const stored = [...a.data.entries()].find(([k]) => k.includes('/tracking/r_4_d_360_explain'));
  assert.ok(stored && !JSON.stringify(stored[1]).includes('AAAA'), 'frames are never stored');
  const b = fakeDb(seed);
  const rej = await explainMoment('u1', 'job_1', 'd_360', 'alternatives', deps(b.db, JSON.stringify({ observation: 'You scored a goal.', evidenceFrames: ['f0'] })));
  assert.deepEqual(rej, { status: 'rejected', reason: 'unsupported_claim' });
  const c = fakeDb({ ...seed, 'videoProcessingConsents/job_1': { ...seed['videoProcessingConsents/job_1'], providers: ['pitchproof_cloud'] } });
  assert.deepEqual(await explainMoment('u1', 'job_1', 'd_360', 'explain', deps(c.db, good)), { status: 'unavailable', reason: 'provider_not_consented' });
});

test('5.0 off-ball sequences are kept only inside confirmed identity time and when long enough', () => {
  const strip: Array<[number, number, 'CONFIRMED_VISIBLE' | 'LIKELY_VISIBLE']> = [[10, 15, 'CONFIRMED_VISIBLE'], [15, 19, 'CONFIRMED_VISIBLE'], [19, 30, 'LIKELY_VISIBLE']];
  const seq = (start: number, end: number, kind = 'free') => ({ start, end, kind, measuredSec: 6, nearestOpponentMedianBH: 3.4, freeShare: 0.8, tightShare: 0 });
  const out = parseOffballSequences([seq(10.2, 18.5), seq(18, 26), seq(11, 14), seq(10, 17, 'bogus')], strip as never);
  assert.deepEqual(out.map((q) => [q.start, q.end]), [[10.2, 18.5]]);
});
