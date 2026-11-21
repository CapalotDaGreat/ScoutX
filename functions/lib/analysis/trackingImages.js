"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageImageBucket = exports.IMAGE_ATTEMPT_MAX_MS = exports.HELD_IMAGE_DIR = void 0;
exports.isOwnerImagePath = isOwnerImagePath;
exports.heldImagePath = heldImagePath;
exports.ownerImagePathOf = ownerImagePathOf;
exports.referencedImagePaths = referencedImagePaths;
exports.publishImages = publishImages;
exports.containImages = containImages;
exports.readImageDocs = readImageDocs;
exports.pruneJobImages = pruneJobImages;
const storage_1 = require("firebase-admin/storage");
const trackingDeadlines_1 = require("./trackingDeadlines");
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
exports.HELD_IMAGE_DIR = 'pilotHeld';
/** Longer than the tracking task timeout, so a still-running attempt's images are not reaped. */
exports.IMAGE_ATTEMPT_MAX_MS = trackingDeadlines_1.TRACKING_ATTEMPT_LEASE_MS;
const OWNER_IMAGE = /^profiles\/[^/]+\/matchFootage\/[^/]+\/tracking\/[A-Za-z0-9_-]+\.jpg$/;
function isOwnerImagePath(path) {
    return OWNER_IMAGE.test(path);
}
function heldImagePath(ownerPath) {
    if (!isOwnerImagePath(ownerPath))
        throw new Error('not a review image path');
    return ownerPath.replace(/\/tracking\/([^/]+)$/, `/${exports.HELD_IMAGE_DIR}/$1`);
}
function ownerImagePathOf(heldPath) {
    return heldPath.replace(new RegExp(`/${exports.HELD_IMAGE_DIR}/([^/]+)$`), '/tracking/$1');
}
exports.storageImageBucket = {
    async save(path, bytes) {
        // No download token is ever attached: owner URLs are minted by the client SDK only while rules allow it.
        await (0, storage_1.getStorage)().bucket().file(path).save(bytes, { contentType: 'image/jpeg', resumable: false,
            metadata: { cacheControl: 'private, max-age=3600' } });
    },
    async read(path) {
        try {
            const [b] = await (0, storage_1.getStorage)().bucket().file(path).download();
            return b;
        }
        catch (e) {
            if (e.code === 404)
                return null;
            throw e;
        }
    },
    async remove(path) {
        await (0, storage_1.getStorage)().bucket().file(path).delete({ ignoreNotFound: true });
    },
    async list(prefix) {
        const [files] = await (0, storage_1.getStorage)().bucket().getFiles({ prefix });
        return files.map((f) => ({ name: f.name, updatedMs: Date.parse(String(f.metadata.updated ?? f.metadata.timeCreated ?? 0)) || 0 }));
    },
};
/** Every image path a stored report, held copy or discovery document points to. */
function referencedImagePaths(...docs) {
    const out = new Set();
    const visit = (v, depth) => {
        if (depth > 12 || v === null || typeof v !== 'object')
            return;
        if (Array.isArray(v)) {
            for (const x of v)
                visit(x, depth + 1);
            return;
        }
        for (const [k, x] of Object.entries(v)) {
            if ((k === 'imagePath' || k === 'referenceImagePath') && typeof x === 'string' && isOwnerImagePath(x))
                out.add(x);
            else
                visit(x, depth + 1);
        }
    };
    for (const d of docs)
        visit(d, 0);
    return out;
}
async function move(bucket, from, to) {
    const bytes = await bucket.read(from);
    if (!bytes)
        return false;
    await bucket.save(to, bytes);
    await bucket.remove(from);
    return true;
}
/** Report/sightings became owner-visible: held twins -> owner paths. */
async function publishImages(bucket, ownerPaths) {
    let n = 0;
    for (const p of ownerPaths)
        if (isOwnerImagePath(p) && await move(bucket, heldImagePath(p), p))
            n += 1;
    return n;
}
/** Report/sightings taken away from the owner: owner paths -> held twins (bytes re-written, tokens dropped). */
async function containImages(bucket, ownerPaths) {
    let n = 0;
    for (const p of ownerPaths)
        if (isOwnerImagePath(p) && await move(bucket, p, heldImagePath(p)))
            n += 1;
    return n;
}
async function readImageDocs(db, matchCollection, jobId) {
    const job = db.collection(matchCollection).doc(jobId);
    const [current, discovery, held, heldDiscovery] = await Promise.all([
        job.collection('tracking').doc('current').get(), job.collection('tracking').doc('discovery').get(),
        job.collection(exports.HELD_IMAGE_DIR).doc('current').get(), job.collection(exports.HELD_IMAGE_DIR).doc('discovery').get()
    ]);
    return { current: current.data() ?? null, discovery: discovery.data() ?? null, held: held.data() ?? null,
        heldDiscovery: heldDiscovery.data() ?? null };
}
/**
 * Reconciles a job's image objects with its documents:
 *  - owner-path object referenced by the owner-visible report/discovery: kept;
 *  - owner-path object referenced only by a held or withheld copy (stored before R2): contained (moved to the twin);
 *  - held twin referenced by a held or withheld copy: kept;
 *  - anything else is discarded if it was written by `own` (this attempt) or is older than `olderThanMs`.
 * Idempotent; touches nothing outside profiles/{uid}/matchFootage/{jobId}/(tracking|pilotHeld)/.
 */
async function pruneJobImages(bucket, uid, jobId, docs, opts = {}) {
    const base = `profiles/${uid}/matchFootage/${jobId}/`;
    const visible = referencedImagePaths(docs.current, docs.discovery);
    const heldRefs = referencedImagePaths(docs.held, docs.heldDiscovery);
    const own = new Set(opts.own ?? []);
    const out = { deleted: [], contained: [], kept: 0 };
    const discardable = (ownerPath, updatedMs) => own.has(ownerPath)
        || (opts.olderThanMs !== undefined && updatedMs < opts.olderThanMs);
    const ownerObjects = await bucket.list(`${base}tracking/`);
    const ownerNames = new Set(ownerObjects.map((o) => o.name));
    for (const o of ownerObjects) {
        if (!isOwnerImagePath(o.name))
            continue;
        if (visible.has(o.name)) {
            out.kept += 1;
            continue;
        }
        if (heldRefs.has(o.name)) {
            if (await move(bucket, o.name, heldImagePath(o.name)))
                out.contained.push(o.name);
            continue;
        }
        if (discardable(o.name, o.updatedMs)) {
            await bucket.remove(o.name);
            out.deleted.push(o.name);
        }
        else
            out.kept += 1;
    }
    for (const o of await bucket.list(`${base}${exports.HELD_IMAGE_DIR}/`)) {
        const ownerPath = ownerImagePathOf(o.name);
        if (!isOwnerImagePath(ownerPath))
            continue;
        if (heldRefs.has(ownerPath)) {
            out.kept += 1;
            continue;
        }
        // A publication interrupted between copy and delete: finish it rather than lose an owner-visible image.
        if (visible.has(ownerPath) && !ownerNames.has(ownerPath)) {
            await move(bucket, o.name, ownerPath);
            out.kept += 1;
            continue;
        }
        if (discardable(ownerPath, o.updatedMs)) {
            await bucket.remove(o.name);
            out.deleted.push(o.name);
        }
        else
            out.kept += 1;
    }
    return out;
}
//# sourceMappingURL=trackingImages.js.map