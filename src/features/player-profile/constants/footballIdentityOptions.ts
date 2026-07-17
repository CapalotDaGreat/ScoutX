import {
  type AcademicStatus,
  type ContractStatus,
  type PlayerAvailabilityStatus,
  type PreferredFoot,
  type TransferStatus,
} from '@/features/player-profile/types/footballIdentity';

export const POSITION_OPTIONS = [
  'Goalkeeper',
  'Centre Back',
  'Left Back',
  'Right Back',
  'Defensive Midfielder',
  'Central Midfielder',
  'Attacking Midfielder',
  'Left Winger',
  'Right Winger',
  'Striker',
  'Centre Forward',
] as const;

export const FORMATION_OPTIONS = [
  '4-3-3',
  '4-2-3-1',
  '4-4-2',
  '3-5-2',
  '3-4-3',
  '4-1-4-1',
  '5-3-2',
] as const;

export const PLAYING_STYLE_OPTIONS = [
  'Possession-based',
  'Direct',
  'Counter-attacking',
  'High press',
  'Wide play',
  'Technical',
  'Physical',
] as const;

export const LEAGUE_OPTIONS = [
  'Premier League',
  'La Liga',
  'Bundesliga',
  'Serie A',
  'Ligue 1',
  'Eredivisie',
  'MLS',
] as const;

export const FOOT_OPTIONS: { label: string; value: PreferredFoot }[] = [
  { label: 'Right', value: 'right' },
  { label: 'Left', value: 'left' },
  { label: 'Both', value: 'both' },
];

export const CONTRACT_STATUS_OPTIONS: { label: string; value: ContractStatus }[] = [
  { label: 'Under Contract', value: 'under_contract' },
  { label: 'Contract Expiring', value: 'expiring' },
  { label: 'Free Agent', value: 'free_agent' },
  { label: 'Youth Contract', value: 'youth_contract' },
];

export const AVAILABILITY_OPTIONS: { label: string; value: PlayerAvailabilityStatus }[] = [
  { label: 'Available', value: 'available' },
  { label: 'Unavailable', value: 'unavailable' },
  { label: 'On Loan', value: 'on_loan' },
  { label: 'Injured', value: 'injured' },
];

export const TRANSFER_STATUS_OPTIONS: { label: string; value: TransferStatus }[] = [
  { label: 'Not For Sale', value: 'not_for_sale' },
  { label: 'Open to Offers', value: 'open_to_offers' },
  { label: 'Listed', value: 'listed' },
  { label: 'Loan Listed', value: 'loan_listed' },
];

export const ACADEMIC_STATUS_OPTIONS: { label: string; value: AcademicStatus }[] = [
  { label: 'In School', value: 'in_school' },
  { label: 'Graduated', value: 'graduated' },
  { label: 'University', value: 'university' },
  { label: 'Not Applicable', value: 'not_applicable' },
];

export const RATING_OPTIONS = [1, 2, 3, 4, 5] as const;

export function getOptionLabel<T extends string>(
  options: { label: string; value: T }[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
