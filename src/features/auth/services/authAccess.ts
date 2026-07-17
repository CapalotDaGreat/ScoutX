import { type AuthRole } from '@/features/auth/types';

export type AuthFeature =
  | 'player.profile.edit'
  | 'player.statistics.log'
  | 'player.gps.track'
  | 'player.trials.manage'
  | 'scout.discovery'
  | 'scout.pipeline'
  | 'scout.reports'
  | 'scout.compare'
  | 'scout.endorse'
  | 'scout.invite';

const playerFeatures: AuthFeature[] = [
  'player.profile.edit',
  'player.statistics.log',
  'player.gps.track',
  'player.trials.manage',
];

/** Guests get the full player toolset plus read-only talent search. */
const guestFeatures: AuthFeature[] = [...playerFeatures, 'scout.discovery'];

const scoutFeatures: AuthFeature[] = [
  'scout.discovery',
  'scout.pipeline',
  'scout.reports',
  'scout.compare',
  'scout.endorse',
  'scout.invite',
];

const coachFeatures: AuthFeature[] = ['scout.discovery', 'scout.endorse'];

const roleFeatureMap: Record<AuthRole, AuthFeature[]> = {
  guest: guestFeatures,
  player: playerFeatures,
  scout: scoutFeatures,
  coach: coachFeatures,
  club: ['scout.discovery'],
};

export function canAccessFeature(role: AuthRole | undefined, feature: AuthFeature): boolean {
  if (!role) {
    return false;
  }
  return roleFeatureMap[role].includes(feature);
}

export function isGuestRole(role: AuthRole | undefined, isAnonymous = false): boolean {
  return isAnonymous || role === 'guest';
}
