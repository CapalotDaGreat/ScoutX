"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canTransitionJob = canTransitionJob;
exports.leaseExpired = leaseExpired;
exports.canAcquireLease = canAcquireLease;
const ALLOWED = {
    draft: ['uploading', 'failed'],
    uploading: ['queued', 'failed'],
    queued: ['processing', 'failed'],
    processing: ['complete', 'failed', 'queued'],
    complete: [],
    failed: ['queued', 'processing'],
};
function canTransitionJob(from, to) {
    if (from === to) {
        return true;
    }
    return (ALLOWED[from] ?? []).includes(to);
}
function leaseExpired(lease, nowMs) {
    if (!lease || typeof lease.until !== 'string') {
        return true;
    }
    const until = Date.parse(lease.until);
    return !Number.isFinite(until) || until <= nowMs;
}
function canAcquireLease(lease, holder, nowMs) {
    if (!lease) {
        return true;
    }
    if (lease.holder === holder) {
        return true;
    }
    return leaseExpired(lease, nowMs);
}
//# sourceMappingURL=stateMachine.js.map