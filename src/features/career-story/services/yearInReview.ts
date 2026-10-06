import type { CareerMoment, FootballStory, YearInReviewSnapshot } from '@/features/career-story/types';

function yearOf(iso: string): number | null {
  const year = new Date(iso).getFullYear();
  return Number.isFinite(year) ? year : null;
}

export function buildYearInReviewSnapshot(
  playerId: string,
  year: number,
  moments: CareerMoment[],
  recorded: { goals: number | null; assists: number | null },
  nowIso = new Date().toISOString(),
): YearInReviewSnapshot {
  const inYear = moments.filter((moment) => yearOf(moment.occurredAt) === year);
  const matchCount = inYear.filter((moment) => moment.kind === 'match').length;
  const trialCount = inYear.filter((moment) => moment.kind === 'trial').length;
  const parts: string[] = [];
  if (matchCount > 0) {
    parts.push(`${matchCount} logged match${matchCount === 1 ? '' : 'es'}`);
  }
  if (recorded.goals !== null) {
    parts.push(`${recorded.goals} recorded goal${recorded.goals === 1 ? '' : 's'}`);
  }
  if (recorded.assists !== null) {
    parts.push(`${recorded.assists} recorded assist${recorded.assists === 1 ? '' : 's'}`);
  }
  if (trialCount > 0) {
    parts.push(`${trialCount} trial${trialCount === 1 ? '' : 's'}`);
  }

  return {
    id: `${playerId}-${year}`,
    playerId,
    year,
    matchCount,
    goals: recorded.goals,
    assists: recorded.assists,
    trialCount,
    momentCount: inYear.length,
    generatedAt: nowIso,
    narrative: {
      text:
        inYear.length === 0
          ? 'Not enough recorded evidence for this year.'
          : `Year ${year}: ${parts.join(', ')}.`,
      label: 'generated_from_records',
    },
  };
}

export function buildFootballStory(
  playerId: string,
  moments: CareerMoment[],
  nowIso = new Date().toISOString(),
): FootballStory {
  const latest = moments.slice(0, 8);
  const paragraphs = latest.map((moment) =>
    [moment.occurredAt.slice(0, 10), moment.title, moment.detail].filter(Boolean).join(' · '),
  );
  return {
    playerId,
    paragraphs,
    momentIds: latest.map((moment) => moment.id),
    label: 'generated_from_records',
    generatedAt: nowIso,
  };
}
