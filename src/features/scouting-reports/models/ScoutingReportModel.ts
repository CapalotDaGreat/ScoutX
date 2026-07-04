import { RATING_MAX, RATING_MIN } from '@/features/scouting-reports/constants';
import {
  type ScoutingReport,
  type ScoutingReportDraft,
  type ScoutingReportRatings,
  defaultScoutingReportRatings,
} from '@/features/scouting-reports/types';
import { asRecord, parseStringList } from '@/utils/firestoreParsing';

function clampRating(value: number): number {
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value)));
}

function parseRatings(value: unknown): ScoutingReportRatings {
  const record = asRecord(value);
  const defaults = defaultScoutingReportRatings();

  if (!record) {
    return defaults;
  }

  return {
    overall: clampRating(typeof record.overall === 'number' ? record.overall : defaults.overall),
    potential: clampRating(typeof record.potential === 'number' ? record.potential : defaults.potential),
    technicalAbility: clampRating(
      typeof record.technicalAbility === 'number' ? record.technicalAbility : defaults.technicalAbility,
    ),
    tacticalIntelligence: clampRating(
      typeof record.tacticalIntelligence === 'number'
        ? record.tacticalIntelligence
        : defaults.tacticalIntelligence,
    ),
    physicalAbility: clampRating(
      typeof record.physicalAbility === 'number' ? record.physicalAbility : defaults.physicalAbility,
    ),
    mentality: clampRating(
      typeof record.mentality === 'number' ? record.mentality : defaults.mentality,
    ),
  };
}

export function parseScoutingReport(value: unknown, id: string): ScoutingReport | null {
  const record = asRecord(value);
  if (!record || typeof record.scoutId !== 'string' || typeof record.playerId !== 'string') {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id,
    scoutId: record.scoutId,
    scoutName: typeof record.scoutName === 'string' ? record.scoutName : undefined,
    playerId: record.playerId,
    playerName: typeof record.playerName === 'string' ? record.playerName : 'Unknown Player',
    ratings: parseRatings(record.ratings),
    strengths: parseStringList(record.strengths),
    weaknesses: parseStringList(record.weaknesses),
    recommendations: typeof record.recommendations === 'string' ? record.recommendations : '',
    suitablePlayingStyle:
      typeof record.suitablePlayingStyle === 'string' ? record.suitablePlayingStyle : '',
    suggestedFormation:
      typeof record.suggestedFormation === 'string' ? record.suggestedFormation : '',
    scoutNotes: typeof record.scoutNotes === 'string' ? record.scoutNotes : '',
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now,
  };
}

export function serializeScoutingReport(report: ScoutingReport): Record<string, unknown> {
  return {
    scoutId: report.scoutId,
    scoutName: report.scoutName,
    playerId: report.playerId,
    playerName: report.playerName,
    ratings: report.ratings,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    recommendations: report.recommendations,
    suitablePlayingStyle: report.suitablePlayingStyle,
    suggestedFormation: report.suggestedFormation,
    scoutNotes: report.scoutNotes,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export function createScoutingReportId(): string {
  return `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createScoutingReportFromDraft(
  scoutId: string,
  playerId: string,
  playerName: string,
  draft: ScoutingReportDraft,
  existing?: ScoutingReport,
): ScoutingReport {
  const now = new Date().toISOString();

  return {
    id: existing?.id ?? createScoutingReportId(),
    scoutId,
    scoutName: draft.scoutName ?? existing?.scoutName,
    playerId,
    playerName,
    ratings: draft.ratings,
    strengths: draft.strengths,
    weaknesses: draft.weaknesses,
    recommendations: draft.recommendations,
    suitablePlayingStyle: draft.suitablePlayingStyle,
    suggestedFormation: draft.suggestedFormation,
    scoutNotes: draft.scoutNotes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function scoutingReportToDraft(report: ScoutingReport): ScoutingReportDraft {
  return {
    scoutName: report.scoutName,
    ratings: report.ratings,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    recommendations: report.recommendations,
    suitablePlayingStyle: report.suitablePlayingStyle,
    suggestedFormation: report.suggestedFormation,
    scoutNotes: report.scoutNotes,
  };
}

export function sortScoutingReports(reports: ScoutingReport[]): ScoutingReport[] {
  return [...reports].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function parseMultilineList(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatMultilineList(items: string[]): string {
  return items.join('\n');
}

export function getRatingTier(value: number): 'elite' | 'strong' | 'solid' | 'developing' {
  if (value >= 85) {
    return 'elite';
  }
  if (value >= 75) {
    return 'strong';
  }
  if (value >= 65) {
    return 'solid';
  }
  return 'developing';
}
