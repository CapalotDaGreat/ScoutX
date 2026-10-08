"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SECTION_IDS = void 0;
exports.buildSections = buildSections;
exports.buildVersions = buildVersions;
const cvConfig_1 = require("./cvConfig");
const mode_1 = require("./mode");
/**
 * Every report section states whether it is backed by evidence. A section the system cannot
 * produce is NOT_AVAILABLE with a reason; it is never filled with plausible-sounding text.
 */
exports.SECTION_IDS = [
    'identity',
    'coverage',
    'technique',
    'decisions',
    'off_ball',
    'tactical',
    'events',
    'statistics',
    'physical',
    'goalkeeper',
];
function buildSections(input, env = process.env) {
    const cvStatus = (0, cvConfig_1.cvWorkerStatus)(env);
    const eventsValidated = (0, cvConfig_1.cvEventsValidated)(env);
    const cvReason = cvStatus === 'available' ? 'cv_events_not_validated' : 'cv_worker_not_configured';
    const sections = [
        input.identityConfirmed
            ? { id: 'identity', availability: 'AVAILABLE', reason: 'identity_confirmed' }
            : input.targetSeenFrames > 0
                ? { id: 'identity', availability: 'LIMITED', reason: 'identity_unconfirmed' }
                : { id: 'identity', availability: 'INSUFFICIENT_EVIDENCE', reason: 'target_not_seen' },
        input.targetSeenFrames > 0
            ? { id: 'coverage', availability: 'LIMITED', reason: 'sampled_frames_only' }
            : { id: 'coverage', availability: 'INSUFFICIENT_EVIDENCE', reason: 'target_not_seen' },
        input.ratedTechniqueCount > 0
            ? { id: 'technique', availability: 'LIMITED', reason: 'sampled_frames_only' }
            : { id: 'technique', availability: 'INSUFFICIENT_EVIDENCE', reason: 'not_enough_frames' },
        input.decisionMoments > 0
            ? { id: 'decisions', availability: 'LIMITED', reason: 'sampled_frames_only' }
            : { id: 'decisions', availability: 'INSUFFICIENT_EVIDENCE', reason: 'not_enough_frames' },
        { id: 'off_ball', availability: 'NOT_AVAILABLE', reason: 'needs_tracking' },
        { id: 'tactical', availability: 'NOT_AVAILABLE', reason: 'needs_tracking' },
        eventsValidated && input.validatedEventCount > 0
            ? { id: 'events', availability: 'LIMITED', reason: 'sampled_frames_only' }
            : { id: 'events', availability: 'NOT_AVAILABLE', reason: cvReason },
        eventsValidated && input.validatedEventCount > 0
            ? { id: 'statistics', availability: 'LIMITED', reason: 'sampled_frames_only' }
            : { id: 'statistics', availability: 'NOT_AVAILABLE', reason: 'no_validated_events' },
        { id: 'physical', availability: 'NOT_AVAILABLE', reason: 'use_gps' },
    ];
    if (input.isGoalkeeper) {
        sections.push(input.goalkeeperNotes > 0
            ? { id: 'goalkeeper', availability: 'LIMITED', reason: 'sampled_frames_only' }
            : { id: 'goalkeeper', availability: 'INSUFFICIENT_EVIDENCE', reason: 'not_enough_frames' });
    }
    return sections;
}
function buildVersions(params) {
    const prior = params.previous?.versions?.analysisVersion;
    return {
        analysisVersion: typeof prior === 'number' && Number.isFinite(prior) ? prior + 1 : 1,
        pipelineVersion: mode_1.PIPELINE_VERSION,
        analysisMode: params.mode,
        visionModel: params.visionModel,
        reasoningModel: params.reasoningModel ?? null,
        cvWorkerVersion: params.cvWorkerVersion ?? null,
    };
}
//# sourceMappingURL=reportSections.js.map