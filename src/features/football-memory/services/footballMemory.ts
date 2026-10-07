/**
 * Football Memory: an owner-scoped index over the player's own records, a rule-based query
 * parser and deterministic, evidence-linked answers. No language model is involved; when the
 * records cannot answer a question the result is `insufficient`, never a guess.
 */

export type MemoryKind = 'match' | 'clip' | 'reel' | 'analysis' | 'trial' | 'journey';

export type MemoryLink =
  | { route: 'stats'; entityId: string }
  | { route: 'analysis'; entityId: string }
  | { route: 'trial'; entityId: string }
  | { route: 'reel'; entityId: string }
  | { route: 'media'; entityId: string }
  | { route: 'career'; entityId: string };

export type MemoryMatchFacts = {
  minutes: number;
  goals: number;
  assists: number;
  /** Null when tackles were not recorded for this match. */
  tackles: number | null;
  cleanSheet: boolean;
  outcome: 'W' | 'D' | 'L' | null;
};

export type MemoryRecord = {
  id: string;
  kind: MemoryKind;
  title: string;
  date: string | null;
  season: string | null;
  opponent: string | null;
  competition: string | null;
  position: string | null;
  club: string | null;
  match: MemoryMatchFacts | null;
  link: MemoryLink;
  /** Lower-cased search text. */
  text: string;
};

export type MemorySources = {
  matches?: ReadonlyArray<{
    id: string;
    date: string;
    opponent: string;
    competition: string;
    result: string;
    position?: string;
    minutes: number;
    goals: number;
    assists: number;
    cleanSheet: boolean;
    tackles: number | null;
  }>;
  journey?: ReadonlyArray<{ id: string; type: string; title: string; organization?: string; date: string }>;
  trials?: ReadonlyArray<{ id: string; club: string; status: string; scheduledDate: string }>;
  videos?: ReadonlyArray<{
    id: string;
    title: string;
    category: string;
    opponent?: string;
    competition?: string;
    date: string;
    tags: readonly string[];
  }>;
  reels?: ReadonlyArray<{ id: string; title: string; preset: string; createdAt: string }>;
  analyses?: ReadonlyArray<{
    id: string;
    status: string;
    match: { opponent: string; competition: string; date: string };
    createdAt: string;
  }>;
};

/** European season label for a date, e.g. 2025-09-01 → "2025/26", 2026-03-01 → "2025/26". */
export function seasonFor(dateIso: string | null | undefined): string | null {
  if (!dateIso) return null;
  const at = new Date(dateIso);
  if (Number.isNaN(at.getTime())) return null;
  const year = at.getUTCFullYear();
  const start = at.getUTCMonth() >= 6 ? year : year - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
}

function parseOutcome(result: string): MemoryMatchFacts['outcome'] {
  const head = result.trim().toUpperCase();
  if (/^(W|WIN|WON)\b/.test(head)) return 'W';
  if (/^(D|DRAW|DREW)\b/.test(head)) return 'D';
  if (/^(L|LOSS|LOST)\b/.test(head)) return 'L';
  return null;
}

function clean(value: string | undefined | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function record(
  base: Omit<MemoryRecord, 'text' | 'season'> & { season?: string | null },
  extra: readonly string[] = [],
): MemoryRecord {
  const season = base.season ?? seasonFor(base.date);
  const text = [base.title, base.opponent, base.competition, base.position, base.club, season, ...extra]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return { ...base, season, text };
}

export function buildMemoryIndex(sources: MemorySources): MemoryRecord[] {
  const records: MemoryRecord[] = [];
  for (const match of sources.matches ?? []) {
    records.push(
      record({
        id: `match-${match.id}`,
        kind: 'match',
        title: match.opponent,
        date: clean(match.date),
        opponent: clean(match.opponent),
        competition: clean(match.competition),
        position: clean(match.position)?.toUpperCase() ?? null,
        club: null,
        match: {
          minutes: match.minutes,
          goals: match.goals,
          assists: match.assists,
          tackles: match.tackles,
          cleanSheet: match.cleanSheet,
          outcome: parseOutcome(match.result),
        },
        link: { route: 'stats', entityId: match.id },
      }),
    );
  }
  for (const entry of sources.journey ?? []) {
    records.push(
      record(
        {
          id: `journey-${entry.id}`,
          kind: 'journey',
          title: entry.title,
          date: clean(entry.date),
          opponent: null,
          competition: null,
          position: null,
          club: clean(entry.organization),
          match: null,
          link: { route: 'career', entityId: entry.id },
        },
        [entry.type],
      ),
    );
  }
  for (const trial of sources.trials ?? []) {
    records.push(
      record(
        {
          id: `trial-${trial.id}`,
          kind: 'trial',
          title: trial.club,
          date: clean(trial.scheduledDate),
          opponent: null,
          competition: null,
          position: null,
          club: clean(trial.club),
          match: null,
          link: { route: 'trial', entityId: trial.id },
        },
        [trial.status],
      ),
    );
  }
  for (const video of sources.videos ?? []) {
    records.push(
      record(
        {
          id: `clip-${video.id}`,
          kind: 'clip',
          title: video.title,
          date: clean(video.date),
          opponent: clean(video.opponent),
          competition: clean(video.competition),
          position: null,
          club: null,
          match: null,
          link: { route: 'media', entityId: video.id },
        },
        [video.category, ...video.tags],
      ),
    );
  }
  for (const reel of sources.reels ?? []) {
    records.push(
      record(
        {
          id: `reel-${reel.id}`,
          kind: 'reel',
          title: reel.title,
          date: clean(reel.createdAt),
          opponent: null,
          competition: null,
          position: null,
          club: null,
          match: null,
          link: { route: 'reel', entityId: reel.id },
        },
        [reel.preset],
      ),
    );
  }
  for (const job of sources.analyses ?? []) {
    if (job.status !== 'complete') continue;
    records.push(
      record({
        id: `analysis-${job.id}`,
        kind: 'analysis',
        title: job.match.opponent,
        date: clean(job.match.date) ?? clean(job.createdAt),
        opponent: clean(job.match.opponent),
        competition: clean(job.match.competition),
        position: null,
        club: null,
        match: null,
        link: { route: 'analysis', entityId: job.id },
      }),
    );
  }
  return records.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

export type MemoryIntent = 'list' | 'best_defensive' | 'best_attacking' | 'count' | 'latest';

export type MemoryQuery = {
  intent: MemoryIntent;
  kinds: MemoryKind[];
  /** Questions about goals or assists scored in matches. */
  stat: 'goals' | 'assists' | null;
  positions: string[];
  opponent: string | null;
  season: string | null;
  year: number | null;
  terms: string[];
};

const POSITION_CODES = new Set([
  'GK', 'CB', 'LB', 'RB', 'LWB', 'RWB', 'CDM', 'DM', 'CM', 'CAM', 'AM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF', 'SS',
]);

const POSITION_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/\b(goalkeeper|keeper|torwart|torh[üu]ter|gardien|portero|portiere|keeper|doelman|goleiro|guarda-redes)\b/, 'GK'],
  [/\b(centre[- ]?back|center[- ]?back|innenverteidiger|d[ée]fenseur central|central|difensore centrale|centrale verdediger|zagueiro)\b/, 'CB'],
  [/\b(striker|st[üu]rmer|mittelst[üu]rmer|attaquant|delantero|punta|attaccante|spits|avan[cç]ado|ponta de lan[cç]a)\b/, 'ST'],
  [/\b(winger|fl[üu]gelspieler|ailier|extremo|ala|vleugelspeler|ponta)\b/, 'W'],
  [/\b(midfielder|mittelfeld\w*|milieu|centrocampista|mediocampista|middenvelder|meio-campista|m[ée]dio)\b/, 'CM'],
];

const KIND_WORDS: ReadonlyArray<[RegExp, MemoryKind]> = [
  [/\b(match(es)?|games?|spiele?|partidos?|partit[ae]|wedstrijd(en)?|jogos?)\b/, 'match'],
  [/\b(clips?|videos?|vid[ée]os?|v[íi]deos?)\b/, 'clip'],
  [/\b(reels?)\b/, 'reel'],
  [/\b(analys[ie]s|analyse[ns]?|an[áa]lisis|analisi|an[áa]lises?)\b/, 'analysis'],
  [/\b(trials?|probetrainings?|essais?|pruebas?|provini?|proeftrainingen|proeftraining|testes?)\b/, 'trial'],
  [/\b(career|karriere|carri[èe]re|carrera|carriera|carri[èe]re|loopbaan|carreira|clubs?|vereine?|verein)\b/, 'journey'],
];

const GOAL_WORDS = /\b(goals?|tore|tor|buts?|goles?|gol|doelpunten|doelpunt|golos?)\b/;
const ASSIST_WORDS = /\b(assists?|vorlagen?|passes d[ée]cisives|asistencias?|assist|assistenze|assistências?|assistencias?)\b/;

const DEFENSIVE = /(best|top|strongest|beste?n?|meilleur\w*|mejor\w*|miglior\w*|melhor\w*).*(defensiv\w*|defensive|d[ée]fensi\w*|difensiv\w*|verdedig\w*|defending)/;
const ATTACKING = /(best|top|strongest|beste?n?|meilleur\w*|mejor\w*|miglior\w*|melhor\w*).*(attack\w*|offensiv\w*|attacking|ofensiv\w*|offensi\w*|aanvall\w*)/;
const COUNT = /\b(how many|how much|wie viele|wieviele|combien|cu[áa]nt[oa]s|quant[ieoa]s?|hoeveel)\b/;
const LATEST = /(?:^|\s)(last|latest|most recent|letzte[nrs]?|neueste[nrs]?|derni[èe]re?|[úu]ltim[oa]|laatste|recente?)\b/;
const OPPONENT = /\b(?:against|vs\.?|versus|gegen|contre|contra|contro|tegen)\s+([^,?.!]+?)(?=\s+(?:in|im|en|em|nel|della|season|saison|temporada|stagione|seizoen|\d{4})\b|[,?.!]|$)/;
const SEASON = /\b(20\d{2})\s*[/-]\s*(\d{2}|20\d{2})\b/;
const YEAR = /\b(20\d{2})\b/;

export function parseMemoryQuery(raw: string): MemoryQuery {
  let text = raw.trim().toLowerCase();
  const query: MemoryQuery = {
    intent: 'list',
    kinds: [],
    stat: null,
    positions: [],
    opponent: null,
    season: null,
    year: null,
    terms: [],
  };
  if (!text) return query;

  const opponent = OPPONENT.exec(text);
  if (opponent) {
    query.opponent = opponent[1].trim();
    text = text.replace(opponent[0], ' ');
  }
  const season = SEASON.exec(text);
  if (season) {
    const start = Number(season[1]);
    query.season = `${start}/${String((start + 1) % 100).padStart(2, '0')}`;
    text = text.replace(season[0], ' ');
  } else {
    const year = YEAR.exec(text);
    if (year) {
      query.year = Number(year[1]);
      text = text.replace(year[0], ' ');
    }
  }

  if (DEFENSIVE.test(text)) query.intent = 'best_defensive';
  else if (ATTACKING.test(text)) query.intent = 'best_attacking';
  else if (COUNT.test(text)) query.intent = 'count';
  else if (LATEST.test(text)) query.intent = 'latest';

  if (GOAL_WORDS.test(text)) query.stat = 'goals';
  else if (ASSIST_WORDS.test(text)) query.stat = 'assists';

  for (const [pattern, kind] of KIND_WORDS) {
    if (pattern.test(text) && !query.kinds.includes(kind)) query.kinds.push(kind);
  }
  if ((query.stat || query.intent === 'best_defensive' || query.intent === 'best_attacking') && !query.kinds.includes('match')) {
    query.kinds = ['match'];
  }

  for (const token of raw.split(/[^A-Za-z]+/)) {
    const code = token.toUpperCase();
    if (token.length >= 2 && token === code && POSITION_CODES.has(code) && !query.positions.includes(code)) {
      query.positions.push(code);
    }
  }
  for (const [pattern, code] of POSITION_WORDS) {
    if (pattern.test(text) && !query.positions.includes(code)) query.positions.push(code);
  }

  const consumed = [GOAL_WORDS, ASSIST_WORDS, COUNT, LATEST, DEFENSIVE, ATTACKING, ...KIND_WORDS.map(([p]) => p), ...POSITION_WORDS.map(([p]) => p)];
  let rest = text;
  for (const pattern of consumed) rest = rest.replace(new RegExp(pattern.source, 'g'), ' ');
  query.terms = rest
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term) && !POSITION_CODES.has(term.toUpperCase()));
  return query;
}

const STOP_WORDS = new Set([
  'the', 'and', 'did', 'was', 'were', 'what', 'which', 'when', 'show', 'find', 'with', 'for', 'have', 'had', 'score',
  'scored', 'play', 'played', 'match', 'mine', 'die', 'der', 'das', 'und', 'mit', 'habe', 'ich', 'wie', 'les', 'des',
  'une', 'avec', 'que', 'los', 'las', 'con', 'una', 'del', 'gli', 'che', 'het', 'een', 'van', 'met', 'dos',
  'com', 'uma', 'meu', 'mein', 'meine', 'mon', 'mes', 'mis', 'mio', 'miei', 'mijn', 'meus', 'minhas', 'my', 'all',
  'season', 'saison', 'temporada', 'stagione', 'seizoen', 'zeige', 'montre', 'muestra', 'mostra', 'toon',
]);

function positionMatches(recordPosition: string | null, wanted: readonly string[]): boolean {
  if (wanted.length === 0) return true;
  if (!recordPosition) return false;
  return wanted.some((code) =>
    code === 'W' ? recordPosition === 'LW' || recordPosition === 'RW' : recordPosition === code,
  );
}

/** Records matching every structured filter in the query plus all free-text terms. */
export function searchMemory(query: MemoryQuery, index: readonly MemoryRecord[]): MemoryRecord[] {
  return index.filter((item) => {
    if (query.kinds.length > 0 && !query.kinds.includes(item.kind)) return false;
    if (!positionMatches(item.position, query.positions)) return false;
    if (query.opponent && !(item.opponent ?? '').toLowerCase().includes(query.opponent)) return false;
    if (query.season && item.season !== query.season) return false;
    if (query.year !== null && !(item.date ?? '').startsWith(String(query.year))) return false;
    return query.terms.every((term) => item.text.includes(term));
  });
}

/** Minimum matches with recorded tackles before naming a best defensive game. */
export const MIN_DEFENSIVE_SAMPLE = 2;

export type MemoryAnswer =
  | { status: 'insufficient'; links: MemoryRecord[] }
  | { status: 'answered'; kind: 'best_defensive'; record: MemoryRecord; tackles: number; sample: number; links: MemoryRecord[] }
  | { status: 'answered'; kind: 'best_attacking'; record: MemoryRecord; goals: number; assists: number; links: MemoryRecord[] }
  | { status: 'answered'; kind: 'count_stat'; stat: 'goals' | 'assists'; total: number; matches: number; links: MemoryRecord[] }
  | { status: 'answered'; kind: 'count_records'; total: number; links: MemoryRecord[] }
  | { status: 'answered'; kind: 'latest'; record: MemoryRecord; links: MemoryRecord[] }
  | { status: 'answered'; kind: 'list'; total: number; links: MemoryRecord[] };

const LINK_LIMIT = 10;

/**
 * Deterministic answer from retrieved records only. A filter that matches nothing, a metric
 * that was never recorded or too small a sample all produce `insufficient`.
 */
export function answerMemoryQuestion(query: MemoryQuery, index: readonly MemoryRecord[]): MemoryAnswer {
  const hits = searchMemory(query, index);
  if (hits.length === 0) return { status: 'insufficient', links: [] };

  const matches = hits.filter((item) => item.match !== null);

  if (query.intent === 'best_defensive') {
    const withTackles = matches.filter((item) => item.match?.tackles !== null);
    if (withTackles.length < MIN_DEFENSIVE_SAMPLE) return { status: 'insufficient', links: withTackles };
    const best = [...withTackles].sort(
      (a, b) =>
        (b.match?.tackles ?? 0) - (a.match?.tackles ?? 0) ||
        Number(b.match?.cleanSheet) - Number(a.match?.cleanSheet) ||
        (b.date ?? '').localeCompare(a.date ?? ''),
    )[0];
    return {
      status: 'answered',
      kind: 'best_defensive',
      record: best,
      tackles: best.match?.tackles ?? 0,
      sample: withTackles.length,
      links: [best],
    };
  }

  if (query.intent === 'best_attacking') {
    const best = [...matches].sort(
      (a, b) =>
        (b.match?.goals ?? 0) + (b.match?.assists ?? 0) - ((a.match?.goals ?? 0) + (a.match?.assists ?? 0)) ||
        (b.match?.goals ?? 0) - (a.match?.goals ?? 0) ||
        (b.date ?? '').localeCompare(a.date ?? ''),
    )[0];
    if (!best || (best.match?.goals ?? 0) + (best.match?.assists ?? 0) === 0) {
      return { status: 'insufficient', links: [] };
    }
    return {
      status: 'answered',
      kind: 'best_attacking',
      record: best,
      goals: best.match?.goals ?? 0,
      assists: best.match?.assists ?? 0,
      links: [best],
    };
  }

  if (query.intent === 'count' && query.stat) {
    if (matches.length === 0) return { status: 'insufficient', links: [] };
    const stat = query.stat;
    const total = matches.reduce((sum, item) => sum + (item.match?.[stat] ?? 0), 0);
    return {
      status: 'answered',
      kind: 'count_stat',
      stat,
      total,
      matches: matches.length,
      links: matches.filter((item) => (item.match?.[stat] ?? 0) > 0).slice(0, LINK_LIMIT),
    };
  }

  if (query.intent === 'count') {
    return { status: 'answered', kind: 'count_records', total: hits.length, links: hits.slice(0, LINK_LIMIT) };
  }

  if (query.intent === 'latest') {
    return { status: 'answered', kind: 'latest', record: hits[0], links: [hits[0]] };
  }

  if (query.stat) {
    const stat = query.stat;
    const scored = matches.filter((item) => (item.match?.[stat] ?? 0) > 0);
    if (scored.length === 0) return { status: 'insufficient', links: [] };
    return { status: 'answered', kind: 'list', total: scored.length, links: scored.slice(0, LINK_LIMIT) };
  }

  return { status: 'answered', kind: 'list', total: hits.length, links: hits.slice(0, LINK_LIMIT) };
}
