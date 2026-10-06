import {
  GOAL_CATEGORIES,
  GOAL_METRIC_KEYS,
  TRAINING_SESSION_TYPES,
  type DevelopmentGoal,
  type DevelopmentGoalDraft,
  type GoalCategory,
  type GoalMeasurement,
  type GoalMetricKey,
  type GoalOrigin,
  type GoalProgressEntry,
  type GoalProgressSource,
  type GoalStatus,
  type IdentitySnapshot,
  type IdentitySource,
  type TrainingReflection,
  type TrainingSession,
  type TrainingSessionDraft,
  type TrainingSessionType,
} from '@/features/development/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function nullableNum(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const GOAL_STATUSES: readonly GoalStatus[] = ['not_started', 'active', 'improving', 'achieved', 'revisit'];
const GOAL_ORIGINS: readonly GoalOrigin[] = ['manual', 'coaching_moment', 'passport_coach'];
const PROGRESS_SOURCES: readonly GoalProgressSource[] = ['manual', 'match', 'training'];
const IDENTITY_SOURCES: readonly IdentitySource[] = ['self_reported', 'club_provided', 'coach_provided'];

export function parseGoalMeasurement(value: unknown): GoalMeasurement | null {
  const record = asRecord(value);
  const measured = record ? nullableNum(record.value) : null;
  if (!record || measured === null) {
    return null;
  }
  return {
    value: measured,
    sampleSize: nullableNum(record.sampleSize) ?? 0,
    evidenceIds: strArray(record.evidenceIds),
    measuredAt: str(record.measuredAt),
  };
}

export function parseProgressEntry(value: unknown): GoalProgressEntry | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || typeof record.date !== 'string') {
    return null;
  }
  return {
    id: record.id,
    date: record.date,
    note: str(record.note),
    value: nullableNum(record.value),
    evidenceIds: strArray(record.evidenceIds),
    source: oneOf(record.source, PROGRESS_SOURCES, 'manual'),
  };
}

export function parseDevelopmentGoal(id: string, value: unknown): DevelopmentGoal | null {
  const record = asRecord(value);
  if (!record || typeof record.ownerId !== 'string' || typeof record.title !== 'string') {
    return null;
  }
  const createdAt = str(record.createdAt, new Date(0).toISOString());
  return {
    id,
    ownerId: record.ownerId,
    title: record.title,
    category: oneOf<GoalCategory>(record.category, GOAL_CATEGORIES, 'technical'),
    metricKey: oneOf<GoalMetricKey>(record.metricKey, GOAL_METRIC_KEYS, 'none'),
    positionRelevance: strArray(record.positionRelevance),
    baseline: parseGoalMeasurement(record.baseline),
    targetValue: nullableNum(record.targetValue),
    targetLabel: str(record.targetLabel),
    timeframeEnd: nullableStr(record.timeframeEnd),
    status: oneOf(record.status, GOAL_STATUSES, 'active'),
    progress: Array.isArray(record.progress)
      ? record.progress.map(parseProgressEntry).filter((entry): entry is GoalProgressEntry => entry !== null)
      : [],
    linkedMatchIds: strArray(record.linkedMatchIds),
    linkedTrainingIds: strArray(record.linkedTrainingIds),
    evidenceIds: strArray(record.evidenceIds),
    practiceSuggestions: strArray(record.practiceSuggestions),
    reflection: str(record.reflection),
    origin: oneOf(record.origin, GOAL_ORIGINS, 'manual'),
    createdAt,
    updatedAt: str(record.updatedAt, createdAt),
    achievedAt: nullableStr(record.achievedAt),
  };
}

export function serializeDevelopmentGoal(goal: DevelopmentGoal): Record<string, unknown> {
  return {
    id: goal.id,
    ownerId: goal.ownerId,
    title: goal.title,
    category: goal.category,
    metricKey: goal.metricKey,
    positionRelevance: goal.positionRelevance,
    baseline: goal.baseline,
    targetValue: goal.targetValue,
    targetLabel: goal.targetLabel,
    timeframeEnd: goal.timeframeEnd,
    status: goal.status,
    progress: goal.progress,
    linkedMatchIds: goal.linkedMatchIds,
    linkedTrainingIds: goal.linkedTrainingIds,
    evidenceIds: goal.evidenceIds,
    practiceSuggestions: goal.practiceSuggestions,
    reflection: goal.reflection,
    origin: goal.origin,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
    achievedAt: goal.achievedAt,
  };
}

export function createDevelopmentGoal(
  ownerId: string,
  id: string,
  draft: DevelopmentGoalDraft,
  baseline: GoalMeasurement | null,
  now: Date,
): DevelopmentGoal {
  const iso = now.toISOString();
  return {
    id,
    ownerId,
    title: draft.title.trim(),
    category: draft.category,
    metricKey: draft.metricKey,
    positionRelevance: draft.positionRelevance ?? [],
    baseline,
    targetValue: draft.targetValue,
    targetLabel: draft.targetLabel.trim(),
    timeframeEnd: draft.timeframeEnd,
    status: 'active',
    progress: [],
    linkedMatchIds: [],
    linkedTrainingIds: [],
    evidenceIds: draft.evidenceIds ?? [],
    practiceSuggestions: draft.practiceSuggestions ?? [],
    reflection: '',
    origin: draft.origin ?? 'manual',
    createdAt: iso,
    updatedAt: iso,
    achievedAt: null,
  };
}

export type GoalDraftValidationError = 'title_required' | 'target_required_for_metric' | 'invalid_target' | 'invalid_date';

export function validateGoalDraft(draft: DevelopmentGoalDraft): GoalDraftValidationError | null {
  if (draft.title.trim().length === 0) {
    return 'title_required';
  }
  if (draft.metricKey !== 'none') {
    if (draft.targetValue === null) {
      return 'target_required_for_metric';
    }
    if (!Number.isFinite(draft.targetValue) || draft.targetValue < 0) {
      return 'invalid_target';
    }
  }
  if (draft.timeframeEnd && Number.isNaN(Date.parse(draft.timeframeEnd))) {
    return 'invalid_date';
  }
  return null;
}

export function parseTrainingReflection(value: unknown): TrainingReflection | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const wentWell = str(record.wentWell);
  const improve = str(record.improve);
  return wentWell || improve ? { wentWell, improve } : null;
}

export function parseTrainingSession(id: string, value: unknown): TrainingSession | null {
  const record = asRecord(value);
  if (!record || typeof record.ownerId !== 'string' || typeof record.date !== 'string') {
    return null;
  }
  const createdAt = str(record.createdAt, record.date);
  return {
    id,
    ownerId: record.ownerId,
    type: oneOf<TrainingSessionType>(record.type, TRAINING_SESSION_TYPES, 'other'),
    date: record.date,
    durationMin: nullableNum(record.durationMin),
    focus: str(record.focus),
    goalIds: strArray(record.goalIds),
    notes: str(record.notes),
    evidenceIds: strArray(record.evidenceIds),
    reflection: parseTrainingReflection(record.reflection),
    createdAt,
    updatedAt: str(record.updatedAt, createdAt),
  };
}

export function serializeTrainingSession(session: TrainingSession): Record<string, unknown> {
  return {
    id: session.id,
    ownerId: session.ownerId,
    type: session.type,
    date: session.date,
    durationMin: session.durationMin,
    focus: session.focus,
    goalIds: session.goalIds,
    notes: session.notes,
    evidenceIds: session.evidenceIds,
    reflection: session.reflection,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

export function createTrainingSession(
  ownerId: string,
  id: string,
  draft: TrainingSessionDraft,
  now: Date,
): TrainingSession {
  const iso = now.toISOString();
  return {
    id,
    ownerId,
    type: draft.type,
    date: draft.date,
    durationMin: draft.durationMin,
    focus: draft.focus.trim(),
    goalIds: draft.goalIds,
    notes: draft.notes.trim(),
    evidenceIds: [],
    reflection: draft.reflection ?? null,
    createdAt: iso,
    updatedAt: iso,
  };
}

/** A copy of a previous session for today, so a routine can be re-logged in one tap. */
export function repeatTrainingDraft(session: TrainingSession, today: string): TrainingSessionDraft {
  return {
    type: session.type,
    date: today,
    durationMin: session.durationMin,
    focus: session.focus,
    goalIds: session.goalIds,
    notes: '',
    reflection: null,
  };
}

export type TrainingDraftValidationError = 'invalid_date' | 'invalid_duration' | 'focus_required';

export function validateTrainingDraft(draft: TrainingSessionDraft): TrainingDraftValidationError | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || Number.isNaN(Date.parse(draft.date))) {
    return 'invalid_date';
  }
  if (draft.durationMin !== null && (!Number.isInteger(draft.durationMin) || draft.durationMin <= 0 || draft.durationMin > 600)) {
    return 'invalid_duration';
  }
  if (draft.focus.trim().length === 0) {
    return 'focus_required';
  }
  return null;
}

export function parseIdentitySnapshot(id: string, value: unknown): IdentitySnapshot | null {
  const record = asRecord(value);
  if (!record || typeof record.ownerId !== 'string' || typeof record.effectiveFrom !== 'string') {
    return null;
  }
  return {
    id,
    ownerId: record.ownerId,
    effectiveFrom: record.effectiveFrom,
    position: nullableStr(record.position),
    secondaryPositions: strArray(record.secondaryPositions),
    club: nullableStr(record.club),
    style: nullableStr(record.style),
    strongFoot: nullableStr(record.strongFoot),
    source: oneOf(record.source, IDENTITY_SOURCES, 'self_reported'),
    createdAt: str(record.createdAt, record.effectiveFrom),
  };
}

export function serializeIdentitySnapshot(snapshot: IdentitySnapshot): Record<string, unknown> {
  return { ...snapshot };
}
