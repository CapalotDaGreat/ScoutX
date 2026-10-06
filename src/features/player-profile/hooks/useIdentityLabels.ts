import { useMemo } from 'react';
import {
  type AcademicStatus,
  type ContractStatus,
  type PlayerAvailabilityStatus,
  type PreferredFoot,
  type TransferStatus,
} from '@/features/player-profile/types/footballIdentity';
import { PLAYING_STYLE_OPTIONS } from '@/features/player-profile/constants/footballIdentityOptions';
import { useAppTranslation } from '@/i18n/hooks/useAppTranslation';

type PlayingStyle = (typeof PLAYING_STYLE_OPTIONS)[number];

function isPlayingStyle(value: string): value is PlayingStyle {
  return (PLAYING_STYLE_OPTIONS as readonly string[]).includes(value);
}

export function useIdentityLabels() {
  const { t } = useAppTranslation('portfolio');

  return useMemo(() => {
    const notStated = t('identity.notStated');
    return {
      notStated,
      foot: (value: PreferredFoot | null) =>
        value ? t(`identity.options.foot.${value}`) : notStated,
      contract: (value: ContractStatus | null) =>
        value ? t(`identity.options.contract.${value}`) : notStated,
      availability: (value: PlayerAvailabilityStatus | null) =>
        value ? t(`identity.options.availability.${value}`) : notStated,
      transfer: (value: TransferStatus | null) =>
        value ? t(`identity.options.transfer.${value}`) : notStated,
      academic: (value: AcademicStatus | null) =>
        value ? t(`identity.options.academic.${value}`) : notStated,
      style: (value: string) => {
        if (!value) return notStated;
        return isPlayingStyle(value) ? t(`identity.options.style.${value}`) : value;
      },
      rating: (value: number | null) => (value === null ? notStated : `${value}/5`),
    };
  }, [t]);
}
