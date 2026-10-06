import {
  type DataProvenance,
  type EvidenceConfidence,
  type EvidenceItem,
  type EvidenceKind,
  type EvidenceRef,
  type EvidenceState,
  type EvidenceVisibility,
  isDataProvenance,
  isEvidenceConfidence,
} from '@/features/evidence/types';

const EVIDENCE_KINDS: readonly EvidenceKind[] = [
  'match_log',
  'match_analysis',
  'video',
  'reel',
  'gps_session',
  'coach_observation',
  'club_record',
  'verification',
  'training_session',
  'goal',
  'milestone',
  'document',
  'other',
];

const EVIDENCE_STATES: readonly EvidenceState[] = [
  'available',
  'partial',
  'insufficient',
  'pending',
  'failed',
  'unknown',
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseKind(value: unknown): EvidenceKind | null {
  return typeof value === 'string' && (EVIDENCE_KINDS as readonly string[]).includes(value)
    ? (value as EvidenceKind)
    : null;
}

function parseState(value: unknown): EvidenceState {
  return typeof value === 'string' && (EVIDENCE_STATES as readonly string[]).includes(value)
    ? (value as EvidenceState)
    : 'unknown';
}

function parseVisibility(value: unknown): EvidenceVisibility {
  return value === 'public' || value === 'scouts' ? value : 'private';
}

function parseIso(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return Number.isNaN(new Date(value).getTime()) ? null : value;
}

function parseRef(value: unknown): EvidenceRef | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const kind = parseKind(record.kind);
  if (!kind || typeof record.id !== 'string' || record.id.length === 0) {
    return null;
  }
  return {
    kind,
    id: record.id,
    ...(typeof record.locator === 'string' ? { locator: record.locator } : {}),
    ...(typeof record.label === 'string' ? { label: record.label } : {}),
  };
}

/**
 * Parses a Firestore document into an `EvidenceItem`. Returns null when the mandatory
 * identity fields are missing; never fills missing values with assumptions.
 */
export function parseEvidenceItem(value: unknown): EvidenceItem | null {
  const record = asRecord(value);
  if (!record || typeof record.id !== 'string' || typeof record.ownerId !== 'string') {
    return null;
  }
  const kind = parseKind(record.kind);
  if (!kind) {
    return null;
  }
  const createdAt = parseIso(record.createdAt);
  if (!createdAt) {
    return null;
  }
  const provenance: DataProvenance = isDataProvenance(record.provenance)
    ? record.provenance
    : 'unknown';
  const confidence: EvidenceConfidence | null = isEvidenceConfidence(record.confidence)
    ? record.confidence
    : null;

  return {
    id: record.id,
    ownerId: record.ownerId,
    kind,
    provenance,
    state: parseState(record.state),
    confidence,
    title: typeof record.title === 'string' ? record.title : '',
    summary: typeof record.summary === 'string' ? record.summary : null,
    occurredAt: parseIso(record.occurredAt),
    createdAt,
    updatedAt: parseIso(record.updatedAt) ?? createdAt,
    visibility: parseVisibility(record.visibility),
    refs: Array.isArray(record.refs)
      ? record.refs.map(parseRef).filter((ref): ref is EvidenceRef => ref !== null)
      : [],
    tags: Array.isArray(record.tags)
      ? record.tags.filter((tag): tag is string => typeof tag === 'string')
      : [],
  };
}

export function serializeEvidenceItem(item: EvidenceItem): Record<string, unknown> {
  return {
    id: item.id,
    ownerId: item.ownerId,
    kind: item.kind,
    provenance: item.provenance,
    state: item.state,
    confidence: item.confidence,
    title: item.title,
    summary: item.summary,
    occurredAt: item.occurredAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    visibility: item.visibility,
    refs: item.refs,
    tags: item.tags,
  };
}
