"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeleteAction = void 0;
exports.isLegacyJob = isLegacyJob;
exports.planLegacyJob = planLegacyJob;
exports.summariseLegacy = summariseLegacy;
const mediaLifecycle_1 = require("./mediaLifecycle");
function isLegacyJob(job, now) {
    if (typeof job.playerId !== 'string' || !job.playerId || !(0, mediaLifecycle_1.isTerminalStatus)(job.status))
        return false;
    if (job.mediaCleanupState === 'done' || job.mediaCleanupState === 'pending' || job.mediaCleanupState === 'retry_window')
        return false;
    // Failed jobs keep their media for the normal retry window before anything is proposed.
    const updated = typeof job.updatedAt === 'string' ? Date.parse(job.updatedAt) : NaN;
    if (job.status === 'failed' && !(now.getTime() - updated > mediaLifecycle_1.LIFECYCLE.keepForRetryDays * 86_400_000))
        return false;
    return true;
}
function frameId(frame) {
    if (typeof frame.id === 'string' && frame.id)
        return frame.id;
    return typeof frame.index === 'number' ? `frame_${frame.index}` : null;
}
function planLegacyJob(jobId, job, objects, options) {
    const ownerId = String(job.playerId);
    const prefix = (0, mediaLifecycle_1.jobMediaPrefix)(ownerId, jobId);
    const complete = job.status === 'complete';
    const cited = complete ? (0, mediaLifecycle_1.citedFrameIds)([job.report, job.pendingCoaching]) : new Set();
    const identity = complete && job.identityConfirmation?.state === 'confirmed' ? new Set(job.identityConfirmation.frameIds ?? []) : new Set();
    const frameIdsByPath = new Map();
    for (const frame of job.frames ?? []) {
        const id = frameId(frame);
        if (id && typeof frame.storagePath === 'string')
            frameIdsByPath.set(frame.storagePath, id);
    }
    const sourcePath = `${prefix}video.mp4`;
    const entries = objects
        .filter((object) => object.name.startsWith(prefix))
        .map((object) => {
        const relative = object.name.slice(prefix.length);
        let action;
        if (!(0, mediaLifecycle_1.isKnownJobObject)(prefix, object.name))
            action = 'review_unrecognised';
        else if (object.name === sourcePath) {
            if (options.inMediaLibrary)
                action = 'keep_source_in_library';
            else if (job.retainSource === true)
                action = 'keep_source_retained';
            else
                action = options.includeSources ? 'delete_unused_source' : 'review_source_no_decision';
        }
        else if (relative.startsWith('clips/'))
            action = 'keep_clip';
        else {
            const id = frameIdsByPath.get(object.name) ?? relative.slice('frames/'.length).replace(/\.jpg$/, '');
            action = cited.has(id) ? 'keep_cited_frame' : identity.has(id) ? 'keep_identity_frame' : 'delete_uncited_frame';
        }
        return { ...object, action };
    });
    return { jobId, ownerId, status: String(job.status), entries };
}
const isDeleteAction = (action) => action.startsWith('delete_');
exports.isDeleteAction = isDeleteAction;
function summariseLegacy(plans) {
    const summary = { jobs: plans.length };
    for (const plan of plans) {
        for (const entry of plan.entries) {
            const bucket = summary[entry.action] ?? { objects: 0, bytes: 0 };
            bucket.objects += 1;
            bucket.bytes += entry.size;
            summary[entry.action] = bucket;
        }
    }
    return summary;
}
//# sourceMappingURL=legacyMedia.js.map