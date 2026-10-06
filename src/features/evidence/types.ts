/**
 * Evidence & provenance model.
 *
 * Every value that is shown to a player or a scout carries a provenance so the UI can
 * explain where it came from. Unknown data stays unknown: nothing in this module ever
 * turns a missing value into a positive assumption.
 */

export type DataProvenance =
  | 'self_reported'
  | 'match_derived'
  | 'ai_derived'
  | 'ai_estimated'
  | 'coach_provided'
  | 'club_provided'
  | 'gps_derived'
  | 'verified'
  | 'unverified'
  | 'observed'
  | 'inferred'
  | 'unknown';

export const DATA_PROVENANCES: readonly DataProvenance[] = [
  'self_reported',
  'match_derived',
  'ai_derived',
  'ai_estimated',
  'coach_provided',
  'club_provided',
  'gps_derived',
  'verified',
  'unverified',
  'observed',
  'inferred',
  'unknown',
] as const;

export function isDataProvenance(value: unknown): value is DataProvenance {
  return typeof value === 'string' && (DATA_PROVENANCES as readonly string[]).includes(value);
}

/**
 * Lifecycle of a piece of evidence or a derived value.
 *
 * - `available`: evidence exists and is usable.
 * - `partial`: some evidence exists but it does not cover the full claim.
 * - `insufficient`: not enough evidence to show a value; render "insufficient evidence".
 * - `pending`: evidence is being produced (upload, analysis job, coach confirmation).
 * - `failed`: production failed; offer retry.
 * - `unknown`: nothing is known.
 */
export type EvidenceState =
  | 'available'
  | 'partial'
  | 'insufficient'
  | 'pending'
  | 'failed'
  | 'unknown';

export type EvidenceConfidence = 'low' | 'medium' | 'high';

export function isEvidenceConfidence(value: unknown): value is EvidenceConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

export type EvidenceKind =
  | 'match_log'
  | 'match_analysis'
  | 'video'
  | 'reel'
  | 'gps_session'
  | 'coach_observation'
  | 'club_record'
  | 'verification'
  | 'training_session'
  | 'goal'
  | 'milestone'
  | 'document'
  | 'other';

export type EvidenceVisibility = 'private' | 'scouts' | 'public';

/**
 * A reference to the source that backs a value. Only `kind` and `id` are required; extra
 * pointers (timestamps, frame ids) are optional and never defaulted.
 */
export type EvidenceRef = {
  kind: EvidenceKind;
  id: string;
  /** Sub-pointer inside the source (video second, frame id, section). */
  locator?: string;
  label?: string;
};

/**
 * Canonical document stored at `players/{uid}/evidenceItems/{evidenceId}`.
 */
export type EvidenceItem = {
  id: string;
  ownerId: string;
  kind: EvidenceKind;
  provenance: DataProvenance;
  state: EvidenceState;
  /** Confidence is only set when a producer actually computed one. */
  confidence: EvidenceConfidence | null;
  title: string;
  summary: string | null;
  /** ISO timestamp when the underlying event happened; null when unknown. */
  occurredAt: string | null;
  createdAt: string;
  updatedAt: string;
  visibility: EvidenceVisibility;
  refs: EvidenceRef[];
  tags: string[];
};

/**
 * A single value with its provenance attached. `value: null` is the honest representation
 * of "unknown". Components must never replace a null value with a default.
 */
export type ProvenancedValue<T> = {
  value: T | null;
  provenance: DataProvenance;
  state: EvidenceState;
  confidence: EvidenceConfidence | null;
  /** ISO date of the most recent underlying evidence. */
  asOf: string | null;
  refs: EvidenceRef[];
};

export function unknownValue<T>(): ProvenancedValue<T> {
  return {
    value: null,
    provenance: 'unknown',
    state: 'unknown',
    confidence: null,
    asOf: null,
    refs: [],
  };
}

export function provenancedValue<T>(
  value: T | null,
  provenance: DataProvenance,
  options: Partial<Omit<ProvenancedValue<T>, 'value' | 'provenance'>> = {},
): ProvenancedValue<T> {
  if (value === null) {
    return {
      value: null,
      provenance,
      state: options.state ?? 'insufficient',
      confidence: null,
      asOf: options.asOf ?? null,
      refs: options.refs ?? [],
    };
  }
  return {
    value,
    provenance,
    state: options.state ?? 'available',
    confidence: options.confidence ?? null,
    asOf: options.asOf ?? null,
    refs: options.refs ?? [],
  };
}
