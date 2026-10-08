import { citedFrameIds, isKnownJobObject, isTerminalStatus, jobMediaPrefix, LIFECYCLE } from './mediaLifecycle';

/**
 * Legacy media: settled match-analysis jobs from before the lifecycle shipped, which the hourly
 * sweep never visits (no `mediaCleanupState`). Cleanup is planned per exact object, reported
 * first (dry run), and applied only from a reviewed report with generation preconditions.
 *
 * Source videos are never deleted automatically here: before the lifecycle, footage could appear
 * in the player's media library, and nobody was asked to choose "Keep match video". Deleting
 * sources needs an explicit owner decision (`includeSources`) and never touches library-filed
 * footage.
 */
export type LegacyAction =
  | 'delete_uncited_frame'
  | 'delete_unused_source'
  | 'keep_cited_frame'
  | 'keep_identity_frame'
  | 'keep_clip'
  | 'keep_source_in_library'
  | 'keep_source_retained'
  | 'review_source_no_decision'
  | 'review_unrecognised';

export type LegacyObject = { name: string; generation: string; size: number; updated: string };

export type LegacyJob = {
  playerId?: unknown;
  status?: unknown;
  mediaCleanupState?: unknown;
  updatedAt?: unknown;
  retainSource?: unknown;
  videoStoragePath?: unknown;
  frames?: Array<{ id?: string; index?: number; storagePath?: string }>;
  report?: unknown;
  pendingCoaching?: unknown;
  identityConfirmation?: { state?: string; frameIds?: string[] } | null;
};

export type LegacyEntry = LegacyObject & { action: LegacyAction };

export type LegacyJobPlan = {
  jobId: string;
  ownerId: string;
  status: string;
  entries: LegacyEntry[];
};

export function isLegacyJob(job: LegacyJob, now: Date): boolean {
  if (typeof job.playerId !== 'string' || !job.playerId || !isTerminalStatus(job.status)) return false;
  if (job.mediaCleanupState === 'done' || job.mediaCleanupState === 'pending' || job.mediaCleanupState === 'retry_window') return false;
  // Failed jobs keep their media for the normal retry window before anything is proposed.
  const updated = typeof job.updatedAt === 'string' ? Date.parse(job.updatedAt) : NaN;
  if (job.status === 'failed' && !(now.getTime() - updated > LIFECYCLE.keepForRetryDays * 86_400_000)) return false;
  return true;
}

function frameId(frame: { id?: string; index?: number }): string | null {
  if (typeof frame.id === 'string' && frame.id) return frame.id;
  return typeof frame.index === 'number' ? `frame_${frame.index}` : null;
}

export function planLegacyJob(
  jobId: string,
  job: LegacyJob,
  objects: LegacyObject[],
  options: { inMediaLibrary: boolean; includeSources: boolean },
): LegacyJobPlan {
  const ownerId = String(job.playerId);
  const prefix = jobMediaPrefix(ownerId, jobId);
  const complete = job.status === 'complete';
  const cited = complete ? citedFrameIds([job.report, job.pendingCoaching]) : new Set<string>();
  const identity = complete && job.identityConfirmation?.state === 'confirmed' ? new Set(job.identityConfirmation.frameIds ?? []) : new Set<string>();
  const frameIdsByPath = new Map<string, string>();
  for (const frame of job.frames ?? []) {
    const id = frameId(frame);
    if (id && typeof frame.storagePath === 'string') frameIdsByPath.set(frame.storagePath, id);
  }
  const sourcePath = `${prefix}video.mp4`;

  const entries = objects
    .filter((object) => object.name.startsWith(prefix))
    .map((object): LegacyEntry => {
      const relative = object.name.slice(prefix.length);
      let action: LegacyAction;
      if (!isKnownJobObject(prefix, object.name)) action = 'review_unrecognised';
      else if (object.name === sourcePath) {
        if (options.inMediaLibrary) action = 'keep_source_in_library';
        else if (job.retainSource === true) action = 'keep_source_retained';
        else action = options.includeSources ? 'delete_unused_source' : 'review_source_no_decision';
      } else if (relative.startsWith('clips/')) action = 'keep_clip';
      else {
        const id = frameIdsByPath.get(object.name) ?? relative.slice('frames/'.length).replace(/\.jpg$/, '');
        action = cited.has(id) ? 'keep_cited_frame' : identity.has(id) ? 'keep_identity_frame' : 'delete_uncited_frame';
      }
      return { ...object, action };
    });
  return { jobId, ownerId, status: String(job.status), entries };
}

export const isDeleteAction = (action: LegacyAction): boolean => action.startsWith('delete_');

export type LegacySummary = Record<LegacyAction, { objects: number; bytes: number }> & { jobs: number };

export function summariseLegacy(plans: LegacyJobPlan[]): LegacySummary {
  const summary = { jobs: plans.length } as LegacySummary;
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
