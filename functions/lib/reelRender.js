"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.onReelExportQueued = exports.saveReelToLibrary = exports.exportReel = void 0;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const firestore_1 = require("firebase-admin/firestore");
const storage_1 = require("firebase-admin/storage");
const firestore_2 = require("firebase-functions/v2/firestore");
const https_1 = require("firebase-functions/v2/https");
const callableOptions_1 = require("./callableOptions");
const quotaService_1 = require("./entitlements/quotaService");
const reelRenderPlan_1 = require("./reelRenderPlan");
const MAX_EXPORTS_PER_HOUR = 6;
const ACTIVE = new Set(['queued', 'rendering', 'ready']);
class RenderError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
    }
}
function isAspect(value) {
    return value === '9:16' || value === '16:9' || value === '1:1';
}
function readSegments(value) {
    if (!Array.isArray(value))
        return [];
    return value.flatMap((item) => {
        const row = item && typeof item === 'object' ? item : null;
        if (!row || typeof row.mediaId !== 'string' || typeof row.inSec !== 'number' || typeof row.outSec !== 'number')
            return [];
        return [{ mediaId: row.mediaId, inSec: row.inSec, outSec: row.outSec, caption: typeof row.caption === 'string' ? row.caption : undefined }];
    });
}
/** Only media stored under the owner's own profile prefix can be rendered. */
async function loadSources(db, ownerId, segments) {
    const sources = new Map();
    for (const mediaId of new Set(segments.map((segment) => segment.mediaId))) {
        const snap = await db.collection('players').doc(ownerId).collection('media').doc(mediaId).get();
        const storagePath = snap.get('storagePath');
        const durationSec = snap.get('durationSec');
        const usable = snap.exists &&
            snap.get('uploadState') === 'ready' &&
            typeof storagePath === 'string' &&
            storagePath.startsWith(`profiles/${ownerId}/`) &&
            !storagePath.includes('..');
        sources.set(mediaId, usable ? { storagePath, durationSec: typeof durationSec === 'number' ? durationSec : 0 } : null);
    }
    return sources;
}
function runFfmpeg(args, deadlineAt) {
    const binary = ffmpeg_static_1.default;
    if (!binary)
        return Promise.reject(new RenderError('render_failed'));
    const remaining = deadlineAt - Date.now();
    if (remaining <= 0)
        return Promise.reject(new RenderError('timeout'));
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });
        let stderr = '';
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill('SIGKILL');
        }, remaining);
        child.stderr.on('data', (chunk) => {
            stderr = (stderr + chunk.toString()).slice(-4000);
        });
        child.on('error', () => {
            clearTimeout(timer);
            reject(new RenderError('render_failed'));
        });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut)
                reject(new RenderError('timeout'));
            else if (code === 0)
                resolve();
            else
                reject(Object.assign(new RenderError((0, reelRenderPlan_1.classifyFfmpegError)(stderr)), { stderr }));
        });
    });
}
/** Player asks for a rendered reel. Validation happens before a job is queued. */
exports.exportReel = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    const reelId = typeof request.data?.reelId === 'string' ? request.data.reelId : '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(reelId))
        throw new https_1.HttpsError('invalid-argument', 'reelId is required.');
    const db = (0, firestore_1.getFirestore)();
    const snap = await db.collection('reels').doc(reelId).get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Reel not found.');
    const reel = snap.data();
    if (reel.ownerId !== uid)
        throw new https_1.HttpsError('permission-denied', 'You can only export your own reels.');
    const segments = readSegments(reel.segments);
    const aspectRatio = isAspect(reel.aspectRatio) ? reel.aspectRatio : '9:16';
    const plan = (0, reelRenderPlan_1.buildRenderPlan)({ segments, aspectRatio, coverMediaId: reel.coverMediaId ?? null }, await loadSources(db, uid, segments));
    if (!plan.ok) {
        return { exportId: null, status: 'failed', errorCode: plan.code, segmentIndex: plan.segmentIndex ?? null };
    }
    const version = typeof reel.version === 'number' ? reel.version : 0;
    const existing = await db.collection('reelExports').where('ownerId', '==', uid).limit(100).get();
    const reuse = existing.docs.find((doc) => doc.get('reelId') === reelId && doc.get('reelVersion') === version && ACTIVE.has(String(doc.get('status'))));
    if (reuse)
        return { exportId: reuse.id, status: String(reuse.get('status')), errorCode: null, segmentIndex: null };
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const recent = existing.docs.filter((doc) => String(doc.get('createdAt') ?? '') > hourAgo).length;
    if (recent >= MAX_EXPORTS_PER_HOUR)
        throw new https_1.HttpsError('resource-exhausted', 'Too many exports. Try again later.');
    const quotaRef = `${reelId}:v${version}`;
    await (0, quotaService_1.consumeQuota)(db, uid, 'reel_export', quotaRef);
    const now = new Date().toISOString();
    const ref = db.collection('reelExports').doc();
    await ref.set({
        id: ref.id,
        ownerId: uid,
        quotaRef,
        reelId,
        reelVersion: version,
        aspectRatio,
        status: 'queued',
        errorCode: null,
        storagePath: null,
        coverPath: null,
        durationSec: null,
        sizeBytes: null,
        createdAt: now,
        updatedAt: now,
    });
    return { exportId: ref.id, status: 'queued', errorCode: null, segmentIndex: null };
});
/**
 * Files a ready reel export into the owner's private media library so it can follow the normal
 * library flow (rights confirmation, then Passport). Rights are confirmed only when every source
 * clip was already confirmed; a moderated source blocks the save.
 */
exports.saveReelToLibrary = (0, https_1.onCall)((0, callableOptions_1.createCallableOptions)(), async (request) => {
    const uid = request.auth?.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Authentication is required.');
    const exportId = typeof request.data?.exportId === 'string' ? request.data.exportId : '';
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(exportId))
        throw new https_1.HttpsError('invalid-argument', 'exportId is required.');
    const db = (0, firestore_1.getFirestore)();
    const exportSnap = await db.collection('reelExports').doc(exportId).get();
    if (!exportSnap.exists || exportSnap.get('ownerId') !== uid)
        throw new https_1.HttpsError('not-found', 'Export not found.');
    const storagePath = exportSnap.get('storagePath');
    if (exportSnap.get('status') !== 'ready' ||
        typeof storagePath !== 'string' ||
        !storagePath.startsWith(`profiles/${uid}/reelExports/${exportId}/`)) {
        throw new https_1.HttpsError('failed-precondition', 'The reel is not ready yet.', { reason: 'export_not_ready' });
    }
    const reelId = String(exportSnap.get('reelId') ?? '');
    const reelSnap = await db.collection('reels').doc(reelId).get();
    const reel = reelSnap.data();
    if (!reel || reel.ownerId !== uid)
        throw new https_1.HttpsError('not-found', 'Reel not found.');
    const sourceIds = [...new Set(readSegments(reel.segments).map((segment) => segment.mediaId))];
    const sources = await Promise.all(sourceIds.map((id) => db.collection('players').doc(uid).collection('media').doc(id).get()));
    if (sources.some((snap) => snap.exists && (snap.get('moderationState') ?? 'none') !== 'none')) {
        throw new https_1.HttpsError('failed-precondition', 'A clip in this reel is under review.', { reason: 'source_moderated' });
    }
    const allConfirmed = sources.length > 0 && sources.every((snap) => snap.exists && snap.get('rightsState') === 'user_confirmed');
    const mediaRef = db.collection('players').doc(uid).collection('media').doc(`reel_${exportId}`);
    const existing = await mediaRef.get();
    if (existing.exists)
        return { mediaId: mediaRef.id, created: false };
    const now = new Date().toISOString();
    const coverPath = exportSnap.get('coverPath');
    await mediaRef.set({
        id: mediaRef.id,
        ownerId: uid,
        type: 'reel',
        storagePath,
        thumbnailPath: typeof coverPath === 'string' ? coverPath : null,
        durationSec: Number(exportSnap.get('durationSec') ?? 0),
        sourceMatchId: null,
        sourceJobId: null,
        sourceReelId: reelId,
        visibility: 'private',
        rightsState: allConfirmed ? 'user_confirmed' : 'unconfirmed',
        moderationState: 'none',
        uploadState: 'ready',
        processingState: 'ready',
        favorite: false,
        tags: [],
        goalIds: [],
        title: typeof reel.title === 'string' && reel.title.trim() ? reel.title.trim().slice(0, 120) : 'Highlight reel',
        createdAt: now,
        updatedAt: now,
    });
    return { mediaId: mediaRef.id, created: true };
});
exports.onReelExportQueued = (0, firestore_2.onDocumentCreated)({ document: 'reelExports/{exportId}', memory: '2GiB', timeoutSeconds: 540 }, async (event) => {
    const ref = event.data?.ref;
    if (!ref || event.data?.get('status') !== 'queued')
        return;
    const db = (0, firestore_1.getFirestore)();
    const ownerId = String(event.data.get('ownerId') ?? '');
    const reelId = String(event.data.get('reelId') ?? '');
    const deadlineAt = Date.now() + reelRenderPlan_1.RENDER_DEADLINE_MS;
    await ref.update({ status: 'rendering', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    let workDir = null;
    try {
        const reelSnap = await db.collection('reels').doc(reelId).get();
        const reel = reelSnap.data();
        if (!reel || reel.ownerId !== ownerId)
            throw new RenderError('missing_source');
        const segments = readSegments(reel.segments);
        const result = (0, reelRenderPlan_1.buildRenderPlan)({ segments, aspectRatio: isAspect(reel.aspectRatio) ? reel.aspectRatio : '9:16', coverMediaId: reel.coverMediaId ?? null }, await loadSources(db, ownerId, segments));
        if (!result.ok)
            throw new RenderError(result.code);
        const { plan } = result;
        const bucket = (0, storage_1.getStorage)().bucket();
        workDir = await (0, promises_1.mkdtemp)((0, node_path_1.join)((0, node_os_1.tmpdir)(), 'reel-'));
        const local = new Map();
        for (const [index, storagePath] of [...new Set(plan.segments.map((s) => s.storagePath))].entries()) {
            const file = bucket.file(storagePath);
            const [exists] = await file.exists();
            if (!exists)
                throw new RenderError('missing_source');
            const target = (0, node_path_1.join)(workDir, `src_${index}`);
            await file.download({ destination: target });
            local.set(storagePath, target);
        }
        const parts = [];
        for (const segment of plan.segments) {
            const input = local.get(segment.storagePath) ?? '';
            const output = (0, node_path_1.join)(workDir, `seg_${segment.index}.mp4`);
            try {
                await runFfmpeg((0, reelRenderPlan_1.segmentArgs)(input, output, segment, plan, true), deadlineAt);
            }
            catch (error) {
                const stderr = error.stderr ?? '';
                if (!(0, reelRenderPlan_1.isMissingAudio)(stderr))
                    throw error;
                await runFfmpeg((0, reelRenderPlan_1.segmentArgs)(input, output, segment, plan, false), deadlineAt);
            }
            parts.push(output);
        }
        const listFile = (0, node_path_1.join)(workDir, 'list.txt');
        await (0, promises_1.writeFile)(listFile, parts.map((part) => `file '${part.replace(/'/g, "'\\''")}'`).join('\n'));
        let srtFile = null;
        if (plan.srt) {
            srtFile = (0, node_path_1.join)(workDir, 'captions.srt');
            await (0, promises_1.writeFile)(srtFile, plan.srt);
        }
        const output = (0, node_path_1.join)(workDir, 'reel.mp4');
        await runFfmpeg((0, reelRenderPlan_1.concatArgs)(listFile, srtFile, output), deadlineAt);
        const cover = (0, node_path_1.join)(workDir, 'cover.jpg');
        await runFfmpeg((0, reelRenderPlan_1.coverArgs)(parts[plan.coverIndex], 0.5, cover), deadlineAt);
        const prefix = `profiles/${ownerId}/reelExports/${ref.id}`;
        await bucket.upload(output, { destination: `${prefix}/reel.mp4`, contentType: 'video/mp4' });
        await bucket.upload(cover, { destination: `${prefix}/cover.jpg`, contentType: 'image/jpeg' });
        const [exists] = await bucket.file(`${prefix}/reel.mp4`).exists();
        if (!exists)
            throw new RenderError('render_failed');
        const [metadata] = await bucket.file(`${prefix}/reel.mp4`).getMetadata();
        const now = new Date().toISOString();
        await ref.update({
            status: 'ready',
            storagePath: `${prefix}/reel.mp4`,
            coverPath: `${prefix}/cover.jpg`,
            durationSec: plan.totalSec,
            sizeBytes: Number(metadata.size ?? 0),
            hasCaptions: plan.srt !== null,
            completedAt: now,
            updatedAt: now,
        });
    }
    catch (error) {
        const code = error instanceof RenderError ? error.code : 'render_failed';
        const now = new Date().toISOString();
        await ref.update({ status: 'failed', errorCode: code, failedAt: now, updatedAt: now });
        const quotaRef = String(event.data.get('quotaRef') ?? '');
        if (quotaRef)
            await (0, quotaService_1.releaseQuota)(db, ownerId, 'reel_export', quotaRef).catch(() => false);
    }
    finally {
        if (workDir)
            await (0, promises_1.rm)(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
});
//# sourceMappingURL=reelRender.js.map