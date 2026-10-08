import { cvEventsValidated, cvWorkerStatus } from './cvConfig';
import { PIPELINE_VERSION, type AnalysisMode } from './mode';

/**
 * Every report section states whether it is backed by evidence. A section the system cannot
 * produce is NOT_AVAILABLE with a reason; it is never filled with plausible-sounding text.
 */
export const SECTION_IDS = [
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
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export type SectionAvailability = 'AVAILABLE' | 'LIMITED' | 'INSUFFICIENT_EVIDENCE' | 'NOT_AVAILABLE';

export type SectionReason =
  | 'identity_confirmed'
  | 'identity_unconfirmed'
  | 'target_not_seen'
  | 'sampled_frames_only'
  | 'not_enough_frames'
  | 'needs_tracking'
  | 'cv_worker_not_configured'
  | 'cv_events_not_validated'
  | 'no_validated_events'
  | 'use_gps'
  | 'not_goalkeeper';

export type ReportSection = { id: SectionId; availability: SectionAvailability; reason: SectionReason };

export type SectionInputs = {
  identityConfirmed: boolean;
  targetSeenFrames: number;
  ratedTechniqueCount: number;
  decisionMoments: number;
  isGoalkeeper: boolean;
  goalkeeperNotes: number;
  validatedEventCount: number;
};

export function buildSections(input: SectionInputs, env: NodeJS.ProcessEnv = process.env): ReportSection[] {
  const cvStatus = cvWorkerStatus(env);
  const eventsValidated = cvEventsValidated(env);
  const cvReason: SectionReason = cvStatus === 'available' ? 'cv_events_not_validated' : 'cv_worker_not_configured';
  const sections: ReportSection[] = [
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
    sections.push(
      input.goalkeeperNotes > 0
        ? { id: 'goalkeeper', availability: 'LIMITED', reason: 'sampled_frames_only' }
        : { id: 'goalkeeper', availability: 'INSUFFICIENT_EVIDENCE', reason: 'not_enough_frames' },
    );
  }
  return sections;
}

export type ReportVersions = {
  analysisVersion: number;
  pipelineVersion: string;
  analysisMode: AnalysisMode;
  visionModel: string;
  reasoningModel: string | null;
  cvWorkerVersion: string | null;
};

export function buildVersions(params: {
  previous: unknown;
  mode: AnalysisMode;
  visionModel: string;
  reasoningModel?: string | null;
  cvWorkerVersion?: string | null;
}): ReportVersions {
  const prior = (params.previous as { versions?: { analysisVersion?: unknown } } | null | undefined)?.versions?.analysisVersion;
  return {
    analysisVersion: typeof prior === 'number' && Number.isFinite(prior) ? prior + 1 : 1,
    pipelineVersion: PIPELINE_VERSION,
    analysisMode: params.mode,
    visionModel: params.visionModel,
    reasoningModel: params.reasoningModel ?? null,
    cvWorkerVersion: params.cvWorkerVersion ?? null,
  };
}
