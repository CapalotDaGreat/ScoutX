/**
 * Season-level career views built only from recorded artefacts: per-season summaries, a Year
 * in Review, season-versus-season comparison and dated career firsts. Nothing is estimated;
 * a missing record leaves its field empty, and comparisons need a minimum sample.
 */

export type CareerRecords = {
  matches: ReadonlyArray<{
    id: string;
    date: string;
    opponent: string;
    position?: string;
    minutes: number;
    goals: number;
    assists: number;
  }>;
  journey: ReadonlyArray<{ id: string; type: string; title: string; organization?: string; date: string }>;
  trials: ReadonlyArray<{ id: string; club: string; status: string; scheduledDate: string }>;
  goals: ReadonlyArray<{
    id: string;
    title: string;
    status: string;
    createdAt: string;
    achievedAt: string | null;
    timeframeEnd: string | null;
  }>;
  reels: ReadonlyArray<{ id: string; title: string; createdAt: string }>;
  clips: ReadonlyArray<{ id: string; title: string; date: string }>;
  verifications: ReadonlyArray<{ id: string; status: string; evidence: string; updatedAt: string }>;
};

export type CareerFirstKind =
  | 'first_match'
  | 'first_goal'
  | 'first_assist'
  | 'first_trial'
  | 'verified_achievement'
  | 'goal_achieved'
  | 'first_reel'
  | 'club_change'
  | 'position_change';

export type CareerFirst = {
  id: string;
  kind: CareerFirstKind;
  date: string;
  /** Raw record text (opponent, club, goal title, positions). Never translated. */
  subject: string;
  previous: string | null;
  sourceId: string;
};

export type SeasonSummary = {
  season: string;
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  positions: Array<{ position: string; matches: number }>;
  clubs: string[];
  trials: number;
  reels: number;
  clips: number;
  goalsAchieved: number;
  bestMatch: { id: string; opponent: string; date: string; goals: number; assists: number } | null;
  matchIds: string[];
  firsts: CareerFirst[];
};

export type SeasonMetricKey = 'goalsPerMatch' | 'assistsPerMatch' | 'minutesPerMatch';

export type SeasonComparison = {
  current: string;
  previous: string;
  sufficient: boolean;
  metrics: Array<{ key: SeasonMetricKey; current: number; previous: number; delta: number }>;
};

export type NextChallenge =
  | { kind: 'goal'; title: string }
  | { kind: 'log_matches' }
  | { kind: 'upload_clip' }
  | { kind: 'set_goal' };

export type YearInReview = {
  summary: SeasonSummary;
  roleChanges: CareerFirst[];
  biggestImprovement: { key: SeasonMetricKey; delta: number; previousSeason: string } | null;
  nextChallenge: NextChallenge;
};

/** Matches per season before per-match averages are compared. */
export const MIN_COMPARISON_MATCHES = 3;

export function seasonOf(dateIso: string | null | undefined): string | null {
  if (!dateIso) return null;
  const at = new Date(dateIso);
  if (Number.isNaN(at.getTime())) return null;
  const year = at.getUTCFullYear();
  const start = at.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function byDate<T>(items: readonly T[], date: (item: T) => string): T[] {
  return [...items].filter((item) => !Number.isNaN(Date.parse(date(item)))).sort((a, b) => date(a).localeCompare(date(b)));
}

function normalizedPosition(value: string | undefined): string | null {
  const trimmed = value?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

export function buildCareerFirsts(records: CareerRecords): CareerFirst[] {
  const firsts: CareerFirst[] = [];
  const matches = byDate(records.matches, (match) => match.date);

  const first = matches[0];
  if (first) {
    firsts.push({ id: `first_match-${first.id}`, kind: 'first_match', date: first.date, subject: first.opponent, previous: null, sourceId: first.id });
  }
  const firstGoal = matches.find((match) => match.goals > 0);
  if (firstGoal) {
    firsts.push({ id: `first_goal-${firstGoal.id}`, kind: 'first_goal', date: firstGoal.date, subject: firstGoal.opponent, previous: null, sourceId: firstGoal.id });
  }
  const firstAssist = matches.find((match) => match.assists > 0);
  if (firstAssist) {
    firsts.push({ id: `first_assist-${firstAssist.id}`, kind: 'first_assist', date: firstAssist.date, subject: firstAssist.opponent, previous: null, sourceId: firstAssist.id });
  }

  let lastPosition: string | null = null;
  for (const match of matches) {
    const position = normalizedPosition(match.position);
    if (!position) continue;
    if (lastPosition && position !== lastPosition) {
      firsts.push({ id: `position_change-${match.id}`, kind: 'position_change', date: match.date, subject: position, previous: lastPosition, sourceId: match.id });
    }
    lastPosition = position;
  }

  const trial = byDate(
    records.trials.filter((item) => item.status === 'accepted' || item.status === 'completed'),
    (item) => item.scheduledDate,
  )[0];
  if (trial) {
    firsts.push({ id: `first_trial-${trial.id}`, kind: 'first_trial', date: trial.scheduledDate, subject: trial.club, previous: null, sourceId: trial.id });
  }

  for (const verification of records.verifications) {
    if (verification.status !== 'approved' || Number.isNaN(Date.parse(verification.updatedAt))) continue;
    firsts.push({
      id: `verified-${verification.id}`,
      kind: 'verified_achievement',
      date: verification.updatedAt,
      subject: verification.evidence,
      previous: null,
      sourceId: verification.id,
    });
  }

  for (const goal of records.goals) {
    if (goal.status !== 'achieved' || !goal.achievedAt || Number.isNaN(Date.parse(goal.achievedAt))) continue;
    firsts.push({ id: `goal_achieved-${goal.id}`, kind: 'goal_achieved', date: goal.achievedAt, subject: goal.title, previous: null, sourceId: goal.id });
  }

  const reel = byDate(records.reels, (item) => item.createdAt)[0];
  if (reel) {
    firsts.push({ id: `first_reel-${reel.id}`, kind: 'first_reel', date: reel.createdAt, subject: reel.title, previous: null, sourceId: reel.id });
  }

  let previousClub: string | null = null;
  for (const entry of byDate(records.journey.filter((item) => item.type === 'club_transfer'), (item) => item.date)) {
    const club = entry.organization?.trim() || entry.title.trim();
    firsts.push({ id: `club_change-${entry.id}`, kind: 'club_change', date: entry.date, subject: club, previous: previousClub, sourceId: entry.id });
    previousClub = club;
  }

  return firsts.sort((a, b) => b.date.localeCompare(a.date));
}

export function buildSeasonSummaries(records: CareerRecords): SeasonSummary[] {
  const firsts = buildCareerFirsts(records);
  const seasons = new Map<string, SeasonSummary>();
  const ensure = (season: string): SeasonSummary => {
    let summary = seasons.get(season);
    if (!summary) {
      summary = {
        season,
        matches: 0,
        minutes: 0,
        goals: 0,
        assists: 0,
        positions: [],
        clubs: [],
        trials: 0,
        reels: 0,
        clips: 0,
        goalsAchieved: 0,
        bestMatch: null,
        matchIds: [],
        firsts: [],
      };
      seasons.set(season, summary);
    }
    return summary;
  };

  for (const match of byDate(records.matches, (item) => item.date)) {
    const season = seasonOf(match.date);
    if (!season) continue;
    const summary = ensure(season);
    summary.matches += 1;
    summary.minutes += match.minutes;
    summary.goals += match.goals;
    summary.assists += match.assists;
    summary.matchIds.push(match.id);
    const position = normalizedPosition(match.position);
    if (position) {
      const entry = summary.positions.find((item) => item.position === position);
      if (entry) entry.matches += 1;
      else summary.positions.push({ position, matches: 1 });
    }
    const contribution = match.goals + match.assists;
    const best = summary.bestMatch;
    if (contribution > 0 && (!best || contribution > best.goals + best.assists)) {
      summary.bestMatch = { id: match.id, opponent: match.opponent, date: match.date, goals: match.goals, assists: match.assists };
    }
  }
  for (const entry of records.journey) {
    const season = seasonOf(entry.date);
    if (!season || entry.type !== 'club_transfer') continue;
    const club = entry.organization?.trim() || entry.title.trim();
    const summary = ensure(season);
    if (club && !summary.clubs.includes(club)) summary.clubs.push(club);
  }
  for (const trial of records.trials) {
    const season = seasonOf(trial.scheduledDate);
    if (season) ensure(season).trials += 1;
  }
  for (const reel of records.reels) {
    const season = seasonOf(reel.createdAt);
    if (season) ensure(season).reels += 1;
  }
  for (const clip of records.clips) {
    const season = seasonOf(clip.date);
    if (season) ensure(season).clips += 1;
  }
  for (const goal of records.goals) {
    const season = goal.status === 'achieved' ? seasonOf(goal.achievedAt) : null;
    if (season) ensure(season).goalsAchieved += 1;
  }
  for (const item of firsts) {
    const season = seasonOf(item.date);
    if (season) ensure(season).firsts.push(item);
  }
  for (const summary of seasons.values()) {
    summary.positions.sort((a, b) => b.matches - a.matches);
  }
  return [...seasons.values()].sort((a, b) => b.season.localeCompare(a.season));
}

function perMatch(summary: SeasonSummary, key: SeasonMetricKey): number {
  if (summary.matches === 0) return 0;
  const total = key === 'goalsPerMatch' ? summary.goals : key === 'assistsPerMatch' ? summary.assists : summary.minutes;
  return Math.round((total / summary.matches) * 100) / 100;
}

export function compareSeasons(current: SeasonSummary, previous: SeasonSummary): SeasonComparison {
  const keys: SeasonMetricKey[] = ['goalsPerMatch', 'assistsPerMatch', 'minutesPerMatch'];
  return {
    current: current.season,
    previous: previous.season,
    sufficient: current.matches >= MIN_COMPARISON_MATCHES && previous.matches >= MIN_COMPARISON_MATCHES,
    metrics: keys.map((key) => {
      const a = perMatch(current, key);
      const b = perMatch(previous, key);
      return { key, current: a, previous: b, delta: Math.round((a - b) * 100) / 100 };
    }),
  };
}

export function buildYearInReview(
  summaries: readonly SeasonSummary[],
  season: string,
  records: Pick<CareerRecords, 'goals'>,
): YearInReview | null {
  const index = summaries.findIndex((item) => item.season === season);
  if (index < 0) return null;
  const summary = summaries[index];
  const previous = summaries[index + 1] ?? null;

  let biggestImprovement: YearInReview['biggestImprovement'] = null;
  if (previous) {
    const comparison = compareSeasons(summary, previous);
    if (comparison.sufficient) {
      const best = comparison.metrics
        .filter((metric) => metric.delta > 0 && metric.previous > 0)
        .sort((a, b) => b.delta / b.previous - a.delta / a.previous)[0];
      if (best) biggestImprovement = { key: best.key, delta: best.delta, previousSeason: previous.season };
    }
  }

  const activeGoal = [...records.goals]
    .filter((goal) => goal.status === 'active' || goal.status === 'improving')
    .sort((a, b) => (a.timeframeEnd ?? '9999').localeCompare(b.timeframeEnd ?? '9999'))[0];
  const nextChallenge: NextChallenge = activeGoal
    ? { kind: 'goal', title: activeGoal.title }
    : summary.matches < MIN_COMPARISON_MATCHES
      ? { kind: 'log_matches' }
      : summary.clips === 0
        ? { kind: 'upload_clip' }
        : { kind: 'set_goal' };

  return {
    summary,
    roleChanges: summary.firsts.filter((item) => item.kind === 'position_change' || item.kind === 'club_change'),
    biggestImprovement,
    nextChallenge,
  };
}
