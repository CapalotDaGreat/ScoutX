import { RATING_MAX, RATING_MIN } from '@/features/scouting-reports/constants';
import {
  type ScoutingReport,
  type ScoutingReportDraft,
  type ScoutingReportRatings,
  type ScoutingReportRecommendation,
  defaultScoutingReportRatings,
} from '@/features/scouting-reports/types';
import { asRecord, parseStringList } from '@/utils/firestoreParsing';
import { createSecureId } from '@/utils/secureId';

function clampRating(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value)));
}

function parseRatings(value: unknown): ScoutingReportRatings {
  const record = asRecord(value);
  if (!record) {
    return defaultScoutingReportRatings();
  }

  return {
    overall: clampRating(record.overall),
    potential: clampRating(record.potential),
    technicalAbility: clampRating(record.technicalAbility),
    tacticalIntelligence: clampRating(record.tacticalIntelligence),
    physicalAbility: clampRating(record.physicalAbility),
    mentality: clampRating(record.mentality),
  };
}

function parseRecommendation(value: unknown): ScoutingReportRecommendation | null {
  return value === 'monitor' ||
    value === 'invite' ||
    value === 'trial' ||
    value === 'pass' ||
    value === 'insufficient_evidence'
    ? value
    : null;
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
    concerns: parseStringList(record.concerns),
    roleFit: typeof record.roleFit === 'string' ? record.roleFit : '',
    evidenceIds: parseStringList(record.evidenceIds),
    recommendation: parseRecommendation(record.recommendation),
    confidenceLabel:
      record.confidenceLabel === 'high' ||
      record.confidenceLabel === 'moderate' ||
      record.confidenceLabel === 'limited' ||
      record.confidenceLabel === 'insufficient'
        ? record.confidenceLabel
        : 'insufficient',
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
    concerns: report.concerns,
    roleFit: report.roleFit,
    evidenceIds: report.evidenceIds,
    recommendation: report.recommendation,
    confidenceLabel: report.confidenceLabel,
    recommendations: report.recommendations,
    suitablePlayingStyle: report.suitablePlayingStyle,
    suggestedFormation: report.suggestedFormation,
    scoutNotes: report.scoutNotes,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export function createScoutingReportId(): string {
  return createSecureId('report', 8, '-');
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
    concerns: draft.concerns,
    roleFit: draft.roleFit,
    evidenceIds: draft.evidenceIds,
    recommendation: draft.recommendation,
    confidenceLabel: draft.confidenceLabel,
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
    concerns: report.concerns,
    roleFit: report.roleFit,
    evidenceIds: report.evidenceIds,
    recommendation: report.recommendation,
    confidenceLabel: report.confidenceLabel,
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

export function getRatingTier(
  value: number | null,
): 'elite' | 'strong' | 'solid' | 'developing' | 'unrated' {
  if (value === null) {
    return 'unrated';
  }
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
