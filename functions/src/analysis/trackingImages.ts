import { getStorage } from 'firebase-admin/storage';
import type { Firestore } from 'firebase-admin/firestore';
import { TRACKING_ATTEMPT_LEASE_MS } from './trackingDeadlines';

/**
 * R2 (2026-11-19): review and discovery images follow the report's visibility.
 *
 * Reports always reference the owner path  profiles/{uid}/matchFootage/{jobId}/tracking/{name}.jpg
 * The object lives either there (owner-readable: the report or sighting it belongs to is released) or at the
 * server-only twin                         profiles/{uid}/matchFootage/{jobId}/pilotHeld/{name}.jpg
 * which no client rule allows and getMediaPlaybackUrl refuses. Workers' images are always written to the twin;
 * they move to the owner path only when their report/sightings become owner-visible (direct publication or a
 * reviewer release) and move back on withholding. A move re-writes the bytes without download tokens, so a
 * download URL issued before withholding stops working the moment the owner-path object is deleted, and is not
 * valid for the re-created object after a later release either.
 * Images no current, held or withheld document references are discarded (immediately for the attempt that
 * wrote them, otherwise by the media lifecycle once older than a resolve can run).
 */
export const HELD_IMAGE_DIR = 'pilotHeld';
/** Longer than the tracking task timeout, so a still-running attempt's images are not reaped. */
export const IMAGE_ATTEMPT_MAX_MS = TRACKING_ATTEMPT_LEASE_MS;

const OWNER_IMAGE = /^profiles\/[^/]+\/matchFootage\/[^/]+\/tracking\/[A-Za-z0-9_-]+\.jpg$/;

export function isOwnerImagePath(path: string): boolean {
  return OWNER_IMAGE.test(path);
}

export function heldImagePath(ownerPath: string): string {
  if (!isOwnerImagePath(ownerPath)) throw new Error('not a review image path');
  return ownerPath.replace(/\/tracking\/([^/]+)$/, `/${HELD_IMAGE_DIR}/$1`);
}

export function ownerImagePathOf(heldPath: string): string {
  return heldPath.replace(new RegExp(`/${HELD_IMAGE_DIR}/([^/]+)$`), '/tracking/$1');
}

export interface ImageBucket {
  save(path: string, bytes: Buffer): Promise<void>;
  read(path: string): Promise<Buffer | null>;
  remove(path: string): Promise<void>;
  list(prefix: string): Promise<Array<{ name: string; updatedMs: number }>>;
}

export const storageImageBucket: ImageBucket = {
  async save(path, bytes) {
    // No download token is ever attached: owner URLs are minted by the client SDK only while rules allow it.
    await getStorage().bucket().file(path).save(bytes, { contentType: 'image/jpeg', resumable: false,
      metadata: { cacheControl: 'private, max-age=3600' } });
  },
  async read(path) {
    try {
      const [b] = await getStorage().bucket().file(path).download();
      return b;
    } catch (e) {
      if ((e as { code?: number }).code === 404) return null;
      throw e;
    }
  },
  async remove(path) {
    await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
  },
  async list(prefix) {
    const [files] = await getStorage().bucket().getFiles({ prefix });
    return files.map((f) => ({ name: f.name, updatedMs: Date.parse(String(f.metadata.updated ?? f.metadata.timeCreated ?? 0)) || 0 }));
  },
};

/** Every image path a stored report, held copy or discovery document points to. */
export function referencedImagePaths(...docs: unknown[]): Set<string> {
  const out = new Set<string>();
  const visit = (v: unknown, depth: number): void => {
    if (depth > 12 || v === null || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (const x of v) visit(x, depth + 1); return; }
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if ((k === 'imagePath' || k === 'referenceImagePath') && typeof x === 'string' && isOwnerImagePath(x)) out.add(x);
      else visit(x, depth + 1);
    }
  };
  for (const d of docs) visit(d, 0);
  return out;
}

async function move(bucket: ImageBucket, from: string, to: string): Promise<boolean> {
  const bytes = await bucket.read(from);
  if (!bytes) return false;
  await bucket.save(to, bytes);
  await bucket.remove(from);
  return true;
}

/** Report/sightings became owner-visible: held twins -> owner paths. */
export async function publishImages(bucket: ImageBucket, ownerPaths: Iterable<string>): Promise<number> {
  let n = 0;
  for (const p of ownerPaths) if (isOwnerImagePath(p) && await move(bucket, heldImagePath(p), p)) n += 1;
  return n;
}

/** Report/sightings taken away from the owner: owner paths -> held twins (bytes re-written, tokens dropped). */
export async function containImages(bucket: ImageBucket, ownerPaths: Iterable<string>): Promise<number> {
  let n = 0;
  for (const p of ownerPaths) if (isOwnerImagePath(p) && await move(bucket, p, heldImagePath(p))) n += 1;
  return n;
}

type JobDocs = { current: unknown; held: unknown; discovery: unknown; heldDiscovery: unknown };

export async function readImageDocs(db: Firestore, matchCollection: string, jobId: string): Promise<JobDocs> {
  const job = db.collection(matchCollection).doc(jobId);
  const [current, discovery, held, heldDiscovery] = await Promise.all([
    job.collection('tracking').doc('current').get(), job.collection('tracking').doc('discovery').get(),
    job.collection(HELD_IMAGE_DIR).doc('current').get(), job.collection(HELD_IMAGE_DIR).doc('discovery').get()]);
  return { current: current.data() ?? null, discovery: discovery.data() ?? null, held: held.data() ?? null,
    heldDiscovery: heldDiscovery.data() ?? null };
}

export type PruneResult = { deleted: string[]; contained: string[]; kept: number };

/**
 * Reconciles a job's image objects with its documents:
 *  - owner-path object referenced by the owner-visible report/discovery: kept;
 *  - owner-path object referenced only by a held or withheld copy (stored before R2): contained (moved to the twin);
 *  - held twin referenced by a held or withheld copy: kept;
 *  - anything else is discarded if it was written by `own` (this attempt) or is older than `olderThanMs`.
 * Idempotent; touches nothing outside profiles/{uid}/matchFootage/{jobId}/(tracking|pilotHeld)/.
 */
export async function pruneJobImages(bucket: ImageBucket, uid: string, jobId: string, docs: JobDocs,
  opts: { own?: Iterable<string>; olderThanMs?: number } = {}): Promise<PruneResult> {
  const base = `profiles/${uid}/matchFootage/${jobId}/`;
  const visible = referencedImagePaths(docs.current, docs.discovery);
  const heldRefs = referencedImagePaths(docs.held, docs.heldDiscovery);
  const own = new Set(opts.own ?? []);
  const out: PruneResult = { deleted: [], contained: [], kept: 0 };
  const discardable = (ownerPath: string, updatedMs: number) => own.has(ownerPath)
    || (opts.olderThanMs !== undefined && updatedMs < opts.olderThanMs);
  const ownerObjects = await bucket.list(`${base}tracking/`);
  const ownerNames = new Set(ownerObjects.map((o) => o.name));
  for (const o of ownerObjects) {
    if (!isOwnerImagePath(o.name)) continue;
    if (visible.has(o.name)) { out.kept += 1; continue; }
    if (heldRefs.has(o.name)) { if (await move(bucket, o.name, heldImagePath(o.name))) out.contained.push(o.name); continue; }
    if (discardable(o.name, o.updatedMs)) { await bucket.remove(o.name); out.deleted.push(o.name); } else out.kept += 1;
  }
  for (const o of await bucket.list(`${base}${HELD_IMAGE_DIR}/`)) {
    const ownerPath = ownerImagePathOf(o.name);
    if (!isOwnerImagePath(ownerPath)) continue;
    if (heldRefs.has(ownerPath)) { out.kept += 1; continue; }
    // A publication interrupted between copy and delete: finish it rather than lose an owner-visible image.
    if (visible.has(ownerPath) && !ownerNames.has(ownerPath)) { await move(bucket, o.name, ownerPath); out.kept += 1; continue; }
    if (discardable(ownerPath, o.updatedMs)) { await bucket.remove(o.name); out.deleted.push(o.name); } else out.kept += 1;
  }
  return out;
}
