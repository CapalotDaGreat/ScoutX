import type { MatchAnalysisReport } from '@/features/match-analysis/types';
import type {
  HighlightCandidate,
  HighlightEventKind,
  HighlightReelPlan,
  HighlightReelPreset,
} from '@/features/highlight-reel-studio/types';
import type { ReelSegment } from '@/features/reel-studio/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildEventKind(label: string): HighlightEventKind {
  const lower = label.toLowerCase();
  if (lower.includes('pass')) return 'progressivePass';
  if (lower.includes('carry')) return 'progressiveCarry';
  if (lower.includes('goal')) return 'goal';
  if (lower.includes('recover')) return 'recovery';
  if (lower.includes('save')) return 'save';
  if (lower.includes('defend')) return 'defensiveAction';
  if (lower.includes('dribble')) return 'dribble';
  if (lower.includes('shot')) return 'shot';
  return 'matchAction';
}

function mapCategory(label: string): HighlightCandidate['category'] {
  const lower = label.toLowerCase();
  if (lower.includes('pass') || lower.includes('carry') || lower.includes('shot')) return 'technical';
  if (lower.includes('recover') || lower.includes('press') || lower.includes('position')) return 'tactical';
  if (lower.includes('run') || lower.includes('sprint') || lower.includes('movement')) return 'physical';
  return 'story';
}

function isValidTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Turns AI report moments into reel candidates. Only moments with a real timestamp are used,
 * confidence comes from the model as-is, and AI-derived clips are never labelled "verified"
 * because nobody has confirmed them yet.
 */
export function buildHighlightCandidatesFromReport(
  report: MatchAnalysisReport,
  playerJersey?: string,
): HighlightCandidate[] {
  const reportConfidence = isValidTimestamp(report.confidence) ? clamp(report.confidence, 0, 1) : null;

  const baseMoments = (report.moments ?? []).flatMap((moment, index) =>
    isValidTimestamp(moment.timestampSec) && reportConfidence !== null
      ? [
          {
            id: `moment-${index}`,
            title: moment.label,
            description: moment.detail,
            timestampSec: moment.timestampSec,
            confidence: reportConfidence,
          },
        ]
      : [],
  );

  // Only observed evidence can become a clip. Inferred or unknown-kind evidence has no
  // visual backing at that timestamp, so it is never offered as a highlight.
  const evidence = (report.evidence ?? []).slice(0, 5).flatMap((item, index) =>
    item.kind === 'observation' &&
    isValidTimestamp(item.timestampSec) &&
    typeof item.confidence === 'number'
      ? [
          {
            id: `evidence-${index}`,
            title: item.label,
            description: item.detail,
            timestampSec: item.timestampSec,
            confidence: clamp(item.confidence, 0, 1),
          },
        ]
      : [],
  );

  const candidates: HighlightCandidate[] = [...baseMoments, ...evidence].map((item) => {
    const eventKind = buildEventKind(item.title);
    const category = mapCategory(item.title);
    const confidence = item.confidence;
    const highlightValue =
      Math.round(confidence * 100 * (category === 'technical' ? 1.2 : category === 'tactical' ? 1.15 : 1)) / 10;

    return {
      id: `candidate-${item.id}`,
      title: item.title.trim(),
      eventKind,
      category,
      description: item.description?.trim() ?? '',
      timestampSec: item.timestampSec,
      confidence,
      highlightValue,
      status: confidence >= 0.6 ? 'high-confidence' : 'needs-confirmation',
      source: 'match-analysis',
      targetJersey: playerJersey?.trim() ? playerJersey.trim() : null,
      coverageBand: report.coverage?.confidenceLabel ?? null,
    };
  });

  return candidates.slice(0, 8);
}

export function buildHighlightReelPlan(
  candidates: HighlightCandidate[],
  preset: HighlightReelPreset,
  targetDurationSec = 45,
): HighlightReelPlan {
  const ranked = [...candidates].sort((a, b) => b.highlightValue - a.highlightValue);
  const selected = ranked.slice(0, Math.max(3, Math.min(7, Math.round(targetDurationSec / 7.5))));

  const avgConfidence =
    selected.length > 0
      ? selected.reduce((sum, item) => sum + item.confidence, 0) / selected.length
      : 0;

  return {
    preset,
    targetDurationSec,
    candidates: selected,
    qualityScore: Math.min(100, Math.round(avgConfidence * 100)),
    coverage: selected.length > 0 ? 'ai_suggested' : 'none',
  };
}

/** Library item the server creates for validated full-match footage. */
export function footageMediaIdFor(jobId: string): string {
  return `footage_${jobId}`;
}

export const CANDIDATE_LEAD_SEC = 4;
export const CANDIDATE_TAIL_SEC = 6;

/**
 * Cuts each candidate moment out of the analysed footage, in match order. Windows that would
 * overlap the previous one are merged so the reel never repeats footage.
 */
export function segmentsFromCandidates(
  candidates: readonly HighlightCandidate[],
  footageMediaId: string,
  footageDurationSec: number | null,
): ReelSegment[] {
  const end = footageDurationSec && footageDurationSec > 0 ? footageDurationSec : Number.POSITIVE_INFINITY;
  const ordered = [...candidates]
    .filter((candidate) => isValidTimestamp(candidate.timestampSec) && candidate.timestampSec < end)
    .sort((a, b) => a.timestampSec - b.timestampSec);
  const segments: ReelSegment[] = [];
  for (const candidate of ordered) {
    const inSec = Math.max(0, candidate.timestampSec - CANDIDATE_LEAD_SEC);
    const outSec = Math.min(end, candidate.timestampSec + CANDIDATE_TAIL_SEC);
    const previous = segments[segments.length - 1];
    if (previous && inSec <= previous.outSec) {
      previous.outSec = outSec;
      continue;
    }
    segments.push({
      mediaId: footageMediaId,
      inSec,
      outSec,
      caption: candidate.title || undefined,
      evidenceId: candidate.id,
    });
  }
  return segments;
}