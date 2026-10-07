import type { CoverageState } from '@/features/development/types';
import type { DataProvenance } from '@/features/evidence/types';

export type CoverageDimensionId = 'technical' | 'tactical' | 'physical' | 'consistency' | 'video';

export type EvidenceCoverage = {
  id: CoverageDimensionId;
  state: CoverageState;
  sampleSize: number;
  requiredForStrong: number;
  lastAt: string | null;
  provenance: DataProvenance;
};

export type ReadinessItemStatus = 'ready' | 'missing' | 'partial';

export type ReadinessItem = {
  id: string;
  label: string;
  status: ReadinessItemStatus;
  reason: string;
  group: 'evidence' | 'sharing' | 'app_ops';
};

export type ProofItem = {
  id: string;
  title: string;
  detail: string;
  occurredAt: string | null;
  provenance: DataProvenance;
};

export type DiscoverabilityBlocker =
  | 'public_passport_off'
  | 'discovery_opt_in_off'
  | 'guardian_approval_needed'
  | 'no_matches'
  | 'no_video'
  | 'stale_evidence';

/** Evidence and settings only; views, followers and other popularity signals are never inputs. */
export type DiscoverabilityHealth = {
  discoverable: boolean;
  publicPassport: boolean;
  blockers: DiscoverabilityBlocker[];
  lastEvidenceAt: string | null;
  matchCount: number;
  videoCount: number;
};

export type PassportCoachTip = {
  id: string;
  title: string;
  reason: string;
  dimension: CoverageDimensionId | 'sharing';
};

export type PassportSummary = {
  playerId: string;
  computedAt: string;
  coverage: EvidenceCoverage[];
  readiness: ReadinessItem[];
  proof: ProofItem[];
  discoverability: DiscoverabilityHealth;
  coachTips: PassportCoachTip[];
  lastEvidenceAt: string | null;
  matchCount: number;
  videoCount: number;
  endorsementCount: number;
};
