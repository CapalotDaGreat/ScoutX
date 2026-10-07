"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TERMINAL_PIPELINE_STATES = exports.PIPELINE_STATES = void 0;
exports.parsePipelineState = parsePipelineState;
exports.canTransitionPipeline = canTransitionPipeline;
exports.statusForPipeline = statusForPipeline;
exports.canTransitionJob = canTransitionJob;
exports.leaseExpired = leaseExpired;
exports.canAcquireLease = canAcquireLease;
const ALLOWED = {
    draft: ['uploading', 'failed', 'cancelled'],
    uploading: ['queued', 'failed', 'cancelled', 'expired'],
    queued: ['processing', 'failed', 'cancelled'],
    processing: ['complete', 'failed', 'queued', 'cancelled'],
    complete: [],
    failed: ['queued', 'processing'],
    cancelled: [],
    expired: [],
};
/**
 * Server-only pipeline: CREATED → UPLOADING → VALIDATING → QUEUED → EXTRACTING → ANALYZING →
 * COMPLETED, with FAILED (retryable), CANCELLED and EXPIRED as exits. Clients can only create a
 * job and request cancellation.
 */
exports.PIPELINE_STATES = [
    'created',
    'uploading',
    'validating',
    'queued',
    'extracting',
    'analyzing',
    'completed',
    'failed',
    'cancelled',
    'expired',
];
const PIPELINE_ALLOWED = {
    created: ['uploading', 'validating', 'queued', 'failed', 'cancelled', 'expired'],
    uploading: ['validating', 'failed', 'cancelled', 'expired'],
    validating: ['queued', 'failed', 'cancelled'],
    queued: ['extracting', 'analyzing', 'failed', 'cancelled'],
    extracting: ['analyzing', 'failed', 'cancelled', 'queued'],
    analyzing: ['completed', 'failed', 'cancelled', 'queued'],
    completed: [],
    failed: ['queued', 'analyzing'],
    cancelled: [],
    expired: [],
};
exports.TERMINAL_PIPELINE_STATES = ['completed', 'cancelled', 'expired'];
function parsePipelineState(value, status) {
    if (typeof value === 'string' && exports.PIPELINE_STATES.includes(value))
        return value;
    switch (status) {
        case 'queued': return 'queued';
        case 'processing': return 'analyzing';
        case 'complete': return 'completed';
        case 'failed': return 'failed';
        case 'cancelled': return 'cancelled';
        case 'expired': return 'expired';
        case 'uploading': return 'uploading';
        default: return 'created';
    }
}
function canTransitionPipeline(from, to) {
    return from === to || PIPELINE_ALLOWED[from].includes(to);
}
function statusForPipeline(state) {
    switch (state) {
        case 'created':
        case 'uploading':
        case 'validating':
            return 'uploading';
        case 'queued':
            return 'queued';
        case 'extracting':
        case 'analyzing':
            return 'processing';
        case 'completed':
            return 'complete';
        default:
            return state;
    }
}
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