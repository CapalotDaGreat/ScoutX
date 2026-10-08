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
    if (typeof data.jobId !== 'string' || !data.jobId || typeof data.generation !== 'number')
        return null;
    if (data.kind === 'analyze_frames')
        return { kind: 'analyze_frames', jobId: data.jobId, generation: data.generation };
    if (data.kind === 'extract_segment' && typeof data.segmentIndex === 'number' && data.segmentIndex >= 0) {
        return { kind: 'extract_segment', jobId: data.jobId, generation: data.generation, segmentIndex: data.segmentIndex };
    }
    return null;
}
//# sourceMappingURL=taskDispatcher.js.map