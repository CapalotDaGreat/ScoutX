import { Badge, type BadgeSize, type BadgeVariant } from '@/components/primitives/Badge';
import { type DataProvenance } from '@/features/evidence/types';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

export type ProvenanceBadgeProps = {
  provenance: DataProvenance;
  size?: BadgeSize;
  className?: string;
};

function variantFor(provenance: DataProvenance): BadgeVariant {
  switch (provenance) {
    case 'verified':
    case 'club_provided':
      return 'prestige';
    case 'match_derived':
    case 'gps_derived':
    case 'observed':
      return 'success';
    case 'coach_provided':
      return 'accent';
    case 'ai_derived':
      return 'info';
    case 'ai_estimated':
    case 'inferred':
      return 'warning';
    case 'self_reported':
    case 'unverified':
    case 'unknown':
    default:
      return 'default';
  }
}

export function useProvenanceLabel(): (provenance: DataProvenance) => string {
  const { t } = useAppTranslation(['evidence']);
  return (provenance) => {
    switch (provenance) {
      case 'self_reported':
        return t('evidence:provenance.self_reported');
      case 'match_derived':
        return t('evidence:provenance.match_derived');
      case 'ai_derived':
        return t('evidence:provenance.ai_derived');
      case 'ai_estimated':
        return t('evidence:provenance.ai_estimated');
      case 'coach_provided':
        return t('evidence:provenance.coach_provided');
      case 'club_provided':
        return t('evidence:provenance.club_provided');
      case 'gps_derived':
        return t('evidence:provenance.gps_derived');
      case 'verified':
        return t('evidence:provenance.verified');
      case 'unverified':
        return t('evidence:provenance.unverified');
      case 'observed':
        return t('evidence:provenance.observed');
      case 'inferred':
        return t('evidence:provenance.inferred');
      case 'unknown':
      default:
        return t('evidence:provenance.unknown');
    }
  };
}

/** Small chip explaining where a value came from. Never hides the "unknown" case. */
export function ProvenanceBadge({ provenance, size = 'sm', className }: ProvenanceBadgeProps) {
  const label = useProvenanceLabel();
  return (
    <Badge
      label={label(provenance)}
      variant={variantFor(provenance)}
      size={size}
      className={className}
    />
  );
}
