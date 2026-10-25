import type { MatchAnalysisJob } from '../../types';

export function recordingTimestamp(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function reportEvidence(job: MatchAnalysisJob) {
  const duration = job.measuredDurationSec ?? job.durationSec;
  const validTime = (value: number | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
    Number.isFinite(duration) && duration > 0 && value <= duration;
  const frames = new Map(job.frames.filter((frame) => validTime(frame.timestampSec)).map((frame) => [frame.id, frame]));
  return (job.report?.evidence ?? []).map((point) => {
    const cited = (point.frameIds ?? []).map((id) => frames.get(id)).filter((frame) => frame !== undefined);
    // Do not turn an uncited model timestamp into video evidence or hide conflicting references.
    const linked = cited.length > 0 && cited.length === (point.frameIds ?? []).length;
    const timestampSec = linked ? Math.min(...cited.map((frame) => frame.timestampSec)) : null;
    return { point, timestampSec, frameIds: linked ? cited.map((frame) => frame.id) : [] };
  });
}
