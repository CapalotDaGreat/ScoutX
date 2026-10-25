"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudTasksDispatcher = exports.TASK_FUNCTIONS = void 0;
exports.getTaskDispatcher = getTaskDispatcher;
exports.setTaskDispatcher = setTaskDispatcher;
exports.parseAnalysisTask = parseAnalysisTask;
const functions_1 = require("firebase-admin/functions");
const region_1 = require("../region");
exports.TASK_FUNCTIONS = {
    extract_segment: 'extractMatchSegment',
    analyze_frames: 'analyzeMatchFrames',
    review_segment: 'reviewMatchSegment',
    synthesize_report: 'synthesizeMatchReport',
};
/** Cloud Tasks queues backing the task functions. */
exports.cloudTasksDispatcher = {
    async enqueue(task, options) {
        await (0, functions_1.getFunctions)()
            .taskQueue((0, region_1.taskQueueName)(exports.TASK_FUNCTIONS[task.kind]))
            .enqueue(task, {
            dispatchDeadlineSeconds: 1800,
            ...(options?.delaySeconds ? { scheduleDelaySeconds: options.delaySeconds } : {}),
        });
    },
};
let activeDispatcher = exports.cloudTasksDispatcher;
function getTaskDispatcher() {
    return activeDispatcher;
}
function setTaskDispatcher(dispatcher) {
    activeDispatcher = dispatcher;
}
function parseAnalysisTask(value) {
    if (!value || typeof value !== 'object')
        return null;
    const data = value;
    if (typeof data.jobId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(data.jobId)
        || typeof data.generation !== 'number' || !Number.isSafeInteger(data.generation) || data.generation < 0)
        return null;
    if (data.kind === 'analyze_frames')
        return { kind: 'analyze_frames', jobId: data.jobId, generation: data.generation };
    if (data.kind === 'synthesize_report')
        return { kind: 'synthesize_report', jobId: data.jobId, generation: data.generation };
    const segmentIndex = data.segmentIndex;
    if (typeof segmentIndex !== 'number' || !Number.isInteger(segmentIndex) || segmentIndex < 0 || segmentIndex > 50)
        return null;
    if (data.kind === 'extract_segment') {
        return { kind: 'extract_segment', jobId: data.jobId, generation: data.generation, segmentIndex };
    }
    if (data.kind === 'review_segment') {
        return { kind: 'review_segment', jobId: data.jobId, generation: data.generation, segmentIndex };
    }
    return null;
}
//# sourceMappingURL=taskDispatcher.js.map