"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialStages = initialStages;
exports.parseStages = parseStages;
exports.setCvStageResult = setCvStageResult;
exports.updateStage = updateStage;
const workerContract_1 = require("./workerContract");
const STAGE_LABELS = [
    ['video-ingestion', 'Validating video'],
    ['frame-extraction', 'Extracting key frames'],
    ['match-segmentation', 'Finding match segments'],
    ['player-identification', 'Identifying players in sampled frames'],
    ['identity-confirmation', 'Confirm this is you'],
    ['player-tracking', 'Continuous player tracking'],
    ['event-detection', 'Computer-vision event detection'],
    ['tactical-context', 'Tactical phase and pitch mapping'],
    ['role-analysis', 'Role execution from tracking'],
    ['cross-event-reasoning', 'Connecting detected events'],
    ['coaching-synthesis', 'Building coaching feedback'],
    ['validation', 'Validating evidence'],
    ['final-report', 'Finalizing report'],
];
function initialStages() {
    return STAGE_LABELS.map(([id, label]) => {
        if ((0, workerContract_1.isCvWorkerStage)(id))
            return { id, label, status: 'unavailable', note: workerContract_1.CV_UNAVAILABLE_REASON, progress: null };
        if (id === 'cross-event-reasoning') {
            return {
                id,
                label,
                status: 'unavailable',
                note: 'No validated event stream exists until event detection is available.',
                progress: null,
            };
        }
        return { id, label, status: 'pending', progress: null };
    });
}
function parseStages(value) {
    if (!Array.isArray(value) || value.length === 0)
        return initialStages();
    const byId = new Map(value
        .filter((item) => Boolean(item) && typeof item.id === 'string')
        .map((item) => [item.id, item]));
    return initialStages().map((stage) => {
        const stored = byId.get(stage.id);
        if (!stored || stage.status === 'unavailable')
            return stage;
        return { ...stage, ...stored, label: stage.label, progress: null };
    });
}
/**
 * Records the outcome of a CV stage. Only called with results that came back from the
 * configured worker; without one these stages stay `unavailable`.
 */
function setCvStageResult(stages, id, status, now, note) {
    return stages.map((stage) => stage.id === id && (0, workerContract_1.isCvWorkerStage)(id)
        ? { ...stage, status, note, ...(status === 'unavailable' ? {} : { completedAt: now }), progress: null }
        : stage);
}
function updateStage(stages, id, status, now, extra = {}) {
    return stages.map((stage) => {
        if (stage.id !== id || stage.status === 'unavailable')
            return stage;
        const next = { ...stage, ...extra, status };
        if (status === 'active') {
            next.startedAt = now;
            next.attempts = (stage.attempts ?? 0) + 1;
            delete next.completedAt;
        }
        if (status === 'complete' || status === 'failed')
            next.completedAt = now;
        return next;
    });
}
//# sourceMappingURL=stages.js.map