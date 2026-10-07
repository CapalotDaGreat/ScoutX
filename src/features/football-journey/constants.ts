import { type JourneyEntryType } from '@/features/football-journey/types';
import {
  Building2,
  ClipboardCheck,
  Crown,
  Flag,
  GraduationCap,
  HeartPulse,
  MapPin,
  Medal,
  PlayCircle,
  Shield,
  Star,
  Target,
  Trophy,
  UserCheck,
  type LucideIcon,
} from 'lucide-react-native';

export type JourneyTypeMeta = {
  icon: LucideIcon;
  accentClass: string;
};

export const JOURNEY_TYPE_META: Record<JourneyEntryType, JourneyTypeMeta> = {
  academy: { icon: GraduationCap, accentClass: 'bg-info-muted' },
  club_transfer: { icon: Building2, accentClass: 'bg-background-secondary' },
  achievement: { icon: Medal, accentClass: 'bg-accent-muted' },
  league_title: { icon: Crown, accentClass: 'bg-warning-muted' },
  cup_win: { icon: Trophy, accentClass: 'bg-warning-muted' },
  international_callup: { icon: Flag, accentClass: 'bg-info-muted' },
  injury: { icon: HeartPulse, accentClass: 'bg-error-muted' },
  recovery: { icon: Shield, accentClass: 'bg-success-muted' },
  trial: { icon: ClipboardCheck, accentClass: 'bg-background-secondary' },
  professional_contract: { icon: Star, accentClass: 'bg-accent-muted' },
  highlight_video: { icon: PlayCircle, accentClass: 'bg-info-muted' },
  coach_recommendation: { icon: UserCheck, accentClass: 'bg-accent-muted' },
  gps_session: { icon: MapPin, accentClass: 'bg-success-muted' },
  statistics_milestone: { icon: Target, accentClass: 'bg-accent-muted' },
};

export const JOURNEY_TYPES = Object.keys(JOURNEY_TYPE_META) as JourneyEntryType[];

export const JOURNEY_FILTER_ALL = 'all' as const;

export type JourneyFilterOption = JourneyEntryType | typeof JOURNEY_FILTER_ALL;
