import { Badge, type BadgeSize, type BadgeVariant } from '@/components/primitives/Badge';
import { type EvidenceConfidence, type EvidenceState } from '@/features/evidence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type EvidenceStateBadgeProps = {
  state: EvidenceState;
  /** Optional confidence appended to the label when known. */
  confidence?: EvidenceConfidence | null;
  size?: BadgeSize;
  className?: string;
};

function variantFor(state: EvidenceState): BadgeVariant {
  switch (state) {
    case 'available':
      return 'success';
    case 'partial':
      return 'warning';
    case 'pending':
      return 'info';
    case 'failed':
      return 'error';
    case 'insufficient':
    case 'unknown':
    default:
      return 'default';
  }
}

export function useEvidenceStateLabel(): (state: EvidenceState) => string {
  const { t } = useAppTranslation(['evidence']);
  return (state) => {
    switch (state) {
      case 'available':
        return t('evidence:state.available');
      case 'partial':
        return t('evidence:state.partial');
      case 'insufficient':
        return t('evidence:state.insufficient');
      case 'pending':
        return t('evidence:state.pending');
      case 'failed':
        return t('evidence:state.failed');
      case 'unknown':
      default:
        return t('evidence:state.unknown');
    }
  };
}

export function useConfidenceLabel(): (confidence: EvidenceConfidence) => string {
  const { t } = useAppTranslation(['evidence']);
  return (confidence) => {
    switch (confidence) {
      case 'high':
        return t('evidence:confidence.high');
      case 'medium':
        return t('evidence:confidence.medium');
      case 'low':
      default:
        return t('evidence:confidence.low');
    }
  };
}

export function EvidenceStateBadge({
  state,
  confidence = null,
  size = 'sm',
  className,
}: EvidenceStateBadgeProps) {
  const stateLabel = useEvidenceStateLabel();
  const confidenceLabel = useConfidenceLabel();
  const label =
    confidence && state === 'available'
      ? `${stateLabel(state)} · ${confidenceLabel(confidence)}`
      : stateLabel(state);
  return <Badge label={label} variant={variantFor(state)} size={size} className={className} />;
}
