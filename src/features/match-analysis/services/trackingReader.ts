/** One poll loop per signed-in user and job. No Firestore fallback and no disk cache. */
import { TRACKING_STORAGE_ENCODING, decodeTrackingStorage } from './trackingStorage';

export const TRACKING_READ_INTERVAL_MS = 15000;
/** A final report can still change on another device or in the worker. Check it, but not every 15 seconds. */
export const TRACKING_FINAL_INTERVAL_MS = 180_000;
const UPDATE_TOKEN = /^\d{1,16}\.\d{9}$/;
const ACTIVE_FOLLOW_UP = new Set(['scheduled', 'running']);
export type TrackingSlot = 'current' | 'discovery';
export type TrackingPollRequest = {
  jobId: string;
  readerEncoding: typeof TRACKING_STORAGE_ENCODING;
  documents: TrackingSlot[];
  since?: { current?: string; discovery?: string };
};
type Doc = Record<string, unknown>;
type Timer = ReturnType<typeof setTimeout>;
type Timers = { schedule: (fn: () => void, delay: number) => Timer; cancel: (id: Timer) => void };
const defaultTimers: Timers = { schedule: (fn, delay) => setTimeout(fn, delay), cancel: (id) => clearTimeout(id) };

/** A full report with no pending publish and no queued follow-up is quiet, not frozen. */
export function trackingReportIsFinal(current: Doc | null): boolean {
  if (!current || current.scope !== 'full' || current.stale !== false || current.pendingReason) return false;
  const follow = current.followUp;
  if (follow == null) return true;
  if (typeof follow !== 'object' || Array.isArray(follow)) return false;
  const status = (follow as { status?: unknown }).status;
  return typeof status === 'string' && !ACTIVE_FOLLOW_UP.has(status);
}

/** Auth and permission failures must drop the previous account's report. Transport failures must not. */
export function trackingReadClearsValue(error: unknown): boolean {
  const raw = typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : '';
  const code = raw.replace(/^functions\//, '');
  return code === 'unauthenticated' || code === 'permission-denied';
}

function tokenOf(value: unknown): string | undefined {
  return typeof value === 'string' && UPDATE_TOKEN.test(value) ? value : undefined;
}

type Sub = { slot: TrackingSlot; onChange: (doc: Doc | null) => void; onError?: (error: Error) => void };
type Session = {
  key: string; jobId: string; read: (request: TrackingPollRequest) => Promise<unknown>; timers: Timers; subs: Set<Sub>;
  cache: { current: Doc | null; discovery: Doc | null }; seen: { current: boolean; discovery: boolean };
  tokens: { current?: string; discovery?: string };
  failures: number; generation: number; inflight: boolean; inflightDocuments: TrackingSlot[]; kickQueued: boolean;
  rerun: boolean; pace: 'live' | 'final'; ignoreFinalUntilChange: boolean; finalToken: string; timer?: Timer;
};
const sessions = new Map<string, Session>();

function orderedSlots(session: Session): TrackingSlot[] {
  const wanted = new Set<TrackingSlot>();
  for (const sub of session.subs) wanted.add(sub.slot);
  return (['current', 'discovery'] as const).filter((slot) => wanted.has(slot));
}

function notify(session: Session, slot: TrackingSlot): void {
  const value = session.cache[slot];
  for (const sub of [...session.subs]) if (sub.slot === slot) sub.onChange(value);
}

function applyResponse(session: Session, raw: unknown, documents: TrackingSlot[]): void {
  const body = raw as { readerEncoding?: unknown; unchanged?: Partial<Record<TrackingSlot, unknown>>;
    updateTime?: Partial<Record<TrackingSlot, unknown>> } | null;
  if (!body || body.readerEncoding !== TRACKING_STORAGE_ENCODING) throw new Error('Compatible tracking reader response required');
  const unchanged = body.unchanged ?? {};
  const updateTime = body.updateTime ?? {};
  const cache = { ...session.cache };
  const seen = { ...session.seen };
  const tokens = { ...session.tokens };
  const delivered: TrackingSlot[] = [];
  for (const slot of documents) {
    if (unchanged[slot] === true) {
      if (!seen[slot]) throw new Error('Tracking read was unchanged before the first copy');
      continue;
    }
    if (!(slot in (body as object))) throw new Error('Compatible tracking reader response required');
    const value = (body as Record<string, unknown>)[slot];
    cache[slot] = value === null ? null : decodeTrackingStorage(value);
    seen[slot] = true;
    const token = tokenOf(updateTime[slot]);
    if (token) tokens[slot] = token;
    else delete tokens[slot];
    delivered.push(slot);
  }
  session.cache = cache;
  session.seen = seen;
  session.tokens = tokens;
  for (const slot of delivered) notify(session, slot);
  if (!documents.includes('current') || !session.seen.current) { session.pace = 'live'; return; }
  const token = session.tokens.current ?? '';
  if (session.ignoreFinalUntilChange && (token !== session.finalToken || !trackingReportIsFinal(session.cache.current))) {
    session.ignoreFinalUntilChange = false;
  }
  if (!session.ignoreFinalUntilChange && trackingReportIsFinal(session.cache.current)) {
    session.pace = 'final';
    session.finalToken = token;
  } else session.pace = 'live';
}

async function pollSession(session: Session): Promise<void> {
  if (session.subs.size === 0) return;
  const generation = session.generation;
  const documents = orderedSlots(session);
  const since: NonNullable<TrackingPollRequest['since']> = {};
  for (const slot of documents) {
    const token = session.tokens[slot];
    if (session.seen[slot] && token) since[slot] = token;
  }
  session.inflight = true;
  session.inflightDocuments = documents;
  try {
    const raw = await session.read({ jobId: session.jobId, readerEncoding: TRACKING_STORAGE_ENCODING, documents,
      ...(Object.keys(since).length > 0 ? { since } : {}) });
    if (generation !== session.generation || session.subs.size === 0) return;
    applyResponse(session, raw, documents);
    session.failures = 0;
  } catch (error) {
    if (generation !== session.generation || session.subs.size === 0) return;
    const err = error instanceof Error ? error : new Error('Tracking read failed');
    session.failures = Math.min(session.failures + 1, 5);
    if (trackingReadClearsValue(err)) {
      for (const slot of documents) {
        session.cache[slot] = null;
        session.seen[slot] = false;
        delete session.tokens[slot];
        notify(session, slot);
      }
    }
    for (const sub of [...session.subs]) if (documents.includes(sub.slot)) sub.onError?.(err);
  } finally {
    session.inflight = false;
    session.inflightDocuments = [];
    if (generation !== session.generation || session.subs.size === 0) return;
    if (session.rerun) {
      session.rerun = false;
      kick(session);
      return;
    }
    const delay = session.failures > 0
      ? Math.min(300000, TRACKING_READ_INTERVAL_MS * 2 ** session.failures)
      : session.pace === 'final' ? TRACKING_FINAL_INTERVAL_MS : TRACKING_READ_INTERVAL_MS;
    session.timer = session.timers.schedule(() => { session.timer = undefined; void pollSession(session); }, delay);
  }
}

function kick(session: Session): void {
  if (session.inflight || session.kickQueued || session.subs.size === 0) return;
  session.kickQueued = true;
  queueMicrotask(() => {
    session.kickQueued = false;
    if (!session.inflight && session.subs.size > 0 && session.timer === undefined) void pollSession(session);
  });
}

function dispose(session: Session): void {
  session.generation += 1;
  session.subs.clear();
  if (session.timer !== undefined) session.timers.cancel(session.timer);
  session.timer = undefined;
  sessions.delete(session.key);
}

/** Joins the job's poll. Synchronous callers share the first request. */
export function subscribeTrackingSlot(options: {
  key: string; jobId: string; slot: TrackingSlot; read: (request: TrackingPollRequest) => Promise<unknown>;
  onChange: (doc: Doc | null) => void; onError?: (error: Error) => void; timers?: Timers;
}): () => void {
  let session = sessions.get(options.key);
  if (!session) {
    session = { key: options.key, jobId: options.jobId, read: options.read, timers: options.timers ?? defaultTimers, subs: new Set(),
      cache: { current: null, discovery: null }, seen: { current: false, discovery: false }, tokens: {}, failures: 0, generation: 0,
      inflight: false, inflightDocuments: [], kickQueued: false, rerun: false, pace: 'live', ignoreFinalUntilChange: false, finalToken: '' };
    sessions.set(options.key, session);
  }
  const sub: Sub = { slot: options.slot, onChange: options.onChange, onError: options.onError };
  session.subs.add(sub);
  if (session.seen[options.slot]) options.onChange(session.cache[options.slot]);
  if (!session.seen[options.slot]) {
    if (session.inflight && !session.inflightDocuments.includes(options.slot)) session.rerun = true;
    if (session.timer !== undefined) { session.timers.cancel(session.timer); session.timer = undefined; }
    kick(session);
  }
  const active = session;
  return () => { active.subs.delete(sub); if (active.subs.size === 0) dispose(active); };
}

/** Ask again immediately after a user action. A still-final snapshot keeps the slow interval until its update time changes. */
export function resumeTrackingPolls(jobId: string): void {
  for (const session of sessions.values()) {
    if (session.jobId !== jobId || session.subs.size === 0) continue;
    session.ignoreFinalUntilChange = true;
    session.pace = 'live';
    session.failures = 0;
    if (session.timer !== undefined) { session.timers.cancel(session.timer); session.timer = undefined; }
    if (!session.inflight) kick(session);
  }
}
