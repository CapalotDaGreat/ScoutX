import type {
  CoachingMoment,
  MatchAnalysisEvent,
  MatchAnalysisEvidencePoint,
} from '@/features/match-analysis/types';

export const NOT_ENOUGH_EVIDENCE = 'Not enough evidence yet';

export type AskThisMatchInput = {
  question: string;
  events: MatchAnalysisEvent[];
  evidence: MatchAnalysisEvidencePoint[];
  coachingMoments: CoachingMoment[];
};

export type AskThisMatchCitation = {
  evidenceId: string;
  label: string;
};

export type AskThisMatchResult = {
  state: 'answered' | 'insufficient';
  answer: string;
  citations: AskThisMatchCitation[];
};

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

function overlaps(questionTokens: string[], haystack: string): boolean {
  const hay = haystack.toLowerCase();
  return questionTokens.some((token) => hay.includes(token));
}

/**
 * Answers only from stored events / evidence / coaching moments.
 * Never invents a football claim. Empty or unmatched evidence returns a fixed state.
 */
export function answerAskThisMatch(input: AskThisMatchInput): AskThisMatchResult {
  const question = input.question.trim();
  const acceptedEvents = input.events.filter((event) => event.validationStatus === 'accepted');
  const observations = input.evidence.filter((item) => item.kind === 'observation');
  const moments = input.coachingMoments.filter((moment) => moment.evidenceRefs.length > 0);

  if (!question || (acceptedEvents.length === 0 && observations.length === 0 && moments.length === 0)) {
    return { state: 'insufficient', answer: NOT_ENOUGH_EVIDENCE, citations: [] };
  }

  const questionTokens = tokens(question);
  const citations: AskThisMatchCitation[] = [];
  const lines: string[] = [];

  for (const event of acceptedEvents) {
    const blob = `${event.type} ${event.tacticalPhase ?? ''} ${event.fieldZone ?? ''}`;
    if (questionTokens.length === 0 || overlaps(questionTokens, blob)) {
      lines.push(`Recorded ${event.type} at ${event.videoTimestampSec}s.`);
      citations.push({ evidenceId: event.eventId, label: event.type });
    }
  }

  for (const item of observations) {
    const blob = `${item.label} ${item.detail}`;
    if (questionTokens.length === 0 || overlaps(questionTokens, blob)) {
      lines.push(item.detail || item.label);
      citations.push({
        evidenceId: item.id ?? item.label,
        label: item.label,
      });
    }
  }

  for (const moment of moments) {
    const blob = `${moment.context} ${moment.coachingPoint}`;
    if (questionTokens.length === 0 || overlaps(questionTokens, blob)) {
      lines.push(moment.coachingPoint);
      citations.push({ evidenceId: moment.id, label: moment.coachingPoint.slice(0, 80) });
    }
  }

  if (lines.length === 0) {
    return { state: 'insufficient', answer: NOT_ENOUGH_EVIDENCE, citations: [] };
  }

  return {
    state: 'answered',
    answer: lines.slice(0, 6).join(' '),
    citations: citations.slice(0, 8),
  };
}
